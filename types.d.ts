import express = require("express");
import { NexusFork } from "./src/nexusfork";

declare module nexusfork {
    export interface IndexCallback {
        (err: Error, master?: NexusFork): void
    }
    export interface WebRequest extends express.Request {

    }
    export interface WebRequestHandler {
        (req: WebRequest, res: express.Response, next?: express.NextFunction): void;
    }
    export interface WebHandlerImpl {
        (config: any, log?: nulllogger.INullLogger): WebRequestHandler;
    }
    export interface WebHandler {
        install: WebHandlerImpl;
        preroute: WebHandlerImpl;
        route: WebHandlerImpl;
        postroute: WebHandlerImpl;
        ready: WebHandlerImpl;
        
        [key: string]: WebHandlerImpl;
    }
    export interface WebHandlerConfig {
        handler?: string;
        root?: string;
        
        [key: string]: any;
    }
    export interface Config {
        name: string;
        version: number|string;
        description?: string;
        hosts?: {[index: string]: string|(WebHandlerConfig|string)[]};
        wwwroot?: string;
        wwwapp?: string;
    }
    export interface Addon {
        prewebhost?: (host: string, config: (WebHandlerConfig|string)[]) => void,
        postwebhost?: (host: string, handlers: WebHandlerConfig[]) => void
    }
}