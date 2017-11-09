import internal = require("../internal/handler");
import { Service } from "../src/service";
import { nexusfork } from "../types";
import express = require("express");
import argwrap = require("argwrap");
import async = require("async");
import http = require("http");
import _ = require("lodash");

const stages = ["install", "preroute", "route", "postroute", "ready"];
const cbparams = ["cb", "callback", "next", "done"];

const catchallPattern = /.+/;

function makeRegexFromDomain(path: string) {
    path = path.replace(/\$/g, "\\$").replace(/\^/g, "\\^");
    
    if(path[0] != "^")
        path = "^" + path;
    if(!/\$$/.test(path))
        path += "$";
    
    return new RegExp(path, 'i');
}

export interface Config {
    [index: string]: nexusfork.WebHandlerConfig[]
}

function valueOrNegativeOne(val: number, cmp: number) {
    return val === cmp || val === -1;
}

function isAsyncHandler(params: string[]) {
    try {
        cbparams.forEach(function(param) {
            if(params.indexOf(param) > -1)
                throw param;
        });
    } catch(e) {
        if(_.isString(e))
            return e;
        throw e;
    }
}

function isRequestHandler(argnames: string[]) {
    return argnames.length >= 1 && argnames.length <= 3 && (
            argnames.indexOf("req") == 0 ||
            argnames.indexOf("request") == 0)
        && (valueOrNegativeOne(argnames.indexOf("res"), 1) ||
        valueOrNegativeOne(argnames.indexOf("response"), 1))
        && (argnames.length < 3 || cbparams.indexOf(argnames[2]) != -1);
}

const pushToAsync = function(...items: Function[]): number{
    const _items: Function[] = [];
    items.forEach(function(item) {
        _items.push(function(cb: (err: Error, cb: Function) => void) {
            cb(undefined, item());
        });
    });
    return Array.prototype.push.apply(this, _items);
};

