var logger = require("nulllogger");
var paths = require("node-paths");
var cluster = require("cluster");
var _ = require("underscore");
var path = require("path");
var fs = require("fs");

var masterLogger = logger("Master");
var topDir = path.dirname(__dirname);
var handlerBase = new paths(path.resolve(topDir, "handlers"));
module.exports = function(config, readyCallback) {
    readyCallback = readyCallback || _.noop;
    
    var rootPath;
    if(!config || _.isString(config)) {
        rootPath = path.resolve(config || require.main.id);
        config = require(path.resolve(rootPath, "package.json"));
    } else
        rootPath = process.cwd();
    masterLogger.info("Preparing", config.name, "V" + config.version);
    if(config.description)
        masterLogger.info("\t", config.description);
    
    var handlersLookup = handlerBase.get(path.resolve(rootPath, "handlers"));
    if(config.wwwroot)
        config.hosts = {
            "*": config.wwwroot
        };
    else if(config.wwwapp)
        config.hosts = {
            "*": config.wwwapp
        };

    if(!config.hosts)
        throw new Error("Expected `hosts` or `wwwroot` in configuration");

    if(!_.isObject(config.hosts))
        throw new Error("`hosts` must be an Object, where the key is a host pattern and the value is the host configuration");

    var hostsLayout = {};
    for(var key in config.hosts) {
        var host = config.hosts[key];
        
        if(!_.isArray(host)) {
            if(_.isObject(host) || _.isString(host))
                host = [{
                    handler: "logger"
                }, host];
            else
                throw new Error("Host value must be a `String`, `Array` or `Object`");
        }

        var handlers = [];
        host.forEach(function(entry) {
            if(_.isString(entry))
                entry = {
                    "handler": "static",
                    "root": path.resolve(rootPath, entry)
                };
            else if(!entry.handler) {
                if(entry.root)
                    entry.handler = "static";
                else
                    throw new Error("Missing handler " + JSON.stringify(entry));
            }
            
            entry.handler = handlersLookup.resolve(entry.handler + ".js");
            handlers.push(entry);
        });
        
        hostsLayout[key] = handlers;
    }
    delete config;
    var env = {
        PROCESS_SEND_LOGGER: "true",
        HOST_LAYOUT_JSON: JSON.stringify(hostsLayout),
        ROOT_PATH: rootPath
    };
	if("env" in config)
		_.extend(env, config.env);
    delete hostsLayout;
    
    masterLogger.info("Spawning workers");
    cluster.setupMaster({
        exec : path.resolve(__dirname, "worker.js"),
        silent : true
    });
    
    var listening = false;
    var numCPUs = require('os').cpus().length;
    for (var i = 0; i < numCPUs; i++) {
        (function() {
            var worker = cluster.fork(env);
            var scope = "Worker" + worker.id;
            var workerLogger = logger("Master", scope + " Monitor");
            worker.on('online', function() {
                workerLogger.info("Online");
            });
            worker.on('message', function(msg) {
                //workerLogger.info(msg);
                var scopes = msg[1] || [];
                scopes.unshift(scope);
                logger.log(msg[0], scopes, msg[2]);
            });
            worker.once('listening', function(address) {
                if(listening)
                    return;
                
                masterLogger.info("Ready for connections on", address.address, address.port);
                readyCallback(undefined, address);
                listening = true;
            });
            worker.on('error', function(err) {
                workerLogger.info("Errored", err);
            });
            worker.on('exit', function(code) {
                if(!listening)
                    readyCallback(new Error("Worker exited before listening"));
                
                workerLogger.info("Exited", code);
            });
        })();
    }
};