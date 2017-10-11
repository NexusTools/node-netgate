import internal = require("../internal/handler");
import { Service } from "../src/service";
import { nexusfork } from "../types";
import express = require("express");
import argwrap = require("argwrap");
import vhost = require("vhost");
import async = require("async");
import http = require("http");
import _ = require("lodash");

const stages = ["install", "preroute", "route", "postroute", "ready"];
const cbparams = ["cb", "callback", "next", "done"];

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

export default class WebService extends Service {
    private _config: Config;
    private _server: http.Server;
    constructor(log: nulllogger.INullLogger, config: Config) {
        super(log);
        this._config = config;
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
            
            const failure = internal(500);
            var startup: nexusfork.WebRequestHandler;
            Object.keys(this._config).forEach((host) => {
                const logger = this._logger.extend("R:" + host);
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
                    hasAsync = true;
                    startup = internal(503);
                    stages.forEach(function(stage) {
                        const existing = stageImpls[stage];
                        stageImpls[stage] = [];
                        const push = stageImpls[stage].push = function(...items: Function[]): number{
                            const _items: Function[] = [];
                            items.forEach(function(item) {
                                _items.push(function(cb: (err: Error, cb: Function) => void) {
                                    cb(undefined, item());
                                });
                            });
                            return Array.prototype.push.apply(this, _items);
                        };
                        push.apply(stageImpls[stage], existing);
                    });
                }
                this._config[host].forEach((config) => {
                    var asyncParam: string;
                    var handler = require(config.handler);
                    if (_.isFunction(handler)) {
                        const argdata = argwrap.wrap0(handler);
                        if (isRequestHandler(argdata[1])) {
                            const impl = handler;
                            stageImpls['route'].push(function () {
                                return impl;
                            });
                        } else if(asyncParam = isAsyncHandler(argdata[1])) {
                            if(!hasAsync)
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
                                if (isRequestHandler(argdata[1]))
                                    stageImpls['route'].push(function () {
                                        return impl;
                                    });
                                else if(asyncParam = isAsyncHandler(argdata[1])) {
                                    if(!hasAsync)
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
                                    stageImpls['route'].push(argdata[0]);
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
                    handler = function(req, res, next) {
                        if(errored)
                            failure(req, res);
                        else if(ready)
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
                        else
                            startup(req, res);
                    };
                    async.eachSeries(stages, function(stage, cb) {
                        async.eachSeries(stageImpls[stage], function(impl, cb) {
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
                        if(err)
                            errored = true;
                        else
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
                        handler = hoststack.length > 1 ? function(req, res, next) {
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
                        } : hoststack[0];
                    } catch(e) {
                        handler = failure;
                    }
                }
                if(host == "*")
                    catchall = handler;
                else if(host.indexOf("*") != -1)
                    wildcards.push([host, handler]);
                else
                    app.use(vhost(host, handler));
            });
            
            wildcards.forEach(function(wildcard) {
                app.use(vhost(wildcard[0], wildcard[1]));
            });
            
            var no404handler;
            if(catchall) {
                app.use(catchall);
                no404handler = argwrap.names(catchall).length < 3;
            }

            if(!no404handler && !process.env.NO_404_HANDLER)
                app.use(internal(404));
        } catch(e) {
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