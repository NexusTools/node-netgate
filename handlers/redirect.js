module.exports = function(app, config, logger) {
    if(!config.to)
        throw new Error("Handler `redirect` requires `to` parameter");
    
    var redirect;
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
    
    if(config.path)
        app.use(config.path, redirect);
    else
        app.use(redirect);
};