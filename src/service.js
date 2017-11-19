"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cluster = require("cluster");
const events = require("events");
const crypto = require("crypto");
const async = require("async");
const path = require("path");
const _ = require("lodash");
const os = require("os");
var ServiceState;
(function (ServiceState) {
    ServiceState[ServiceState["Stopped"] = 0] = "Stopped";
    ServiceState[ServiceState["Starting"] = 1] = "Starting";
    ServiceState[ServiceState["Started"] = 2] = "Started";
    ServiceState[ServiceState["Stopping"] = 3] = "Stopping";
})(ServiceState = exports.ServiceState || (exports.ServiceState = {}));
class Service extends events.EventEmitter {
    constructor(log, quiet = false) {
        super();
        this._state = ServiceState.Stopped;
        this._quiet = quiet;
        this._logger = log;
    }
    state() {
        return this._state;
    }
    openComm(cb) {
        switch (this._state) {
            case ServiceState.Started:
                this.openComm0(cb);
                break;
            case ServiceState.Starting:
                this._cbstack.push((err) => {
                    if (err)
                        cb(err);
                    else
                        this.openComm(cb);
                });
                break;
            default:
                cb(new Error("Cannot stop service while in `" + ServiceState[this._state] + "` state"));
        }
    }
    start(cb) {
        if (!cb)
            cb = (err) => {
                this.emit("error", err);
            };
        switch (this._state) {
            case ServiceState.Stopped:
                this._state = ServiceState.Starting;
                this.emit("starting");
                this._cbstack = [cb];
                this.start0((err) => {
                    if (err) {
                        this._state = ServiceState.Stopped;
                        if (!this._quiet)
                            this._logger.error(err);
                        this.emit("error", err);
                        this._cbstack.forEach(function (cb) {
                            cb(err);
                        });
                    }
                    else {
                        this._state = ServiceState.Started;
                        if (!this._quiet)
                            this._logger.info("Started");
                        this.emit("started");
                        this._cbstack.forEach(function (cb) {
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
    }
    stop(cb) {
        if (!cb)
            cb = (err) => {
                this.emit("error", err);
            };
        switch (this._state) {
            case ServiceState.Started:
                this._state = ServiceState.Stopping;
                this.emit("stopping");
                this._cbstack = [cb];
                this.stop0((err) => {
                    this._state = ServiceState.Stopped;
                    if (err) {
                        if (!this._quiet)
                            this._logger.error(err);
                        this.emit("error", err);
                        this._cbstack.forEach(function (cb) {
                            cb(err);
                        });
                    }
                    else {
                        if (!this._quiet)
                            this._logger.info("Stopped");
                        this.emit("stopped");
                        this._cbstack.forEach(function (cb) {
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
    }
}
exports.Service = Service;
class SimpleCommService extends Service {
    constructor() {
        super(...arguments);
        this._events = {};
    }
    openComm0(cb) {
        const self = this;
        const myEvents = {};
        cb(undefined, {
            emit(event, ...args) {
                args.unshift(event);
                args.unshift(undefined);
                self.handleCommEmit.apply(self, args);
            },
            emitWithErrorHandler(onerror, event, ...args) {
                self.handleCommEmit.apply(self, arguments);
            },
            off(event, cb) {
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
            on(event, cb) {
                var events = self._events[event];
                if (!events)
                    events = self._events[event] = [];
                events.push(cb);
            },
            close() {
            }
        });
    }
    hasEvent(event) {
        return true;
    }
}
exports.SimpleCommService = SimpleCommService;
class ServiceGroup extends Service {
    constructor(log) {
        super(log, true);
        this._services = [];
    }
    add(service) {
        if (this._services.indexOf(service) == -1)
            this._services.push(service);
    }
    remove(service) {
        const index = this._services.indexOf(service);
        if (index > -1)
            this._services.splice(index, 1);
    }
    openComm0(cb) {
        cb(new Error("ServiceGroup's do not support ServiceComm..."));
    }
    start0(cb) {
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
    }
    stop0(cb) {
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
    }
}
exports.ServiceGroup = ServiceGroup;
class BuiltInService extends Service {
    constructor(service, commRegistry, log, paths, config) {
        super(log, true);
        this._config = config;
        this._service = paths.resolve("services/" + service + ".js");
    }
    requireService() {
        return require(this._service)['default'];
    }
    newService() {
        const _service = this.requireService();
        return new _service(this._logger, this._config, this._commRegistry);
    }
}
exports.BuiltInService = BuiltInService;
class ClusterServiceComm {
    emit(event, ...args) {
    }
    emitWithErrorHandler(onerror, event, ...args) {
    }
    on(event, cb) {
    }
    off(event, cb) {
    }
    close() {
    }
}
class ClusterService extends BuiltInService {
    constructor(service, commRegistry, log, paths, config) {
        super(service, commRegistry, log, paths, config);
        this._pendingComms = {};
        this._comms = {};
    }
    openComm0(cb) {
        crypto.randomBytes(48, (err, bytes) => {
            if (err)
                return cb(err);
            const uid = bytes.toString('hex');
            this._worker.send({
                cmd: "openComm",
                uid
            });
            this._pendingComms[uid] = cb;
        });
    }
    start0(cb) {
        cluster.setupMaster({
            exec: ClusterService.WORKER,
            silent: true,
            args: []
        });
        var started;
        const worker = this._worker = cluster.fork(_.extend({
            service: this._service,
            config: JSON.stringify(this._config)
        }, process.env));
        var stdoutline = "";
        worker.process.stdout.on("data", (data) => {
            stdoutline += data;
            while (true) {
                var pos = stdoutline.indexOf("\n");
                if (pos > -1) {
                    var line = stdoutline.substring(0, pos);
                    var p = line.indexOf("]");
                    if (p > -1)
                        line = line.substring(p + 2);
                    this._logger.info(line);
                    stdoutline = stdoutline.substring(pos + 1);
                }
                else
                    break;
            }
        });
        worker.process.stdout.resume();
        var stderrline = "";
        worker.process.stderr.on("data", (data) => {
            stderrline += data;
            while (true) {
                var pos = stderrline.indexOf("\n");
                if (pos > -1) {
                    var line = stderrline.substring(0, pos);
                    var p = line.indexOf("]");
                    if (p > -1)
                        line = line.substring(p + 2);
                    this._logger.info(line);
                    stderrline = stderrline.substring(pos + 1);
                }
                else
                    break;
            }
        });
        worker.process.stderr.resume();
        worker.on("message", (msg) => {
            switch (msg.cmd) {
                case "commOpened":
                    this._pendingComms[msg.uid](undefined, this._comms[msg.uid] = new ClusterServiceComm());
                    delete this._pendingComms[msg.uid];
                    break;
                case "commErrored":
                    this._pendingComms[msg.uid](new Error(msg.message));
                    delete this._pendingComms[msg.uid];
                    break;
                case "started":
                    started = true;
                    cb();
                    break;
                case "stopped":
                    this._worker = undefined;
                    if (started) {
                        this.stop(_.noop);
                        return;
                    }
                    worker.kill();
                    cb(new Error("Stopped before starting?"));
                    break;
                case "error":
                    if (started)
                        this.stop(_.noop);
                    else
                        cb(new Error(msg.message));
                    break;
                default:
                    this._logger.warn("Unhandled message", msg);
            }
        });
        worker.on("error", (err) => {
            this._worker = undefined;
            if (started) {
                this._logger.error(err);
                this.stop(_.noop);
                return;
            }
            worker.kill();
            cb(err);
        });
        worker.on("exit", (code, signal) => {
            this._worker = undefined;
            if (started) {
                this._logger.error("Exited", code, signal);
                this.stop(_.noop);
                return;
            }
            if (signal)
                cb(new Error("Killed by signal `" + signal + "`"));
            else if (code != 0)
                cb(new Error("Exited with code " + code));
            else
                cb(new Error("Exited"));
        });
    }
    stop0(_cb) {
        this._comms = {};
        if (!this._worker)
            return _cb();
        this._worker.send({
            cmd: "stop"
        });
        const worker = this._worker;
        const cb = (err) => {
            if (worker != this._worker)
                return;
            worker.removeAllListeners("exit");
            worker.removeAllListeners("error");
            worker.removeAllListeners("message");
            this._worker = undefined;
            _cb(err);
        };
        worker.removeAllListeners("exit");
        worker.removeAllListeners("error");
        worker.removeAllListeners("message");
        worker.on("message", (msg) => {
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
    }
}
ClusterService.WORKER = path.resolve(__dirname, "worker.js");
exports.ClusterService = ClusterService;
class LocalService extends BuiltInService {
    constructor(service, commRegistry, log, paths, config) {
        super(service, commRegistry, log, paths, config);
        this._impl = this.newService();
    }
    openComm0(cb) {
        this._impl.openComm(cb);
    }
    start0(cb) {
        this._impl.start(cb);
    }
    stop0(cb) {
        this._impl.stop(cb);
    }
}
exports.LocalService = LocalService;
const WorkerCount = process.env['WORKER_COUNT'];
const CPUCount = Math.max(1, (WorkerCount && parseInt(WorkerCount)) || os.cpus().length);
exports.DistributedServiceImpl = CPUCount > 1 ? ClusterService : LocalService;
class DistributedService extends ServiceGroup {
    constructor(service, commRegistry, log, paths, config) {
        super(log.extend(service));
        if (CPUCount > 1)
            for (var i = 0; i < CPUCount; i++) {
                this.add(new exports.DistributedServiceImpl(service, commRegistry, this._logger.extend("" + (i + 1)), paths, config));
            }
        else
            this.add(new exports.DistributedServiceImpl(service, commRegistry, this._logger, paths, config));
    }
}
exports.DistributedService = DistributedService;
// TODO: Add CloudService for linking nexusfork instances together across servers 
//# sourceMappingURL=service.js.map