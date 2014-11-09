var express = require("express");

module.exports = function(app, config) {
    if(!config.root)
        throw new Error("Handler `static` requires `root` parameter");
    
    if(!config.noRewrite) {
        var fs = require("fs");
        var path = require("path");
        app.use(function(req, res, next) {
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
    }
    
    var handler = express.static(config.root);
    if(config.path)
        app.use(config.path, handler);
    else
        app.use(handler);
};