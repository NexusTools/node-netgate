import { Service } from "../src/service";
import { nexusfork } from "../types";
export interface Config {
    [index: string]: nexusfork.WebHandlerConfig[];
}
export default class WebService extends Service {
    private _config;
    private _server;
    constructor(log: nulllogger.INullLogger, config: Config);
    protected start0(cb: (err?: Error) => void): void;
    protected stop0(cb: (err?: Error) => void): void;
}
