"use strict";
var express = require("express");
module.exports = function (config) {
    if (!config.root)
        throw new Error("Handler `static` requires `root` parameter");
    return express.static(config.root);
};
//# sourceMappingURL=static.js.map