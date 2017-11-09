import { Service } from "../src/service";
import { nexusfork } from "../types";
export interface Config {
    [index: string]: nexusfork.WebHandlerConfig[];
}
export default class WebService extends Service {
    private _config;
    private _server;
    private _services;
    constructor(log: nulllogger.INullLogger, config: Config, services: nexusfork.ServiceCommRegistry);
    protected openComm0(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void;
    protected start0(cb: (err?: Error) => void): void;
    protected stop0(cb: (err?: Error) => void): void;
}
