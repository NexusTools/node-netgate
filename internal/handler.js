var cache = {};

module.exports = function(config) {
	if(!config.type)
		throw new Error("A file to display is required");
	
	var path = require("path").resolve(__dirname, type, "index.html");
	if(!(path in cache))
		cache[path] = require("fs").readFileSync(path, {encoding:"utf8"});
	
	var data = cache[path];
	var headers = {
		"Content-Type": "text/html; charset=utf-8",
		"Content-Length": data.length
	};
	
	var code = config.code || 503;
	return function(req, res) {
		res.writeHeader(code, headers);
		res.end(data);
	};
}