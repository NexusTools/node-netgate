"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
var internal = require("../internal/handler");
var service_1 = require("../src/service");
var express = require("express");
var argwrap = require("argwrap");
var async = require("async");
var _ = require("lodash");
var stages = ["install", "preroute", "route", "postroute", "ready"];
var cbparams = ["cb", "callback", "next", "done"];
var catchallPattern = /.+/;
function makeRegexFromDomain(path) {
    path = path.replace(/\$/g, "\\$").replace(/\^/g, "\\^");
    if (path[0] != "^")
        path = "^" + path;
    if (!/\$$/.test(path))
        path += "$";
    return new RegExp(path, 'i');
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
    return argnames.length >= 1 && argnames.length <= 3 && (argnames.indexOf("req") == 0 ||
        argnames.indexOf("request") == 0)
        && (valueOrNegativeOne(argnames.indexOf("res"), 1) ||
            valueOrNegativeOne(argnames.indexOf("response"), 1))
        && (argnames.length < 3 || cbparams.indexOf(argnames[2]) != -1);
}
var pushToAsync = function () {
    var items = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        items[_i] = arguments[_i];
    }
    var _items = [];
    items.forEach(function (item) {
        _items.push(function (cb) {
            cb(undefined, item());
        });
    });
    return Array.prototype.push.apply(this, _items);
};
var WebService = /** @class */ (function (_super) {
    __extends(WebService, _super);
    function WebService(log, config, services) {
        var _this = _super.call(this, log) || this;
        _this._config = config;
        _this._services = services;
        return _this;
    }
    WebService.prototype.openComm0 = function (cb) {
        cb(new Error("WebService does not support ServiceComm..."));
    };
    WebService.prototype.start0 = function (cb) {
        var _this = this;
        var catchall;
        var wildcards = [];
        var app = express();
        try {
            var constants_1 = {
                type: "webhost",
                app: app
            };
            var hosts = [];
            app.use(function (req, res, next) {
                try {
                    hosts.forEach(function (host) {
                        var matches = req.hostname.match(host.pattern);
                        if (matches) {
                            try {
                                Object.defineProperty(req, "hostnamematches", {
                                    configurable: true,
                                    value: matches
                                });
                            }
                            catch (e) { }
                            host.handler(req, res, next);
                            throw true;
                        }
                    });
                }
                catch (e) {
                    if (e === true)
                        return;
                    throw e;
                }
                next();
            });
            var failure_1 = internal(500);
            var startup;
            Object.keys(this._config).forEach(function (host) {
                var logger = _this._logger.extend("R:" + host);
                logger.gears("Processing", host);
                var webconstants = _.extend({
                    host: host,
                    logger: logger
                }, constants_1);
                var stageImpls = {};
                stages.forEach(function (stage) {
                    stageImpls[stage] = [];
                });
                var hasAsync;
                var makeAsync = function () {
                    if (hasAsync)
                        return;
                    hasAsync = true;
                    startup = internal(503);
                    stages.forEach(function (stage) {
                        var existing = stageImpls[stage];
                        (stageImpls[stage] = []).push = pushToAsync;
                        pushToAsync.apply(stageImpls[stage], existing);
                    });
                };
                _this._config[host].forEach(function (config) {
                    var asyncParam;
                    var handler = require(config.handler);
                    if (_.isFunction(handler["default"]))
                        handler = handler["default"];
                    if (_.isFunction(handler)) {
                        var argdata = argwrap.wrap0(handler);
                        logger.gears("Detected arguments", argdata);
                        if (isRequestHandler(argdata[1])) {
                            var impl_1 = handler;
                            stageImpls['route'].push(function () {
                                return impl_1;
                            });
                        }
                        else if (asyncParam = isAsyncHandler(argdata[1])) {
                            makeAsync();
                            var consts_1 = _.extend({
                                config: config
                            }, webconstants);
                            var _handler_1 = argdata[0];
                            Array.prototype.push.call(stageImpls['route'], function (cb) {
                                var _cb = {};
                                _cb[asyncParam] = cb;
                                _handler_1(_.extend(_cb, consts_1));
                            });
                        }
                        else {
                            var consts_2 = _.extend({
                                config: config
                            }, webconstants);
                            var _handler_2 = argdata[0];
                            stageImpls['route'].push(function () {
                                return _handler_2(consts_2);
                            });
                        }
                    }
                    else if (_.isObject(handler)) {
                        Object.keys(handler).forEach(function (stage) {
                            var asyncParam;
                            var impl = handler[stage];
                            if (_.isFunction(impl)) {
                                var argdata = argwrap.wrap0(impl);
                                logger.gears("Detected arguments for stage", stage, argdata[1]);
                                if (isRequestHandler(argdata[1]))
                                    stageImpls['route'].push(function () {
                                        return impl;
                                    });
                                else if (asyncParam = isAsyncHandler(argdata[1])) {
                                    makeAsync();
                                    var consts_3 = _.extend({
                                        config: config
                                    }, webconstants);
                                    var _handler_3 = argdata[0];
                                    Array.prototype.push.call(stageImpls['route'], function (cb) {
                                        var _cb = {};
                                        _cb[asyncParam] = cb;
                                        _handler_3(_.extend(_cb, consts_3));
                                    });
                                }
                                else {
                                    var consts_4 = _.extend({
                                        config: config
                                    }, webconstants);
                                    var _handler_4 = argdata[0];
                                    stageImpls['route'].push(function () {
                                        return _handler_4(consts_4);
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
                var hoststack = [];
                if (hasAsync) {
                    var ready;
                    var errored;
                    handler = function (req, res, next) {
                        if (errored)
                            failure_1(req, res);
                        else if (ready) {
                            Object.defineProperty(req, "services", {
                                value: _this._services
                            });
                            Object.defineProperty(req, "logger", {
                                value: logger
                            });
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
                                    failure_1(req, res);
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
                            var cb = function (err) {
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
                            handler = function (req, res, next) {
                                try {
                                    Object.defineProperty(req, "services", {
                                        value: _this._services
                                    });
                                }
                                catch (e) { }
                                try {
                                    Object.defineProperty(req, "logger", {
                                        configurable: true,
                                        value: logger
                                    });
                                }
                                catch (e) { }
                                async.eachSeries(hoststack, function (impl, cb) {
                                    try {
                                        impl(req, res, cb);
                                    }
                                    catch (e) {
                                        cb(e);
                                    }
                                }, function (err) {
                                    if (err)
                                        failure_1(req, res);
                                    else
                                        next();
                                });
                            };
                        else {
                            var _handler_5 = hoststack[0];
                            handler = function (req, res, next) {
                                try {
                                    Object.defineProperty(req, "services", {
                                        value: _this._services
                                    });
                                }
                                catch (e) { }
                                try {
                                    Object.defineProperty(req, "logger", {
                                        configurable: true,
                                        value: logger
                                    });
                                }
                                catch (e) { }
                                _handler_5(req, res, next);
                            };
                        }
                    }
                    catch (e) {
                        logger.error(e);
                        handler = failure_1;
                    }
                }
                if (host == "*")
                    catchall = handler;
                else if (host.indexOf("*") != -1)
                    wildcards.push([host, handler]);
                else
                    hosts.push({
                        pattern: makeRegexFromDomain(host),
                        handler: handler
                    });
            });
            wildcards.forEach(function (wildcard) {
                hosts.push({
                    pattern: makeRegexFromDomain(wildcard[0].replace(/\*/g, '([^.]+)')),
                    handler: wildcard[1]
                });
            });
            var no404handler;
            if (catchall) {
                hosts.push({
                    pattern: catchallPattern,
                    handler: catchall
                });
                no404handler = argwrap.names(catchall).length < 3;
            }
            if (!no404handler && !process.env.NO_404_HANDLER)
                app.use(internal(404));
        }
        catch (e) {
            this._logger.error(e);
            return cb(e);
        }
        if (process.env.HTTP_HOST)
            this._server = app.listen(parseInt(process.env.HTTP_PORT) || 80, process.env.HTTP_HOST, cb);
        else
            this._server = app.listen(parseInt(process.env.HTTP_PORT) || 80, cb);
    };
    WebService.prototype.stop0 = function (cb) {
        this._server.close(cb);
    };
    return WebService;
}(service_1.Service));
exports["default"] = WebService;
//# sourceMappingURL=web.js.map