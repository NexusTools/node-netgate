/// <reference types="node" />
import paths = require("node-paths");
import events = require("events");
export declare enum ServiceState {
    Stopped = 0,
    Starting = 1,
    Started = 2,
    Stopping = 3,
}
export declare abstract class Service extends events.EventEmitter implements Service {
    protected readonly _logger: nulllogger.INullLogger;
    private _state;
    private _cbstack;
    private _quiet;
    constructor(log: nulllogger.INullLogger, quiet?: boolean);
    state(): ServiceState;
    start(cb: (err?: Error) => void): void;
    stop(cb: (err?: Error) => void): void;
    protected abstract start0(cb: (err?: Error) => void): void;
    protected abstract stop0(cb: (err?: Error) => void): void;
}
export declare class ServiceGroup extends Service {
    private _services;
    constructor(log: nulllogger.INullLogger);
    add(service: Service): void;
    remove(service: Service): void;
    protected start0(cb: (err: Error) => void): void;
    protected stop0(cb: (err: Error) => void): void;
}
export declare abstract class BuiltInService extends Service {
    protected readonly _config: any;
    protected readonly _service: string;
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any);
    protected requireService(): any;
    protected newService(): Service;
}
export declare class ClusterService extends BuiltInService {
    private _worker;
    static readonly WORKER: string;
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any);
    protected start0(cb: (err?: Error) => void): void;
    protected stop0(_cb: (err?: Error) => void): void;
}
export declare class LocalService extends BuiltInService {
    private _impl;
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any);
    protected start0(cb: (err?: Error) => void): void;
    protected stop0(cb: (err?: Error) => void): void;
}
export declare class DistributedService extends ServiceGroup {
    constructor(service: string, log: nulllogger.INullLogger, paths: paths, config: any);
}
