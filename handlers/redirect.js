var endSlash = /\/$/;
module.exports = function(app, config, logger) {
    if(!config.to)
        throw new Error("Handler `redirect` requires `to` parameter");
    
    var redirect;
	if(config.stripURL) {
		if(config.code)
			redirect = function(req, res) {
				logger.info("Redirecting to", config.to, config.code);
				res.redirect(config.code, config.to);
			};
		else
			redirect = function(req, res) {
				logger.info("Redirecting to", config.to);
				res.redirect(config.to);
			};
	} else {
		if(endSlash.test(config.to))
			config.to = config.to.substring(0, config.to.length-1);
		
		if(config.code)
			redirect = function(req, res) {
				var to = config.to + res.url;
				logger.info("Redirecting to", to, config.code);
				res.redirect(config.code, to);
			};
		else
			redirect = function(req, res) {
				var to = config.to + res.url;
				logger.info("Redirecting to", to);
				res.redirect(to);
			};
	}
    
    if(config.path)
        app.use(config.path, redirect);
    else
        app.use(redirect);
};