export default class WebService extends Service {
    private _config: Config;
    private _server: http.Server;
    private _services: nexusfork.ServiceCommRegistry;
    constructor(log: nulllogger.INullLogger, config: Config, services: nexusfork.ServiceCommRegistry) {
        super(log);
        this._config = config;
        this._services = services;
    }
    protected openComm0(cb: (err: Error, comm?: nexusfork.ServiceComm) => void): void{
        cb(new Error("WebService does not support ServiceComm..."));
    }
    protected start0(cb: (err?: Error) => void): void{
        var catchall: nexusfork.WebRequestHandler;
        const wildcards: {[0]: string, [1]: nexusfork.WebRequestHandler}[] = []; 
        const app = express();
        try {
            const constants = {
                type: "webhost",
                app
            };
            
            var hosts: {pattern: RegExp, handler: Function}[] = [];
            app.use(function(req, res, next) {
                try {
                    hosts.forEach(function(host) {
                        var matches = req.hostname.match(host.pattern);
                        if(matches) {
                            try {
                                Object.defineProperty(req, "hostnamematches", {
                                    configurable: true,
                                    value: matches
                                });
                            } catch(e) {}
                            host.handler(req, res, next);
                            throw true;
                        }
                    });
                } catch(e) {
                    if(e === true)
                        return;
                    throw e;
                }
                next();
            });
            
            const failure = internal(500);
            var startup: nexusfork.WebRequestHandler;
            Object.keys(this._config).forEach((host) => {
                const logger = this._logger.extend("R:" + host);
                logger.gears("Processing", host);
                const webconstants = _.extend({
                    host,
                    logger
                }, constants);
                const stageImpls: {[index: string]: Function[]} = {};
                stages.forEach(function(stage) {
                    stageImpls[stage] = [];
                });
                var hasAsync: boolean;
                const makeAsync = function() {
                    if(hasAsync)
                        return;
                    hasAsync = true;
                    startup = internal(503);
                    stages.forEach(function(stage) {
                        const existing = stageImpls[stage];
                        (stageImpls[stage] = []).push = pushToAsync;
                        pushToAsync.apply(stageImpls[stage], existing);
                    });
                }
                this._config[host].forEach((config) => {
                    var asyncParam: string;
                    var handler = require(config.handler);
                    if (_.isFunction(handler.default))
                        handler = handler.default;
                    if (_.isFunction(handler)) {
                        const argdata = argwrap.wrap0(handler);
                        logger.gears("Detected arguments", argdata);
                        if (isRequestHandler(argdata[1])) {
                            const impl = handler;
                            stageImpls['route'].push(function () {
                                return impl;
                            });
                        } else if(asyncParam = isAsyncHandler(argdata[1])) {
                            makeAsync();
                            const consts = _.extend({
                                config
                            }, webconstants);
                            const _handler = argdata[0];
                            Array.prototype.push.call(stageImpls['route'], function(cb) {
                                var _cb = {};
                                _cb[asyncParam] = cb;
                                _handler(_.extend(_cb, consts));
                            });
                        } else {
                            const consts = _.extend({
                                config
                            }, webconstants);
                            const _handler = argdata[0];
                            stageImpls['route'].push(function() {
                                return _handler(consts);
                            });
                        }
                    } else if (_.isObject(handler)) {
                        Object.keys(handler).forEach(function(stage) {
                            var asyncParam: string;
                            const impl = handler[stage];
                            if(_.isFunction(impl)) {
                                const argdata = argwrap.wrap0(impl);
                                logger.gears("Detected arguments for stage", stage, argdata[1]);
                                if (isRequestHandler(argdata[1]))
                                    stageImpls['route'].push(function () {
                                        return impl;
                                    });
                                else if(asyncParam = isAsyncHandler(argdata[1])) {
                                    makeAsync();
                                    const consts = _.extend({
                                        config
                                    }, webconstants);
                                    const _handler = argdata[0];
                                    Array.prototype.push.call(stageImpls['route'], function(cb) {
                                        var _cb = {};
                                        _cb[asyncParam] = cb;
                                        _handler(_.extend(_cb, consts));
                                    });
                                }  else {
                                    const consts = _.extend({
                                        config
                                    }, webconstants);
                                    const _handler = argdata[0];
                                    stageImpls['route'].push(function() {
                                        return _handler(consts);
                                    });
                                }
                            } else
                                throw new Error("Stage implementations must be Functions.");
                        })
                    } else
                        throw new Error("Handler must be Object or Function.");
                });
                var handler: nexusfork.WebRequestHandler;
                const hoststack: nexusfork.WebRequestHandler[] = [];
                if(hasAsync) {
                    var ready: boolean;
                    var errored: boolean;
                    handler = (req, res, next) => {
                        if(errored)
                            failure(req, res);
                        else if(ready) {
                            Object.defineProperty(req, "services", {
                                value: this._services
                            });
                            Object.defineProperty(req, "logger", {
                                value: logger
                            });
                            async.eachSeries(hoststack, function(impl, cb) {
                                try {
                                    impl(req, res, cb);
                                } catch(e) {
                                    cb(e);
                                }
                            }, function(err) {
                                if(err) {
                                    logger.error(err);
                                    failure(req, res);
                                } else
                                    next();
                            });
                        } else
                            startup(req, res);
                    };
                    async.eachSeries(stages, function(stage, cb) {
                        async.eachSeries(stageImpls[stage], function(impl, rcb) {
                            var called: Error|boolean = false;
                            const cb = function(err?: Error) {
                                if(called) {
                                    if(called === true && err)
                                        console.error("Error called after success...", err.stack);
                                    return;
                                }
                                called = err || true;
                                rcb(err);
                            };
                            try {
                                impl(function(err, _impl) {
                                    if(err)
                                        cb(err)
                                    else {
                                        if(_impl)
                                            hoststack.push(_impl);
                                        cb();
                                    }
                                });
                            } catch(e) {
                                cb(e);
                            }
                        }, cb);
                    }, function(err) {
                        if(err) {
                            logger.error(err);
                            errored = true;
                        } else
                            ready = true;
                    });
                } else {
                    try {
                        stages.forEach(function (stage) {
                            stageImpls[stage].forEach(function (impl) {
                                var _impl = impl();
                                if(_impl)
                                    hoststack.push(_impl);
                            });
                        });
                        if (!hoststack.length)
                            return; // Don't setup
                        if(hoststack.length > 1)
                            handler = (req, res, next) => {
                                try {
                                    Object.defineProperty(req, "services", {
                                        value: this._services
                                    });
                                } catch(e) {}
                                try {
                                    Object.defineProperty(req, "logger", {
                                        configurable: true,
                                        value: logger
                                    });
                                } catch(e) {}
                                async.eachSeries(hoststack, function(impl, cb) {
                                    try {
                                        impl(req, res, cb);
                                    } catch(e) {
                                        cb(e);
                                    }
                                }, function(err) {
                                    if(err)
                                        failure(req, res);
                                    else
                                        next();
                                });
                            };
                        else {
                            const _handler = hoststack[0];
                            handler = (req, res, next) => {
                                try {
                                    Object.defineProperty(req, "services", {
                                        value: this._services
                                    });
                                } catch(e) {}
                                try {
                                    Object.defineProperty(req, "logger", {
                                        configurable: true,
                                        value: logger
                                    });
                                } catch(e) {}
                                _handler(req, res, next);
                            }
                        }
                    } catch(e) {
                        logger.error(e);
                        handler = failure;
                    }
                }
                if(host == "*")
                    catchall = handler;
                else if(host.indexOf("*") != -1)
                    wildcards.push([host, handler]);
                else
                    hosts.push({
                        pattern: makeRegexFromDomain(host),
                        handler
                    });
            });
            
            wildcards.forEach(function(wildcard) {
                hosts.push({
                    pattern: makeRegexFromDomain(wildcard[0].replace(/\*/g, '([^.]+)')),
                    handler: wildcard[1]
                });
            });
            
            var no404handler;
            if(catchall) {
                hosts.push({
                    pattern: catchallPattern,
                    handler: catchall
                })
                no404handler = argwrap.names(catchall).length < 3;
            }

            if(!no404handler && !process.env.NO_404_HANDLER)
                app.use(internal(404));
        } catch(e) {
            this._logger.error(e);
            return cb(e);
        }

        if(process.env.HTTP_HOST)
            this._server = app.listen(parseInt(process.env.HTTP_PORT) || 80, process.env.HTTP_HOST, cb);
        else
            this._server = app.listen(parseInt(process.env.HTTP_PORT) || 80, cb);
    }
    protected stop0(cb: (err?: Error) => void): void{
        this._server.close(cb);
    }
}