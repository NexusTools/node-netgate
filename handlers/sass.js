try {
    var chokidar = require("chokidar");
    var sass = require('node-sass');
    var path = require("path");
    var fs = require("fs");

    module.exports = function(config, logger) {
        logger.warn("node-sass found");
        
        var src = path.resolve(config.root || ".", config.sources || "src/sources");
        var dest = path.resolve(config.root || ".", config.static || "src/static");
        
        var includeMap = {};
        var render = function(file) {
            if(!/^.+\/[^_][^\/]+\.scss$/.test(file))
                return;

            sass.render({
                file: file,
                success: function(result) {
                    var out = dest + file.substring(src.length, file.length-4) + "css";
                    
                    result.stats.includedFiles.forEach(function(included) {
                        if(included == file)
                            return;
                        
                        var map = includeMap[included]||(includeMap[included]=[]);
                        if(map.indexOf(file) > -1)
                            return;
                        map.push(file);
                    });

                    fs.writeFile(out, result.css, function(err) {
                        if(err)
                            logger.warn(file, err);
                    });
                }
            });
        }
        var updated = function(file) {
            render(file);
            if(file in includeMap)
                includeMap[file].forEach(render);
        }
        
        var tempWatcher;
        logger.info("Scanning", src);
        chokidar.watch(src, {
            persistent: false
        }).on('add', updated).on('change', updated);
    }
} catch(e) {
    module.exports = function(logger) {
        logger.warn("node-sass missing", e);
    }
}