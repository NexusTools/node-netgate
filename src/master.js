var logger = require("nulllogger");
var paths = require("node-paths");
var cluster = require("cluster");
var _ = require("underscore");
var path = require("path");
var fs = require("fs");

var masterLogger = logger("cyan:Master");
var topDir = path.dirname(__dirname);
var MessageRouter = require(path.resolve(__dirname, "messagerouter.js"));
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
	
	var forkedWorkers = 0;
	var forkWorker = function(type, env, name, callback) {
		var worker = cluster.fork(env);
		worker.logger = logger("cyan:Master", name + " Monitor");
		worker.on('online', function() {
			worker.logger.info("Online");
			forkedWorkers ++;
		});
		
		worker.on('error', function(err) {
			if(!worker.ready) {
				worker.ready = true;
				if(callback)
					callback(err);
			}
			worker.logger.info("Errored", err);
		});
		worker.on('exit', function(code) {
			try {
				if(!worker.ready) {
					worker.ready = true;
					if(callback)
						callback(new Error("Exited with code " + code));
				}

				worker.logger.info("Exited", code);
			} finally {
				if(forkedWorkers < 1)
					process.exit(0);
			}
		});
		
		worker.messageRouter = new MessageRouter(function(callback) {
			worker.on('message', callback);
		}, function(message) {
			worker.send(message);
		}, worker.logger);
		
		var scopeName = logger.cleanScope(name);
		worker.messageRouter.receive("Logger", function(message) {
			message[1].unshift(scopeName); // Inject name into scopes
			logger.log0.apply(undefined, message);
		});
		if(callback)
			worker.messageRouter.receive("FullyConfigured", function(message) {
				worker.logger.debug("FullyConfigured");
				if(!worker.ready) {
					worker.ready = true;
					callback();
				}
			});
		else
			worker.messageRouter.receive("FullyConfigured", function(message) {
				worker.logger.debug("FullyConfigured");
			});

		return worker;
	}
	var spawnStaticWorker = function(name, callback) {
		var cleanName = name;
		var pos = cleanName.indexOf(":");
		if(pos > -1)
			cleanName = cleanName.substring(pos+1);
		var worker = forkWorker("webhost", {
			PROCESS_SEND_LOGGER: "true",
			HOST_LAYOUT_JSON: JSON.stringify({
				"*": [{
					"handler": handlersLookup.resolve("compression.js")
				},
				{
					"handler": handlersLookup.resolve("static.js"),
					"root": path.resolve(topDir, "internal", cleanName.toLowerCase())
				}]
			}),
			ROOT_PATH: rootPath
		}, name, function(err) {
			if(!callback)
				return;
			
			if(err)
				callback(new Error("`" + cleanName + "` failed to start: " + err));
			//else
			//	callback();
		});
		worker.messageRouter.receive("ReadyToListen", function(message) {
			logger.debug("Sending StartListening");
			worker.messageRouter.send("StartListening", true);
		});
		
		return worker;
	};
	
	
	try {
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
						handler: "compression"
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
			exec : path.resolve(__dirname, "loader.js"),
			silent : process.env.NETGATE_SILENCE_WORKERS
		});

		var workerCount = 0;
		var listening = false, readyForConnections = false;
		var workersLeft = Math.max(1, require('os').cpus().length);
		var spawnWorker = function() {
			if(workersLeft < 1)
				return; // No workers left to spawn
			workersLeft --;

			var worker;
			if(workerCount == 0) {
				if(workersLeft > 0)
					worker = forkWorker("webhost", env, "Worker" + (++workerCount), function(err) {
						if(err)
							readyCallback(err);
					 	else {
							spawnWorker();
							setTimeout(readyCallback, 200);
						}
					});
				else
					worker = forkWorker("webhost", env, "Worker" + (++workerCount), function(err) {
						if(err)
							readyCallback(err);
						else
							spawnWorker();
					});
				
				
				worker.messageRouter.receive("ReadyToListen", function(message) {
					logger.debug("Sending StartListening");
					worker.messageRouter.send("StartListening", true);
				});
				
				worker.once('listening', function(address) {
					logger.info("Ready for connections", address.address, ""+address.port);
				});
			} else {
				if(workersLeft > 0)
					worker = forkWorker("webhost", env, "Worker" + (++workerCount), function(err) {
						if(!err)
							worker.messageRouter.send("StartListening", true);
						else
							try {
								worker.kill();
							} catch(e) {}

						spawnWorker();
					});
				else
					worker = forkWorker("webhost", env, "Worker" + (++workerCount), function(err) {
						if(!err)
							worker.messageRouter.send("StartListening", true);
						else
							try {
								worker.kill();
							} catch(e) {}

						masterLogger.info("All workers spawned");
					});
				worker.messageRouter.receive("ReadyToListen", function(message) {});
			}
		};

		spawnWorker();
	} catch(e) {
		logger.fatal(e);
		spawnStaticWorker("R:Failure");
	}
};