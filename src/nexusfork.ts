import { Service, ServiceGroup, DistributedService, DistributedServiceImpl } from "./service";
import logger = require("nulllogger");
import paths = require("node-paths");
import { nexusfork } from "../types";
import path = require("path");
import _ = require("lodash");

class NexusForkServiceCommRegistry implements nexusfork.ServiceCommRegistry {
    private _nexusfork: NexusFork;
    constructor(nexusfork: NexusFork) {
        this._nexusfork = nexusfork;
    }
    open(service: string, cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void{
        this._nexusfork['_servicesByName'][service].openComm(cb);
    }
    emit0(service: string, args: any[]) {
        const pending = this._nexusfork['_pendingComsByName'][service];
        if(!pending) {
            this._nexusfork['_servicesByName'][service].openComm((err, comm) => {
                if(err)
                    this._nexusfork['_pendingComsByName'][service].forEach((args) => {
                        if(_.isFunction(args[0]))
                            args[0](err);
                    });
                else {
                    this._nexusfork['_pendingComsByName'][service].forEach(function(args) {
                        if(_.isFunction(args[0]))
                            comm.emitWithErrorHandler.apply(comm, args);
                        else
                            comm.emit.apply(comm, args);
                    });
                    this._nexusfork['_commsByName'][service] = comm;
                }
                delete this._nexusfork['_pendingComsByName'][service];
            });
        }
        pending.push(args);
    }
    emitWithErrorHandler(service: string, event: string, onerror: (err: Error) => void, ...args: any[]): void{
        var comm = this._nexusfork['_commsByName'][service];
        args.unshift(event);
        args.unshift(onerror);
        if(comm)
            comm.emitWithErrorHandler.apply(comm, args);
        else
            this.emit0(service, args);
    }
    emit(service: string, event: string, ...args: any[]): void{
        var comm = this._nexusfork['_commsByName'][service];
        args.unshift(event);
        if(comm)
            comm.emit.apply(comm, args);
        else
            this.emit0(service, args);
    }
}

export class NexusFork extends ServiceGroup {
    readonly searchPaths: paths;
    private readonly _servicesByName: {[index: string]: Service} = {};
    private readonly _pendingComsByName: {[index: string]: any[][]} = {};
    private readonly _commsByName: {[index: string]: nexusfork.ServiceComm} = {};
    static readonly INSTALL_PATH = new paths(path.dirname(__dirname));
    constructor(config?: string|nexusfork.Config, ...addons: string[]) {
        super(new logger("cyan:NexusFork"));
        addons.unshift(config as any);
        this.loadConfig.apply(this, addons);
    }
    loadConfig(config?: string|nexusfork.Config, ...addons: string[]) {
        var rootPath: string;
        if (!config || _.isString(config)) {
            rootPath = path.resolve(config || require.main.id);
            config = require(path.resolve(rootPath, "package.json"));
        } else
            rootPath = process.cwd();
            
        const _config = config as nexusfork.Config;
        
        const loadedAddons: nexusfork.Addon[] = [];
        addons.forEach(function(addon) {
            var _addon = require(addon);
            if(_addon['default'])
                _addon = _addon['default'];
            if (_.isFunction(_addon))
                _addon = _addon(this);
            loadedAddons.push(_addon);
        });
        
        Object.defineProperty(this, "searchPaths", {
            value: NexusFork.INSTALL_PATH.get(rootPath)
        });

        this._logger.info("Preparing", _config.name, "V" + _config.version);
        if (_config.description)
            this._logger.info("  ", _config.description);
        this._logger.info("");
        
        if (_config.wwwroot)
            _config.hosts = {
                "*": _config.wwwroot
            };
        else if (_config.wwwapp)
            _config.hosts = {
                "*": _config.wwwapp
            };

        if (!_config.hosts)
            throw new Error("Expected `hosts` or `wwwroot` in configuration");

        if (!_.isObject(_config.hosts))
            throw new Error("`hosts` must be an Object, where the key is a host pattern and the value is the host configuration");

        const webHandlers: {[index: string]: nexusfork.WebHandlerConfig[]} = {};
        for (var key in _config.hosts) {
            var host = _config.hosts[key];

            if (!_.isArray(host)) {
                if (_.isObject(host) || _.isString(host))
                    host = [{
                        handler: "static",
                        root: host
                    }];
                else
                    throw new Error("Host value must be a `String`, `Array` or `Object`");
            }
            
            this.emit("prehostconfig", key, host);
            loadedAddons.forEach(function(addon) {
                if (addon.prewebhost)
                    addon.prewebhost(key, host as any);
            });

            var handlers: nexusfork.WebHandlerConfig[] = [];
            host.forEach((entry) => {
                if (_.isString(entry))
                    entry = {
                        handler: "static",
                        root: entry
                    };
                else if (!entry.handler) {
                    if (entry.root)
                        entry.handler = "static";
                    else
                        throw new Error("Missing handler " + JSON.stringify(entry));
                }
                if(entry.root)
                    entry.root = path.resolve(rootPath, entry.root);

                try {
                    entry.handler = this.searchPaths.resolve("handlers/" + entry.handler + ".js");
                } catch (e) {}
                handlers.push(entry);
            });
            
            this.emit("posthostconfig", key, handlers);
            loadedAddons.forEach(function(addon) {
                if (addon.postwebhost)
                    addon.postwebhost(key, handlers);
            });

            webHandlers[key] = handlers;
        }
        
        const commRegistry: nexusfork.ServiceCommRegistry = _config.services && _config.services.length ? new NexusForkServiceCommRegistry(this) : {
            open(service, cb): void{
                cb(new Error("No services registered with NexusFork."));
            },
            emitWithErrorHandler(service, event, cb, ...args: any[]): void{
                cb(new Error("No services registered with NexusFork."));
            },
            emit(service, event, ...args): void{}
        };
        
        if(Object.keys(webHandlers).length)
            this.add(new DistributedService("web", commRegistry, this._logger, this.searchPaths, webHandlers));
            
        if (_config.services && _config.services.length)
            _config.services.forEach((service) => {
                const _service = new DistributedServiceImpl(service.service, commRegistry, this._logger, this.searchPaths, service);
                this._servicesByName[service.service] = _service;
                this.add(_service);
            });
    }
}