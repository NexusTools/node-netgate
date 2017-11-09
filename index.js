"use strict";
/// <reference types="node" />
var nexusfork_1 = require("./src/nexusfork");
var _ = require("lodash");
var _export = function (config, cb) {
    if (cb === void 0) { cb = _.noop; }
    if (_.isFunction(config)) {
        cb = config;
        config = undefined;
    }
    var nexusfork = new nexusfork_1.NexusFork(config);
    nexusfork.start(function (err) {
        cb(err, nexusfork);
    });
};
var props = {};
var loadables = [
    [
        "service",
        ["Service", "SimpleCommService", "ServiceGroup"]
    ]
];
loadables.forEach(function (loadable) {
    loadable[1].forEach(function (key) {
        props[key] = {
            get: function () {
                var mod = require(loadable[0]);
                var clazz = mod[key];
                Object.defineProperty(_export, key, {
                    enumerable: true,
                    value: clazz
                });
                return clazz;
            },
            enumerable: true,
            configurable: true
        };
    });
});
Object.defineProperties(_export, props);
Object.defineProperty(_export, "NexusFork", {
    enumerable: true,
    value: nexusfork_1.NexusFork
});
module.exports = _export;
//# sourceMappingURL=index.js.map