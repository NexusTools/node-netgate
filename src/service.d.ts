/// <reference types="node" />
import paths = require("node-paths");
import { nexusfork } from "../types";
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
    openComm(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void;
    start(cb?: (err?: Error) => void): void;
    stop(cb?: (err?: Error) => void): void;
    protected abstract openComm0(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void;
    protected abstract start0(cb: (err?: Error) => void): void;
    protected abstract stop0(cb: (err?: Error) => void): void;
}
export declare abstract class SimpleCommService extends Service {
    protected _events: {
        [event: string]: Function[];
    };
    protected openComm0(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void;
    protected abstract handleCommEmit(onerror: (err: Error) => void, event: string, ...args: any[]): void;
    protected hasEvent(event: string): boolean;
}
export declare class ServiceGroup extends Service {
    private _services;
    constructor(log: nulllogger.INullLogger);
    add(service: Service): void;
    remove(service: Service): void;
    protected openComm0(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void;
    protected start0(cb: (err: Error) => void): void;
    protected stop0(cb: (err: Error) => void): void;
}
export declare abstract class BuiltInService extends Service {
    protected readonly _config: any;
    protected readonly _service: string;
    protected readonly _commRegistry: nexusfork.ServiceCommRegistry;
    constructor(service: string, commRegistry: nexusfork.ServiceCommRegistry, log: nulllogger.INullLogger, paths: paths, config: any);
    protected requireService(): any;
    protected newService(): Service;
}
export declare class ClusterService extends BuiltInService {
    private _worker;
    private _pendingComms;
    private _comms;
    static readonly WORKER: string;
    constructor(service: string, commRegistry: nexusfork.ServiceCommRegistry, log: nulllogger.INullLogger, paths: paths, config: any);
    protected openComm0(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void;
    protected start0(cb: (err?: Error) => void): void;
    protected stop0(_cb: (err?: Error) => void): void;
}
export declare class LocalService extends BuiltInService {
    private _impl;
    constructor(service: string, commRegistry: nexusfork.ServiceCommRegistry, log: nulllogger.INullLogger, paths: paths, config: any);
    protected openComm0(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void;
    protected start0(cb: (err?: Error) => void): void;
    protected stop0(cb: (err?: Error) => void): void;
}
export declare const DistributedServiceImpl: typeof ClusterService | typeof LocalService;
export declare class DistributedService extends ServiceGroup {
    constructor(service: string, commRegistry: nexusfork.ServiceCommRegistry, log: nulllogger.INullLogger, paths: paths, config: any);
}
