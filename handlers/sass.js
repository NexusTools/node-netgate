try {
    var sassMiddleware = require('node-sass-middleware');
    var path = require("path");

    module.exports = function(config) {
        return sassMiddleware({
            src: path.resolve(config.sources || "src/sources")
          , dest: path.resolve(config.static || "src/static")
          , outputStyle: 'compressed'
        });
    }
} catch(e) {
    module.exports = function() {}
}