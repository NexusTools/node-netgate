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
var cluster = require("cluster");
var events = require("events");
var crypto = require("crypto");
var async = require("async");
var path = require("path");
var _ = require("lodash");
var os = require("os");
var ServiceState;
(function (ServiceState) {
    ServiceState[ServiceState["Stopped"] = 0] = "Stopped";
    ServiceState[ServiceState["Starting"] = 1] = "Starting";
    ServiceState[ServiceState["Started"] = 2] = "Started";
    ServiceState[ServiceState["Stopping"] = 3] = "Stopping";
})(ServiceState = exports.ServiceState || (exports.ServiceState = {}));
var Service = /** @class */ (function (_super) {
    __extends(Service, _super);
    function Service(log, quiet) {
        if (quiet === void 0) { quiet = false; }
        var _this = _super.call(this) || this;
        _this._state = ServiceState.Stopped;
        _this._quiet = quiet;
        _this._logger = log;
        return _this;
    }
    Service.prototype.state = function () {
        return this._state;
    };
    Service.prototype.openComm = function (cb) {
        var _this = this;
        switch (this._state) {
            case ServiceState.Started:
                this.openComm0(cb);
                break;
            case ServiceState.Starting:
                this._cbstack.push(function (err) {
                    if (err)
                        cb(err);
                    else
                        _this.openComm(cb);
                });
                break;
            default:
                cb(new Error("Cannot stop service while in `" + ServiceState[this._state] + "` state"));
        }
    };
    Service.prototype.start = function (cb) {
        var _this = this;
        if (!cb)
            cb = function (err) {
                _this.emit("error", err);
            };
        switch (this._state) {
            case ServiceState.Stopped:
                this._state = ServiceState.Starting;
                this.emit("starting");
                this._cbstack = [cb];
                this.start0(function (err) {
                    if (err) {
                        _this._state = ServiceState.Stopped;
                        if (!_this._quiet)
                            _this._logger.error(err);
                        _this.emit("error", err);
                        _this._cbstack.forEach(function (cb) {
                            cb(err);
                        });
                    }
                    else {
                        _this._state = ServiceState.Started;
                        if (!_this._quiet)
                            _this._logger.info("Started");
                        _this.emit("started");
                        _this._cbstack.forEach(function (cb) {
                            cb();
                        });
                    }
                });
                break;
            case ServiceState.Starting:
                this._cbstack.push(cb);
                break;
            case ServiceState.Started:
                cb();
                break;
            default:
                cb(new Error("Cannot start service while in `" + ServiceState[this._state] + "` state"));
        }
    };
    Service.prototype.stop = function (cb) {
        var _this = this;
        if (!cb)
            cb = function (err) {
                _this.emit("error", err);
            };
        switch (this._state) {
            case ServiceState.Started:
                this._state = ServiceState.Stopping;
                this.emit("stopping");
                this._cbstack = [cb];
                this.stop0(function (err) {
                    _this._state = ServiceState.Stopped;
                    if (err) {
                        if (!_this._quiet)
                            _this._logger.error(err);
                        _this.emit("error", err);
                        _this._cbstack.forEach(function (cb) {
                            cb(err);
                        });
                    }
                    else {
                        if (!_this._quiet)
                            _this._logger.info("Stopped");
                        _this.emit("stopped");
                        _this._cbstack.forEach(function (cb) {
                            cb();
                        });
                    }
                });
                break;
            case ServiceState.Stopping:
                this._cbstack.push(cb);
                break;
            case ServiceState.Stopped:
                cb();
                break;
            default:
                cb(new Error("Cannot stop service while in `" + ServiceState[this._state] + "` state"));
        }
    };
    return Service;
}(events.EventEmitter));
exports.Service = Service;
var SimpleCommService = /** @class */ (function (_super) {
    __extends(SimpleCommService, _super);
    function SimpleCommService() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._events = {};
        return _this;
    }
    SimpleCommService.prototype.openComm0 = function (cb) {
        var self = this;
        var myEvents = {};
        cb(undefined, {
            emit: function (event) {
                var args = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    args[_i - 1] = arguments[_i];
                }
                args.unshift(event);
                args.unshift(undefined);
                self.handleCommEmit.apply(self, args);
            },
            emitWithErrorHandler: function (onerror, event) {
                var args = [];
                for (var _i = 2; _i < arguments.length; _i++) {
                    args[_i - 2] = arguments[_i];
                }
                self.handleCommEmit.apply(self, arguments);
            },
            off: function (event, cb) {
                if (cb) {
                    var events = self._events[event];
                    if (events) {
                        if (events.indexOf(cb) == -1)
                            events.push(cb);
                    }
                    else
                        events = self._events[event] = [cb];
                }
                else
                    delete self._events[event];
            },
            on: function (event, cb) {
                var events = self._events[event];
                if (!events)
                    events = self._events[event] = [];
                events.push(cb);
            },
            close: function () {
            }
        });
    };
    SimpleCommService.prototype.hasEvent = function (event) {
        return true;
    };
    return SimpleCommService;
}(Service));
exports.SimpleCommService = SimpleCommService;
var ServiceGroup = /** @class */ (function (_super) {
    __extends(ServiceGroup, _super);
    function ServiceGroup(log) {
        var _this = _super.call(this, log, true) || this;
        _this._services = [];
        return _this;
    }
    ServiceGroup.prototype.add = function (service) {
        if (this._services.indexOf(service) == -1)
            this._services.push(service);
    };
    ServiceGroup.prototype.remove = function (service) {
        var index = this._services.indexOf(service);
        if (index > -1)
            this._services.splice(index, 1);
    };
    ServiceGroup.prototype.openComm0 = function (cb) {
        cb(new Error("ServiceGroup's do not support ServiceComm..."));
    };
    ServiceGroup.prototype.start0 = function (cb) {
        var started = [];
        async.each(this._services, function (service, cb) {
            service.start(function (err) {
                if (!err)
                    started.push(service);
                cb(err);
            });
        }, function (err) {
            if (err)
                started.forEach(function (service) {
                    service.stop(_.noop);
                });
            cb(err);
        });
    };
    ServiceGroup.prototype.stop0 = function (cb) {
        var err = [];
        async.each(this._services, function (service, cb) {
            service.stop(function (e) {
                if (e)
                    err.push(e);
                cb();
            });
        }, function () {
            cb(err.length ? err[0] : undefined);
        });
    };
    return ServiceGroup;
}(Service));
exports.ServiceGroup = ServiceGroup;
var BuiltInService = /** @class */ (function (_super) {
    __extends(BuiltInService, _super);
    function BuiltInService(service, commRegistry, log, paths, config) {
        var _this = _super.call(this, log, true) || this;
        _this._config = config;
        _this._service = paths.resolve("services/" + service + ".js");
        return _this;
    }
    BuiltInService.prototype.requireService = function () {
        return require(this._service)['default'];
    };
    BuiltInService.prototype.newService = function () {
        var _service = this.requireService();
        return new _service(this._logger, this._config, this._commRegistry);
    };
    return BuiltInService;
}(Service));
exports.BuiltInService = BuiltInService;
var ClusterServiceComm = /** @class */ (function () {
    function ClusterServiceComm() {
    }
    ClusterServiceComm.prototype.emit = function (event) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
    };
    ClusterServiceComm.prototype.emitWithErrorHandler = function (onerror, event) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
    };
    ClusterServiceComm.prototype.on = function (event, cb) {
    };
    ClusterServiceComm.prototype.off = function (event, cb) {
    };
    ClusterServiceComm.prototype.close = function () {
    };
    return ClusterServiceComm;
}());
var ClusterService = /** @class */ (function (_super) {
    __extends(ClusterService, _super);
    function ClusterService(service, commRegistry, log, paths, config) {
        var _this = _super.call(this, service, commRegistry, log, paths, config) || this;
        _this._pendingComms = {};
        _this._comms = {};
        return _this;
    }
    ClusterService.prototype.openComm0 = function (cb) {
        var _this = this;
        crypto.randomBytes(48, function (err, bytes) {
            if (err)
                return cb(err);
            var uid = bytes.toString('hex');
            _this._worker.send({
                cmd: "openComm",
                uid: uid
            });
            _this._pendingComms[uid] = cb;
        });
    };
    ClusterService.prototype.start0 = function (cb) {
        var _this = this;
        cluster.setupMaster({
            exec: ClusterService.WORKER,
            silent: true,
            args: []
        });
        var started;
        var worker = this._worker = cluster.fork(_.extend({
            service: this._service,
            config: JSON.stringify(this._config)
        }, process.env));
        var stdoutline = "";
        worker.process.stdout.on("data", function (data) {
            stdoutline += data;
            while (true) {
                var pos = stdoutline.indexOf("\n");
                if (pos > -1) {
                    var line = stdoutline.substring(0, pos);
                    var p = line.indexOf("]");
                    if (p > -1)
                        line = line.substring(p + 2);
                    _this._logger.info(line);
                    stdoutline = stdoutline.substring(pos + 1);
                }
                else
                    break;
            }
        });
        worker.process.stdout.resume();
        var stderrline = "";
        worker.process.stderr.on("data", function (data) {
            stderrline += data;
            while (true) {
                var pos = stderrline.indexOf("\n");
                if (pos > -1) {
                    var line = stderrline.substring(0, pos);
                    var p = line.indexOf("]");
                    if (p > -1)
                        line = line.substring(p + 2);
                    _this._logger.info(line);
                    stderrline = stderrline.substring(pos + 1);
                }
                else
                    break;
            }
        });
        worker.process.stderr.resume();
        worker.on("message", function (msg) {
            switch (msg.cmd) {
                case "commOpened":
                    _this._pendingComms[msg.uid](undefined, _this._comms[msg.uid] = new ClusterServiceComm());
                    delete _this._pendingComms[msg.uid];
                    break;
                case "commErrored":
                    _this._pendingComms[msg.uid](new Error(msg.message));
                    delete _this._pendingComms[msg.uid];
                    break;
                case "started":
                    started = true;
                    cb();
                    break;
                case "stopped":
                    _this._worker = undefined;
                    if (started) {
                        _this.stop(_.noop);
                        return;
                    }
                    worker.kill();
                    cb(new Error("Stopped before starting?"));
                    break;
                case "error":
                    if (started)
                        _this.stop(_.noop);
                    else
                        cb(new Error(msg.message));
                    break;
                default:
                    _this._logger.warn("Unhandled message", msg);
            }
        });
        worker.on("error", function (err) {
            _this._worker = undefined;
            if (started) {
                _this._logger.error(err);
                _this.stop(_.noop);
                return;
            }
            worker.kill();
            cb(err);
        });
        worker.on("exit", function (code, signal) {
            _this._worker = undefined;
            if (started) {
                _this._logger.error("Exited", code, signal);
                _this.stop(_.noop);
                return;
            }
            if (signal)
                cb(new Error("Killed by signal `" + signal + "`"));
            else if (code != 0)
                cb(new Error("Exited with code " + code));
            else
                cb(new Error("Exited"));
        });
    };
    ClusterService.prototype.stop0 = function (_cb) {
        var _this = this;
        this._comms = {};
        if (!this._worker)
            return _cb();
        this._worker.send({
            cmd: "stop"
        });
        var worker = this._worker;
        var cb = function (err) {
            if (worker != _this._worker)
                return;
            worker.removeAllListeners("exit");
            worker.removeAllListeners("error");
            worker.removeAllListeners("message");
            _this._worker = undefined;
            _cb(err);
        };
        worker.removeAllListeners("exit");
        worker.removeAllListeners("error");
        worker.removeAllListeners("message");
        worker.on("message", function (msg) {
            switch (msg.cmd) {
                case "stopped":
                    worker.send({
                        cmd: "exit"
                    });
                    break;
                case "error":
                    worker.kill();
                    cb(new Error(msg.message));
            }
        });
        worker.on("error", function (err) {
            worker.kill();
            cb(err);
        });
        worker.on("exit", function (code, signal) {
            if (signal)
                cb(new Error("Killed by signal `" + signal + "`"));
            else if (code != 0)
                cb(new Error("Exited with code " + code));
            else
                cb();
        });
    };
    ClusterService.WORKER = path.resolve(__dirname, "worker.js");
    return ClusterService;
}(BuiltInService));
exports.ClusterService = ClusterService;
var LocalService = /** @class */ (function (_super) {
    __extends(LocalService, _super);
    function LocalService(service, commRegistry, log, paths, config) {
        var _this = _super.call(this, service, commRegistry, log, paths, config) || this;
        _this._impl = _this.newService();
        return _this;
    }
    LocalService.prototype.openComm0 = function (cb) {
        this._impl.openComm(cb);
    };
    LocalService.prototype.start0 = function (cb) {
        this._impl.start(cb);
    };
    LocalService.prototype.stop0 = function (cb) {
        this._impl.stop(cb);
    };
    return LocalService;
}(BuiltInService));
exports.LocalService = LocalService;
var WorkerCount = process.env['WORKER_COUNT'];
var CPUCount = Math.max(1, (WorkerCount && parseInt(WorkerCount)) || os.cpus().length);
exports.DistributedServiceImpl = CPUCount > 1 ? ClusterService : LocalService;
var DistributedService = /** @class */ (function (_super) {
    __extends(DistributedService, _super);
    function DistributedService(service, commRegistry, log, paths, config) {
        var _this = _super.call(this, log.extend(service)) || this;
        if (CPUCount > 1)
            for (var i = 0; i < CPUCount; i++) {
                _this.add(new exports.DistributedServiceImpl(service, commRegistry, _this._logger.extend("" + (i + 1)), paths, config));
            }
        else
            _this.add(new exports.DistributedServiceImpl(service, commRegistry, _this._logger, paths, config));
        return _this;
    }
    return DistributedService;
}(ServiceGroup));
exports.DistributedService = DistributedService;
// TODO: Add CloudService for linking nexusfork instances together across servers 
//# sourceMappingURL=service.js.map