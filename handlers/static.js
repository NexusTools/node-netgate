var express = require("express");

module.exports = function(config, logger) {
    if(!config.root)
        throw new Error("Handler `static` requires `root` parameter");
    
	logger.gears("Static route on path", config.root);
	var static = express.static(config.root);
    if(!config.noRewrite) {
		var router = express.Router();
		
        var fs = require("fs");
        var path = require("path");
        router.use(function netgate_index_redirect(req, res, next) {
            var subpath = req.path;
            var pos = subpath.indexOf("?");
            if(pos != -1)
                subpath = subpath.substring(0, pos);

            if(/index\.html$/.test(subpath)) {
                  pos = subpath.lastIndexOf("/");
                if(pos > 0)
                  subpath = subpath.substring(0, pos);
                res.redirect(301, subpath.substring(0, pos+1));
              }

          if (subpath.indexOf('.') === -1 && subpath) {
              subpath += ".html";
            var file = path.resolve(config.root, subpath.substring(1));
            fs.exists(file, function(exists) {
              if (exists)
                    res.redirect(subpath);
              else
                next();
            });
          } else
            next();
        });
		
		router.use(static);
		return router;
    } else
		return static;
};