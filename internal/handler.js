var cache = {};

module.exports = function(config) {
	if(!config.path)
		throw new Error("A file to display is required");
	
	var path = require("path").resolve(__dirname, config.path + ".html");
	if(!(path in cache))
		cache[path] = require("fs").readFileSync(path, {encoding:"utf8"});
	
	var data = cache[path];
	var headers = {
		"Content-Type": "text/html; charset=utf-8",
		"Content-Length": data.length
	};
	
	var code = config.code || 500;
	return function(req, res) {
		try {
			res.writeHeader(code, headers);
		} catch(e) {}
		res.end(data);
	};
}