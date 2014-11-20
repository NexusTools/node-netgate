var path = require("path");
var messageRouter = require(path.resolve(__dirname, "messagerouter.js"));
var logger;
try {
	logger = require("nulllogger");
} catch(e) {
	console.error("Cannot load logger");
	process.exit(1);
}

var messageRouter = new messageRouter(function(callback) {
	process.on("message", callback);
}, function(message) {
	process.send(message);
}, logger);

process.on('uncaughtException', function(err) {
	logger.fatal("Unhandled exception:", err);
	process.exit(1);
});

var type = process.env.WORKER_TYPE = process.env.WORKER_TYPE || "webhost";
var typefile = path.resolve(__dirname, "worker", type + ".js");
logger.debug("Loading", typefile);
require(typefile)(messageRouter);