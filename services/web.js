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
var vhost = require("vhost");
var async = require("async");
var _ = require("lodash");
var stages = ["install", "preroute", "route", "postroute", "ready"];
var cbparams = ["cb", "callback", "next", "done"];
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
var WebService = (function (_super) {
    __extends(WebService, _super);
    function WebService(log, config) {
        var _this = _super.call(this, log) || this;
        _this._config = config;
        return _this;
    }
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
            var failure_1 = internal(500);
            var startup;
            Object.keys(this._config).forEach(function (host) {
                var logger = _this._logger.extend("R:" + host);
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
                    hasAsync = true;
                    startup = internal(503);
                    stages.forEach(function (stage) {
                        var existing = stageImpls[stage];
                        stageImpls[stage] = [];
                        var push = stageImpls[stage].push = function () {
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
                        push.apply(stageImpls[stage], existing);
                    });
                };
                _this._config[host].forEach(function (config) {
                    var asyncParam;
                    var handler = require(config.handler);
                    if (_.isFunction(handler)) {
                        var argdata = argwrap.wrap0(handler);
                        if (isRequestHandler(argdata[1])) {
                            var impl_1 = handler;
                            stageImpls['route'].push(function () {
                                return impl_1;
                            });
                        }
                        else if (asyncParam = isAsyncHandler(argdata[1])) {
                            if (!hasAsync)
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
                                if (isRequestHandler(argdata[1]))
                                    stageImpls['route'].push(function () {
                                        return impl;
                                    });
                                else if (asyncParam = isAsyncHandler(argdata[1])) {
                                    if (!hasAsync)
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
                                    stageImpls['route'].push(argdata[0]);
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
                        else if (ready)
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
                        else
                            startup(req, res);
                    };
                    async.eachSeries(stages, function (stage, cb) {
                        async.eachSeries(stageImpls[stage], function (impl, cb) {
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
                        if (err)
                            errored = true;
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
                            return;
                        handler = hoststack.length > 1 ? function (req, res, next) {
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
                        } : hoststack[0];
                    }
                    catch (e) {
                        handler = failure_1;
                    }
                }
                if (host == "*")
                    catchall = handler;
                else if (host.indexOf("*") != -1)
                    wildcards.push([host, handler]);
                else
                    app.use(vhost(host, handler));
            });
            wildcards.forEach(function (wildcard) {
                app.use(vhost(wildcard[0], wildcard[1]));
            });
            var no404handler;
            if (catchall) {
                app.use(catchall);
                no404handler = argwrap.names(catchall).length < 3;
            }
            if (!no404handler && !process.env.NO_404_HANDLER)
                app.use(internal(404));
        }
        catch (e) {
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