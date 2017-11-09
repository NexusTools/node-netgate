import assert = require("assert");
import path = require('path');
import http = require("http");
import fs = require("fs");

declare function it(stage: string, impl: Function): void;

//process.env['WORKER_COUNT'] = "1";
process.env['HTTP_PORT'] = "8080";

import nexusfork = require("../index");
import { NexusFork } from "../src/nexusfork";

var nf: NexusFork;
it("static website", function(done){
    nexusfork(path.resolve(__dirname, "static-website"), function(err, n) {
        if(err)
            done(err);
        else {
            nf = n;
            done();
        }
    });
});
it("test static website", function(done){
    http.get("http://127.0.0.1:8080/", function(res) {
        var document = "";
        res.on("data", function(chunk) {
            document += chunk;
        });
        res.on("end", function() {
            try {
                assert.equal(document,
                    fs.readFileSync(path.resolve(__dirname,
                        "static-website/www", "index.html")));
                done();
            } catch(e) {
                done(e);
            }
        });
    }).on('error', done);
});
it("shutdown static website", function(done){
    nf.stop(done);
});
/*it("service website", function(done){
    nexusfork(path.resolve(__dirname, "service-website"), done);
});
it("test service website", function(done){
    http.get("http://127.0.0.1:8080/", function(res) {
        var document = "";
        res.on("data", function(chunk) {
            document += chunk;
        });
        res.on("end", function() {
            try {
                assert.equal(document, JSON.stringify({mode:23}));
                done();
            } catch(e) {
                done(e);
            }
        });
    }).on('error', done);
});*/
