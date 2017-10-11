"use strict";
var nexusfork_1 = require("./src/nexusfork");
var _ = require("lodash");
module.exports = function (config, cb) {
    if (cb === void 0) { cb = _.noop; }
    if (_.isFunction(config)) {
        cb = config;
        config = undefined;
    }
    var master = new nexusfork_1.NexusFork(config);
    master.start(function (err) {
        cb(err, master);
    });
};
//# sourceMappingURL=index.js.map