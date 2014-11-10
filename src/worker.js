var logger = require("nulllogger");
process.on('uncaughtException', function(err) {
    try {
        if(!err.stack)
            throw "No Stack";
        logger.error(err.stack);
    } catch(e) {
        logger.error("" + err);
    }
    process.exit(1);
});

var express = require("express");
var vhost = require("vhost");
var path = require("path");
var fs = require("fs");

var topDir = path.dirname(__dirname);
var patchDir = path.resolve(topDir, "patches");
var handlerDir = path.resolve(topDir, "handlers");

var applied = 0;
logger.info("Running patches");
fs.readdirSync(patchDir).forEach(function(patch) {
    try {
        require(path.resolve(patchDir, patch));
        logger.info("Applied patch", patch);
        applied ++;
    } catch(e) {}
});

logger.info("Configuring");
var app = express();
if(process.env.HTTP_TRUST_PROXY)
    app.enable("trust proxy");

var fallback;
var regexpWrap = /^\/(.+)\/$/;
var hostsLayout = JSON.parse(process.env.HOST_LAYOUT_JSON);
for(var key in hostsLayout) {
    var host = hostsLayout[key];
    
    var hostHandlers = [];
    host.forEach(function(entry) {
        hostHandlers.push([require(entry.handler), entry]);
    });
    delete host;
    
    var match = key.match(regexpWrap);
    var flags = "i";
    var hostLogger;
    var pattern;
    if(match) {
        hostLogger = logger(match[1]);
        pattern = match[1];
    } else {
        if(key == "*") {
            fallback = hostHandlers;
            continue;
        }
        
        hostLogger = logger(key);
        pattern = "^" + key.replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g, "\\$&").replace(/\*/g, ".+") + "$";
    }
    
    hostLogger.gears("Configuring", pattern, host);
    var hostRouter = express.Router();
    hostHandlers.forEach(function(handler) {
        handler[0](hostRouter, handler[1], hostLogger);
    });
    app.use(vhost(new RegExp(pattern, flags), hostRouter));
}

if(fallback) {
    logger.gears("Configuring fallback");
    fallback.forEach(function(handler) {
        handler[0](app, handler[1], logger("fallback"));
    });
}

var fallbackCode = process.env.HTTP_FALLBACK_CODE || 404;
app.use(function(req, res) {
    logger.warn("Unhandled, sending", fallbackCode, "status code", req.host, req.url);
    res.sendStatus(fallbackCode);
});

//var crypto = require("crypto");
app.use(function(err, req, res, next) {
	//var sha1 = crypto.createHash("sha1");
	//sha1.update(err.stack);
	
	res.statusCode = 500;
	res.write("<html><head><title>Error occured</title></head>");
	res.write("<body>Oops, it looks like something went wrong.");
	//res.write("<div style='font-size: 70%; margin: 12px'>Reference ");
	//res.write(sha1.digest("hex"));
	//res.write("</div>");
	res.end("</body></html>");
	
	logger.error(err.stack);
});

if(process.env.HTTP_HOST)
    app.listen(process.env.HTTP_PORT || 80, process.env.HTTP_HOST);
else
    app.listen(process.env.HTTP_PORT || 80);
logger.info("Ready for Connections");
