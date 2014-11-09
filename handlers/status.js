module.exports = function(app, config) {
	config.code = config.code || 404;
	var handler = function(req, res) {
		res.sendStatus(config.code);
	};
	
	if(config.path)
		app.use(config.path, handler);
	else
		app.use(handler);
}