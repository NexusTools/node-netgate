module.exports = function(app, config, next) {
	if(!config.type)
		throw new Error("A file to display is required");
	
	var path = require("path").resolve(__dirname, type, "index.html");
	var content = require("fs").readFile(path, {
		"encoding": "utf8"
	}, function(err, data) {
		if(err) {
			next(err);
			return;
		}
		
		var headers = {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Length": data.length
		};
		var code = config.code || 500;
		next(function(req, res) {
			res.writeHeader(code, headers);
			res.end(data);
		});
	});
}