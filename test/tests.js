"use strict";
exports.__esModule = true;
var assert = require("assert");
var path = require("path");
var http = require("http");
var fs = require("fs");
process.env['HTTP_PORT'] = "8080";
var nexusfork = require("../index");
it("static website", function (done) {
    nexusfork(path.resolve(__dirname, "static-website"), done);
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
//# sourceMappingURL=tests.js.map