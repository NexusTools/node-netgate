try {
    var sassMiddleware = require('node-sass-middleware');
    var path = require("path");

    module.exports = function(config) {
        return sassMiddleware({
            src: path.resolve("src/sources")
          , dest: path.resolve("src/static")
          , outputStyle: 'compressed'
        });
    }
} catch(e) {
    module.exports = function() {}
}