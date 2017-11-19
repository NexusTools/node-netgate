"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const internal = require("../internal/handler");
const service_1 = require("../src/service");
const express = require("express");
const argwrap = require("argwrap");
const async = require("async");
const _ = require("lodash");
const stages = ["install", "preroute", "route", "postroute", "ready"];
const cbparams = ["cb", "callback", "next", "done"];
const reqparams = ["req", "request", "r1"];
const resparams = ["res", "response", "r2"];
const catchallPattern = /.+/;
function makeRegexFromDomain(path) {
    return new RegExp("^" + path.replace(/\$/g, "\\$").replace(/\^/g, "\\^") + "$", 'i');
}
function valueOrNegativeOne(val, cmp) {
    return val === cmp || val === -1;
}
function isAsyncHandler(params) {
    try {
        cbparams.forEach(function (param) {
            if (params.indexOf(param) > -1)
                throw param;
        });
    }
    catch (e) {
        if (_.isString(e))
            return e;
        throw e;
    }
}
function isRequestHandler(argnames) {
    return argnames.length >= 1 && argnames.length <= 3 &&
        reqparams.indexOf(argnames[0]) != -1
        && (argnames.length < 2 || resparams.indexOf(argnames[1]) != -1)
        && (argnames.length < 3 || cbparams.indexOf(argnames[2]) != -1);
}
const pushToAsync = function (...items) {
    const _items = [];
    items.forEach(function (item) {
        _items.push(function (cb) {
            cb(undefined, item());
        });
    });
    return Array.prototype.push.apply(this, _items);
};
class WebService extends service_1.Service {
    constructor(log, config, services) {
        super(log);
        this._config = config;
        this._services = services;
    }
    openComm0(cb) {
        cb(new Error("WebService does not support ServiceComm..."));
    }
    start0(cb) {
        var catchall;
        var catchallLogger;
        const wildcards = [];
        const app = express();
        try {
            const self = this;
            const constants = {
                type: "webhost",
                get server() {
                    return self._server;
                },
                app
            };
            var hosts = [];
            app.use((req, res) => {
                try {
                    Object.defineProperty(req, "services", {
                        value: this._services
                    });
                }
                catch (e) { }
                try {
                    Object.defineProperty(res, "sendFailure", {
                        configurable: true,
                        value: function (err) {
                            if (err)
                                failureerr(req, res, err);
                            else
                                failure(req, res);
                        }
                    });
                }
                catch (e) { }
                try {
                    Object.defineProperty(res, "sendStatus", {
                        configurable: true,
                        value: function (code, err) {
                            switch (code) {
                                case 403:
                                    internal403(req, res);
                                    break;
                                case 404:
                                    internal404(req, res);
                                    break;
                                case 503:
                                    startup(req, res);
                                    break;
                                default:
                                    if (err)
                                        failureerr(req, res, err);
                                    else
                                        failure(req, res);
                                    break;
                            }
                        }
                    });
                }
                catch (e) { }
                try {
                    hosts.forEach(function (host) {
                        var matches = req.hostname.match(host.pattern);
                        if (matches) {
                            try {
                                Object.defineProperty(req, "logger", {
                                    configurable: true,
                                    value: host.logger
                                });
                            }
                            catch (e) { }
                            try {
                                Object.defineProperty(req, "hostnamematches", {
                                    configurable: true,
                                    value: matches
                                });
                            }
                            catch (e) { }
                            host.handler(req, res, function (err) {
                                if (err)
                                    failureerr(req, res, err);
                                else
                                    res.sendStatus(404);
                            });
                            throw true;
                        }
                    });
                }
                catch (e) {
                    if (e === true)
                        return;
                    throw e;
                }
                res.sendStatus(404);
            });
            const startup = internal(503);
            const failure = internal(500);
            const internal404 = internal(404);
            const internal403 = internal(403);
            const failureerr = function (req, res, err) {
                failure(req, res, "<code style=\"padding: 6px; background: red; color: white; border-radius: 6px; margin: 6px 0; display: block\">" + err + "</code>");
            };
            Object.keys(this._config).forEach((host) => {
                const logger = this._logger.extend("R:" + host);
                logger.gears("Processing", host);
                const webconstants = _.extend({
                    host,
                    logger
                }, constants);
                const stageImpls = {};
                stages.forEach(function (stage) {
                    stageImpls[stage] = [];
                });
                var hasAsync;
                const makeAsync = function () {
                    if (hasAsync)
                        return;
                    hasAsync = true;
                    stages.forEach(function (stage) {
                        const existing = stageImpls[stage];
                        (stageImpls[stage] = []).push = pushToAsync;
                        pushToAsync.apply(stageImpls[stage], existing);
                    });
                };
                this._config[host].forEach((config) => {
                    var asyncParam;
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
                        }
                        else if (asyncParam = isAsyncHandler(argdata[1])) {
                            makeAsync();
                            const consts = _.extend({
                                config
                            }, webconstants);
                            const _handler = argdata[0];
                            Array.prototype.push.call(stageImpls['route'], function (cb) {
                                var _cb = {};
                                _cb[asyncParam] = cb;
                                _handler(_.extend(_cb, consts));
                            });
                        }
                        else {
                            const consts = _.extend({
                                config
                            }, webconstants);
                            const _handler = argdata[0];
                            stageImpls['route'].push(function () {
                                return _handler(consts);
                            });
                        }
                    }
                    else if (_.isObject(handler)) {
                        Object.keys(handler).forEach(function (stage) {
                            var asyncParam;
                            const impl = handler[stage];
                            if (_.isFunction(impl)) {
                                const argdata = argwrap.wrap0(impl);
                                logger.gears("Detected arguments for stage", stage, argdata[1]);
                                if (isRequestHandler(argdata[1]))
                                    stageImpls['route'].push(function () {
                                        return impl;
                                    });
                                else if (asyncParam = isAsyncHandler(argdata[1])) {
                                    makeAsync();
                                    const consts = _.extend({
                                        config
                                    }, webconstants);
                                    const _handler = argdata[0];
                                    Array.prototype.push.call(stageImpls['route'], function (cb) {
                                        var _cb = {};
                                        _cb[asyncParam] = cb;
                                        _handler(_.extend(_cb, consts));
                                    });
                                }
                                else {
                                    const consts = _.extend({
                                        config
                                    }, webconstants);
                                    const _handler = argdata[0];
                                    stageImpls['route'].push(function () {
                                        return _handler(consts);
                                    });
                                }
                            }
                            else
                                throw new Error("Stage implementations must be Functions.");
                        });
                    }
                    else
                        throw new Error("Handler must be Object or Function.");
                });
                var handler;
                const hoststack = [];
                if (hasAsync) {
                    var ready;
                    var errored;
                    handler = (req, res, next) => {
                        if (errored)
                            failure(req, res);
                        else if (ready) {
                            async.eachSeries(hoststack, function (impl, cb) {
                                try {
                                    impl(req, res, cb);
                                }
                                catch (e) {
                                    cb(e);
                                }
                            }, function (err) {
                                if (err) {
                                    logger.error(err);
                                    failure(req, res);
                                }
                                else
                                    next();
                            });
                        }
                        else
                            startup(req, res);
                    };
                    async.eachSeries(stages, function (stage, cb) {
                        async.eachSeries(stageImpls[stage], function (impl, rcb) {
                            var called = false;
                            const cb = function (err) {
                                if (called) {
                                    if (called === true && err)
                                        console.error("Error called after success...", err.stack);
                                    return;
                                }
                                called = err || true;
                                rcb(err);
                            };
                            try {
                                impl(function (err, _impl) {
                                    if (err)
                                        cb(err);
                                    else {
                                        if (_impl)
                                            hoststack.push(_impl);
                                        cb();
                                    }
                                });
                            }
                            catch (e) {
                                cb(e);
                            }
                        }, cb);
                    }, function (err) {
                        if (err) {
                            logger.error(err);
                            errored = true;
                        }
                        else
                            ready = true;
                    });
                }
                else {
                    try {
                        stages.forEach(function (stage) {
                            stageImpls[stage].forEach(function (impl) {
                                var _impl = impl();
                                if (_impl)
                                    hoststack.push(_impl);
                            });
                        });
                        if (!hoststack.length)
                            return; // Don't setup
                        if (hoststack.length > 1)
                            handler = (req, res, next) => {
                                async.eachSeries(hoststack, function (impl, cb) {
                                    try {
                                        impl(req, res, cb);
                                    }
                                    catch (e) {
                                        cb(e);
                                    }
                                }, function (err) {
                                    if (err)
                                        failure(req, res);
                                    else
                                        next();
                                });
                            };
                        else
                            handler = hoststack[0];
                    }
                    catch (e) {
                        logger.error(e);
                        handler = failure;
                    }
                }
                if (host == "*") {
                    catchall = handler;
                    catchallLogger = logger;
                }
                else if (host.indexOf("*") != -1)
                    wildcards.push([host, handler, logger]);
                else
                    hosts.push({
                        logger,
                        pattern: makeRegexFromDomain(host),
                        handler
                    });
            });
            wildcards.forEach(function (wildcard) {
                hosts.push({
                    logger: wildcard[2],
                    pattern: makeRegexFromDomain(wildcard[0].replace(/\*/g, '([^.]+)')),
                    handler: wildcard[1]
                });
            });
            if (catchall)
                hosts.push({
                    logger: catchallLogger,
                    pattern: catchallPattern,
                    handler: catchall
                });
        }
        catch (e) {
            this._logger.error(e);
            return cb(e);
        }
        if (process.env.HTTP_HOST)
            this._server = app.listen(parseInt(process.env.HTTP_PORT) || 80, process.env.HTTP_HOST, cb);
        else
            this._server = app.listen(parseInt(process.env.HTTP_PORT) || 80, cb);
    }
    stop0(cb) {
        this._server.close(cb);
    }
}
exports.default = WebService;
//# sourceMappingURL=web.js.map