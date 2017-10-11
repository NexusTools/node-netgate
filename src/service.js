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
var Service = (function (_super) {
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
    Service.prototype.start = function (cb) {
        var _this = this;
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
var ServiceGroup = (function (_super) {
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
var BuiltInService = (function (_super) {
    __extends(BuiltInService, _super);
    function BuiltInService(service, log, paths, config) {
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
        return new _service(this._logger, this._config);
    };
    return BuiltInService;
}(Service));
exports.BuiltInService = BuiltInService;
var ClusterService = (function (_super) {
    __extends(ClusterService, _super);
    function ClusterService(service, log, paths, config) {
        return _super.call(this, service, log, paths, config) || this;
    }
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
var LocalService = (function (_super) {
    __extends(LocalService, _super);
    function LocalService(service, log, paths, config) {
        var _this = _super.call(this, service, log, paths, config) || this;
        _this._impl = _this.newService();
        return _this;
    }
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
var DistributedServiceImpl = CPUCount > 1 ? ClusterService : LocalService;
var DistributedService = (function (_super) {
    __extends(DistributedService, _super);
    function DistributedService(service, log, paths, config) {
        var _this = _super.call(this, log.extend(service)) || this;
        if (CPUCount > 1)
            for (var i = 0; i < CPUCount; i++) {
                _this.add(new DistributedServiceImpl(service, _this._logger.extend("" + (i + 1)), paths, config));
            }
        else
            _this.add(new DistributedServiceImpl(service, _this._logger, paths, config));
        return _this;
    }
    return DistributedService;
}(ServiceGroup));
exports.DistributedService = DistributedService;
//# sourceMappingURL=service.js.map