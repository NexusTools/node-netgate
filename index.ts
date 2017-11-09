/// <reference types="node" />

import { NexusFork } from "./src/nexusfork";
import { Service, SimpleCommService, ServiceGroup } from "./src/service";
import { nexusfork } from "./types";
import _ = require("lodash");

const _export: {
    (config?: string|nexusfork.IndexCallback, cb?: nexusfork.IndexCallback): void;
    
    Service: Service;
    SimpleCommService: SimpleCommService;
    ServiceGroup: ServiceGroup;
    
    NexusFork: NexusFork;
} = function(config?: string|nexusfork.IndexCallback, cb: nexusfork.IndexCallback = _.noop) {
    if(_.isFunction(config)) {
        cb = config;
        config = undefined;
    }
    var nexusfork = new NexusFork(config as string);
    nexusfork.start(function(err) {
        cb(err, nexusfork);
    });
} as any;

const props: any = {};
const loadables: {
    [0]: string,
    [1]: string[]
}[] = [
    [
        "service",
        ["Service", "SimpleCommService", "ServiceGroup"]
    ]
];
loadables.forEach(function(loadable) {
    loadable[1].forEach(function(key) {
        props[key] = {
            get: function() {
                const mod = require(loadable[0]);
                const clazz = mod[key];
                Object.defineProperty(_export, key, {
                    enumerable: true,
                    value: clazz
                });
                return clazz;
            },
            enumerable: true,
            configurable: true
        }
    });
})
Object.defineProperties(_export, props);
Object.defineProperty(_export, "NexusFork", {
    enumerable: true,
    value: NexusFork
});

export = _export;