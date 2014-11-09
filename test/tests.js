var assert = require("assert");
var path = require('path');
var http = require("http");
var fs = require("fs");

var pkg;
var topDir = path.dirname(__dirname);
var supportDir = path.resolve(__dirname, "support");
var pkgfile = path.resolve(topDir, "package.json");
it('parse package.json', function(){
    pkg = require(pkgfile);
    if(!pkg)
        throw new Error("Failed to parse `package.json`");
    if(!("main" in pkg))
        throw new Error("`package.json` missing property `main`");
});
var netgate;
it("require main", function(){
    netgate = require(topDir);
});
describe("api", function() {
    it("static website", function(done){
        netgate(path.resolve(__dirname, "static-website"), done);
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
                
            //done();
        }).on('error', function(e) {
            done(e);
        });
    });
});