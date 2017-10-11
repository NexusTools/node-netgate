/// <reference types="node" />

import { NexusFork } from "./src/nexusfork";
import { nexusfork } from "./types";
import _ = require("lodash");

export = function(config?: string|nexusfork.IndexCallback, cb: nexusfork.IndexCallback = _.noop) {
    if(_.isFunction(config)) {
        cb = config;
        config = undefined;
    }
    var master = new NexusFork(config as string);
    master.start(function(err) {
        cb(err, master);
    });
}