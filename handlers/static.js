var express = require("express");

module.exports = function(app, config) {
    if(!config.root)
        throw new Error("Handler `static` requires `root` parameter");
    
    var handler = express.static(config.root);
    if(config.path)
        app.use(config.path, handler);
    else
        app.use(handler);
};