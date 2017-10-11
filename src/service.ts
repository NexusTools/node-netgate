import paths = require("node-paths");
import cluster = require("cluster");
import events = require("events");
import async = require("async");
import path = require("path");
import _ = require("lodash");
import os = require('os');

export enum ServiceState {
    Stopped,
    Starting,
    Started,
    Stopping
}

export abstract class Service extends events.EventEmitter implements Service {
    protected readonly _logger: nulllogger.INullLogger;
    private _state: ServiceState = ServiceState.Stopped;
    private _cbstack: Function[];
    private _quiet: boolean;
    constructor(log: nulllogger.INullLogger, quiet = false) {
        super();
        this._quiet = quiet;
        this._logger = log;
    }
    state() {
        return this._state;
    }
    start(cb: (err?: Error) => void) {
        switch(this._state) {
            case ServiceState.Stopped:
                this._state = ServiceState.Starting;
                this.emit("starting");
                this._cbstack = [cb];
                this.start0((err) => {
                    if(err) {
                        this._state = ServiceState.Stopped;
                        if(!this._quiet)
                            this._logger.error(err);
                        this.emit("error", err);
                        this._cbstack.forEach(function(cb) {
                            cb(err);
                        });
                    } else {
                        this._state = ServiceState.Started;
                        if(!this._quiet)
                            this._logger.info("Started");
                        this.emit("started");
                        this._cbstack.forEach(function(cb) {
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
    stop(cb: (err?: Error) => void) {
        switch(this._state) {
            case ServiceState.Started:
                this._state = ServiceState.Stopping;
                this.emit("stopping");
                this._cbstack = [cb];
                this.stop0((err: Error) => {
                    this._state = ServiceState.Stopped;
                    if(err) {
                        if(!this._quiet)
                            this._logger.error(err);
                        this.emit("error", err);
                        this._cbstack.forEach(function(cb) {
                            cb(err);
                        });
                    } else {
                        if(!this._quiet)
                            this._logger.info("Stopped");
                        this.emit("stopped");
                        this._cbstack.forEach(function(cb) {
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
    protected abstract start0(cb: (err?: Error) => void): void;
    protected abstract stop0(cb: (err?: Error) => void): void;
}

export class ServiceGroup extends Service {
    private _services: Service[] = [];
    constructor(log: nulllogger.INullLogger) {
        super(log, true);
    }
    add(service: Service): void{
        if (this._services.indexOf(service) == -1)
            this._services.push(service);
    }
    remove(service: Service): void{
        const index = this._services.indexOf(service);
        if (index > -1)
            this._services.splice(index, 1);
    }
    protected start0(cb: (err: Error) => void): void{
        var started: Service[] = [];
        async.each(this._services, function(service, cb) {
            service.start(function(err) {
                if(!err)
                    started.push(service);
                cb(err);
            });
        }, function(err: Error) {
            if(err)
                started.forEach(function(service) {
                    service.stop(_.noop);
                });
            cb(err);
        });
    }
    protected stop0(cb: (err: Error) => void): void{
        var err: Error[] = [];
        async.each(this._services, function(service, cb) {
            service.stop(function(e) {
                if(e)
                    err.push(e);
                cb();
            });
        }, function() {
            cb(err.length ? err[0] : undefined);
        });
    }
}

export abstract class BuiltInService extends Service {
    protected readonly _config: any;
    protected readonly _service: string;
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any) {
        super(log, true);
        this._config = config;
        this._service = paths.resolve("services/" + service + ".js");
    }
    protected requireService() {
        return require(this._service)['default'];
    }
    protected newService(): Service{
        const _service = this.requireService();
        return new _service(this._logger, this._config);
    }
}

export class ClusterService extends BuiltInService {
    private _worker: cluster.Worker;
    static readonly WORKER = path.resolve(__dirname, "worker.js");
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any) {
        super(service, log, paths, config);
    }
    protected start0(cb: (err?: Error) => void): void{
        cluster.setupMaster({
            exec: ClusterService.WORKER,
            silent: true,
            args: []
        });
        
        var started: boolean;
        const worker = this._worker = cluster.fork(_.extend({
            service: this._service,
            config: JSON.stringify(this._config)
        }, process.env));
        
        var stdoutline = "";
        worker.process.stdout.on("data", (data) => {
            stdoutline += data;
            while(true) {
                var pos = stdoutline.indexOf("\n");
                if(pos > -1) {
                    var line = stdoutline.substring(0, pos);
                    var p = line.indexOf("]");
                    if(p > -1)
                        line = line.substring(p+2);
                    this._logger.info(line);
                    stdoutline = stdoutline.substring(pos+1);
                } else
                    break;
            }
        });
        worker.process.stdout.resume();
        
        var stderrline = "";
        worker.process.stderr.on("data", (data) => {
            stderrline += data;
            while(true) {
                var pos = stderrline.indexOf("\n");
                if(pos > -1) {
                    var line = stderrline.substring(0, pos);
                    var p = line.indexOf("]");
                    if(p > -1)
                        line = line.substring(p+2);
                    this._logger.info(line);
                    stderrline = stderrline.substring(pos+1);
                } else
                    break;
            }
        });
        worker.process.stderr.resume();
        
        worker.on("message", (msg) => {
            switch(msg.cmd) {
                case "started":
                    started = true;
                    cb();
                    break;
                case "stopped":
                    this._worker = undefined;
                    if(started) {
                        this.stop(_.noop);
                        return;
                    }

                    worker.kill();
                    cb(new Error("Stopped before starting?"));
                    break;
                case "error":
                    if(started)
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
            if(started) {
                this._logger.error(err);
                this.stop(_.noop);
                return;
            }
            
            worker.kill();
            cb(err);
        });
        worker.on("exit", (code, signal) => {
            this._worker = undefined;
            if(started) {
                this._logger.error("Exited", code, signal);
                this.stop(_.noop);
                return;
            }
            
            if(signal)
                cb(new Error("Killed by signal `" + signal + "`"));
            else if(code != 0)
                cb(new Error("Exited with code " + code));
            else
                cb(new Error("Exited"));
        });
    }
    protected stop0(_cb: (err?: Error) => void): void{
        if(!this._worker)
            return _cb();
        
        this._worker.send({
            cmd: "stop"
        });
        const worker = this._worker;
        const cb = (err?) => {
            if(worker != this._worker)
                return;
                
            worker.removeAllListeners("exit");
            worker.removeAllListeners("error");
            worker.removeAllListeners("message");
            this._worker = undefined;
            _cb(err);
        }
        worker.removeAllListeners("exit");
        worker.removeAllListeners("error");
        worker.removeAllListeners("message");
        worker.on("message", (msg) => {
            switch(msg.cmd) {
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
        worker.on("error", function(err) {
            worker.kill();
            cb(err);
        });
        worker.on("exit", function(code, signal) {
            if(signal)
                cb(new Error("Killed by signal `" + signal + "`"));
            else if(code != 0)
                cb(new Error("Exited with code " + code));
            else
                cb();
        });
    }
}

export class LocalService extends BuiltInService {
    private _impl: Service;
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any) {
        super(service, log, paths, config);
        this._impl = this.newService();
    }
    protected start0(cb: (err?: Error) => void): void{
        this._impl.start(cb);
    }
    protected stop0(cb: (err?: Error) => void): void{
        this._impl.stop(cb);
    }
}

const WorkerCount = process.env['WORKER_COUNT'];
const CPUCount = Math.max(1, (WorkerCount && parseInt(WorkerCount)) || os.cpus().length);
const DistributedServiceImpl = CPUCount > 1 ? ClusterService : LocalService;

export class DistributedService extends ServiceGroup {
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any) {
        super(log.extend(service));
        if(CPUCount > 1)
            for(var i=0; i<CPUCount; i++) {
                this.add(new DistributedServiceImpl(service, this._logger.extend("" + (i+1)), paths, config));
            }
        else
            this.add(new DistributedServiceImpl(service, this._logger, paths, config));
    }
}

// TODO: Add CloudService for linking nexusfork instances together across servers