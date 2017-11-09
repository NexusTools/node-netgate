"use strict";
exports.__esModule = true;
var assert = require("assert");
var path = require("path");
var http = require("http");
var fs = require("fs");
//process.env['WORKER_COUNT'] = "1";
process.env['HTTP_PORT'] = "8080";
var nexusfork = require("../index");
var nf;
it("static website", function (done) {
    nexusfork(path.resolve(__dirname, "static-website"), function (err, n) {
        if (err)
            done(err);
        else {
            nf = n;
            done();
        }
    });
});
it("test static website", function (done) {
    http.get("http://127.0.0.1:8080/", function (res) {
        var document = "";
        res.on("data", function (chunk) {
            document += chunk;
        });
        res.on("end", function () {
            try {
                assert.equal(document, fs.readFileSync(path.resolve(__dirname, "static-website/www", "index.html")));
                done();
            }
            catch (e) {
                done(e);
            }
        });
    }).on('error', done);
});
it("shutdown static website", function (done) {
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
//# sourceMappingURL=tests.js.map