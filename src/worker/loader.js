var logger;
try {
	logger = require("nulllogger");
} catch(e) {
	console.error("Cannot load logger");
	process.exit(1);
}

process.on('uncaughtException', function(err) {
	try {
		if(!("stack" in err))
			throw "No stack";
		logger.fatal(err.stack);
	} catch(e) {
		logger.fatal(err);
	}
	process.exit(1);
});

require(require("path").resolve(__dirname, "worker.js"));