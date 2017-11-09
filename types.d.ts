import express = require("express");
import { NexusFork } from "./src/nexusfork";

declare module nexusfork {
    export interface ServiceComm {
        emit(event: string, ...args: any[]): void;
        emitWithErrorHandler(onerror: (err: Error) => void, event: string, ...args: any[]): void;
        off(event: string, cb: (...args: any[]) => void): void;
        on(event: string, cb: (...args: any[]) => void): void;
        close(): void;
    }
    export interface ServiceCommRegistry {
        open(service: string, cb:(err: Error, comm?: ServiceComm) => void): void;
        emitWithErrorHandler(service: string, event: string, onerror: (err: Error) => void, ...args: any[]): void;
        emit(service: string, event: string, ...args: any[]): void;
    }
    export interface IndexCallback {
        (err: Error, nexusfork?: NexusFork): void
    }
    export interface WebRequest extends express.Request {
        readonly services: ServiceCommRegistry;
        readonly logger: nulllogger.INullLogger;
        readonly hostnamematches?: RegExpMatchArray;
    }
    export interface WebResponse extends express.Response {
        sendFailure(): void;
    }
    export interface WebRequestHandler {
        (req: WebRequest, res: WebResponse, next?: express.NextFunction): void;
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
    export interface ServiceConfig {
        service: string;
        
        [key: string]: any;
    }
    export interface Config {
        name: string;
        version: number|string;
        description?: string;
        services?: ServiceConfig[];
        hosts?: {[index: string]: string|(WebHandlerConfig|string)[]};
        wwwroot?: string;
        wwwapp?: string;
    }
    export interface Addon {
        prewebhost?: (host: string, config: (WebHandlerConfig|string)[]) => void,
        postwebhost?: (host: string, handlers: WebHandlerConfig[]) => void
    }
}