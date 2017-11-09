"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
var service_1 = require("./service");
var logger = require("nulllogger");
var paths = require("node-paths");
var path = require("path");
var _ = require("lodash");
var NexusForkServiceCommRegistry = /** @class */ (function () {
    function NexusForkServiceCommRegistry(nexusfork) {
        this._nexusfork = nexusfork;
    }
    NexusForkServiceCommRegistry.prototype.open = function (service, cb) {
        this._nexusfork['_servicesByName'][service].openComm(cb);
    };
    NexusForkServiceCommRegistry.prototype.emit0 = function (service, args) {
        var _this = this;
        var pending = this._nexusfork['_pendingComsByName'][service];
        if (!pending) {
            this._nexusfork['_servicesByName'][service].openComm(function (err, comm) {
                if (err)
                    _this._nexusfork['_pendingComsByName'][service].forEach(function (args) {
                        if (_.isFunction(args[0]))
                            args[0](err);
                    });
                else {
                    _this._nexusfork['_pendingComsByName'][service].forEach(function (args) {
                        if (_.isFunction(args[0]))
                            comm.emitWithErrorHandler.apply(comm, args);
                        else
                            comm.emit.apply(comm, args);
                    });
                    _this._nexusfork['_commsByName'][service] = comm;
                }
                delete _this._nexusfork['_pendingComsByName'][service];
            });
        }
        pending.push(args);
    };
    NexusForkServiceCommRegistry.prototype.emitWithErrorHandler = function (service, event, onerror) {
        var args = [];
        for (var _i = 3; _i < arguments.length; _i++) {
            args[_i - 3] = arguments[_i];
        }
        var comm = this._nexusfork['_commsByName'][service];
        args.unshift(event);
        args.unshift(onerror);
        if (comm)
            comm.emitWithErrorHandler.apply(comm, args);
        else
            this.emit0(service, args);
    };
    NexusForkServiceCommRegistry.prototype.emit = function (service, event) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        var comm = this._nexusfork['_commsByName'][service];
        args.unshift(event);
        if (comm)
            comm.emit.apply(comm, args);
        else
            this.emit0(service, args);
    };
    return NexusForkServiceCommRegistry;
}());
var NexusFork = /** @class */ (function (_super) {
    __extends(NexusFork, _super);
    function NexusFork(config) {
        var addons = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            addons[_i - 1] = arguments[_i];
        }
        var _this = _super.call(this, new logger("cyan:NexusFork")) || this;
        _this._servicesByName = {};
        _this._pendingComsByName = {};
        _this._commsByName = {};
        addons.unshift(config);
        _this.loadConfig.apply(_this, addons);
        return _this;
    }
    NexusFork.prototype.loadConfig = function (config) {
        var _this = this;
        var addons = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            addons[_i - 1] = arguments[_i];
        }
        var rootPath;
        if (!config || _.isString(config)) {
            rootPath = path.resolve(config || require.main.id);
            config = require(path.resolve(rootPath, "package.json"));
        }
        else
            rootPath = process.cwd();
        var _config = config;
        var loadedAddons = [];
        addons.forEach(function (addon) {
            var _addon = require(addon);
            if (_addon['default'])
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
        var webHandlers = {};
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
            loadedAddons.forEach(function (addon) {
                if (addon.prewebhost)
                    addon.prewebhost(key, host);
            });
            var handlers = [];
            host.forEach(function (entry) {
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
                if (entry.root)
                    entry.root = path.resolve(rootPath, entry.root);
                try {
                    entry.handler = _this.searchPaths.resolve("handlers/" + entry.handler + ".js");
                }
                catch (e) { }
                handlers.push(entry);
            });
            this.emit("posthostconfig", key, handlers);
            loadedAddons.forEach(function (addon) {
                if (addon.postwebhost)
                    addon.postwebhost(key, handlers);
            });
            webHandlers[key] = handlers;
        }
        var commRegistry = _config.services && _config.services.length ? new NexusForkServiceCommRegistry(this) : {
            open: function (service, cb) {
                cb(new Error("No services registered with NexusFork."));
            },
            emitWithErrorHandler: function (service, event, cb) {
                var args = [];
                for (var _i = 3; _i < arguments.length; _i++) {
                    args[_i - 3] = arguments[_i];
                }
                cb(new Error("No services registered with NexusFork."));
            },
            emit: function (service, event) {
                var args = [];
                for (var _i = 2; _i < arguments.length; _i++) {
                    args[_i - 2] = arguments[_i];
                }
            }
        };
        if (Object.keys(webHandlers).length)
            this.add(new service_1.DistributedService("web", commRegistry, this._logger, this.searchPaths, webHandlers));
        if (_config.services && _config.services.length)
            _config.services.forEach(function (service) {
                var _service = new service_1.DistributedServiceImpl(service.service, commRegistry, _this._logger, _this.searchPaths, service);
                _this._servicesByName[service.service] = _service;
                _this.add(_service);
            });
    };
    NexusFork.INSTALL_PATH = new paths(path.dirname(__dirname));
    return NexusFork;
}(service_1.ServiceGroup));
exports.NexusFork = NexusFork;
//# sourceMappingURL=nexusfork.js.map