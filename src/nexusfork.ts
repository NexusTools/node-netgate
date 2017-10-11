import { ServiceGroup, DistributedService } from "./service";
import logger = require("nulllogger");
import paths = require("node-paths");
import { nexusfork } from "../types";
import path = require("path");
import _ = require("lodash");

export class NexusFork extends ServiceGroup {
    readonly searchPaths: paths;
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
            value: NexusFork.INSTALL_PATH.get(rootPath, NexusFork.INSTALL_PATH)
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
        
        if(Object.keys(webHandlers).length) {
            this.add(new DistributedService("web", this._logger, this.searchPaths, webHandlers));
        }
    }
}