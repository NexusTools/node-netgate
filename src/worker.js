var $break = new Object();
var regexpWrap = /^\/(.+)\/$/;
module.exports = function(opts) {
    var argwrap = require("argwrap");
	var logger = require("nulllogger");
	var express = require("express");
	var domain =  require('domain');
	var _ = require("lodash");
	var vhost = require("vhost");
	var path = require("path");
	var fs = require("fs");

	var upDir = path.dirname(__dirname);
	var topDir = path.dirname(upDir);
	var patchDir = path.resolve(topDir, "patches");

	var applied = 0;
	logger.debug("Running patches...");
	fs.readdirSync(patchDir).forEach(function(patch) {
		try {
			require(path.resolve(patchDir, patch));
			logger.info("Applied patch", patch);
			applied ++;
		} catch(e) {}
	});

	logger.debug("Configuring...");
	var app = express();
	if(process.env.HTTP_TRUST_PROXY)
		app.enable("trust proxy");
	
	var constants = {
		"type": "webhost",
		"app": app
	};
	
	var hostsToConfigure = 0;
	var installed = {}, handlers = [], hosts = [], fallback;
	var stages = ["preroute", "route", "postroute", "ready"];
	var hostsLayout = JSON.parse(process.env.HOST_LAYOUT_JSON);
	for(var key in hostsLayout) {
		(function(hostKey) {
			var hostDomain = domain.create(), host;
			var _logger = hostDomain.logger = logger("B:" + hostKey);
			hostsToConfigure ++;
			
			var hostconstants = {
				"host": hostKey,
				"logger": _logger
			};
			host = {
				"logger": _logger,
				"domain": hostDomain,
				"configure": function(err) {
					if(host.configured)
						return;
					
					if(--hostsToConfigure < 1)
						messageRouter.send("FullyConfigured", true);
					_logger.debug("Configured", hostsToConfigure);
					
					if(err) {
						_logger.error(err);
						host.configured = err;
						host.errored = true;
					} else
						host.configured = true;
				},
				"key": hostKey,
				"handlers": []
			};
			hostDomain.on("error", function(err) {
				host.configure(err);
			});
			try {
				_.extend(hostconstants, constants);
				hostDomain.run(function() {
					hostsLayout[hostKey].forEach(function(config) {
						var handler = {
							"name": path.basename(config.handler, ".js")
						}
						if(installed[handler.name] instanceof Error)
							throw installed[handler.name];
						try {
							var impl = require(config.handler);

							var handlerconstants = handler.constants = {};
							_.extend(handlerconstants, hostconstants);
							handlerconstants.comm = function(message, callback, persist) {
								messageRouter.request("Comm", {
									name: handler.name,
									data: message
								}, callback, persist);
							};
							handlerconstants.config = config;

							handler.stages = {};
							var foundStages = false;
							// Copy only what we need
							for(var i=0;i<stages.length;i++) {
								var stage = stages[i];
								if(stage in impl) {
									handler.stages[stage] = impl[stage];
									foundStages = true;
								}
							}

							if(_.isFunction(impl)) {
								handler.stages["route"] = impl;
									foundStages = true;
							}

							if(!foundStages) {
								_logger.warn(handler.name, "has no usable stages for this worker");
								return;
							}

							if(impl.install && !(installed[handler.name])) {
								var args = {};
								_.extend(args, handlerconstants);
								var $perhost = args["$perhost"] = new Object();
								args.constants = {
									"host": host.constants,
									"global": constants
								};

								// Install this handler
								var ret;
								try {
									ret = argwrap(impl.install, Object.keys(args))(args);
									installed[handler.name] = true;
								} catch(e) {
									if(e !== $perhost)
										throw e;

								}
							}
							host.handlers.push(handler);
						} catch(e) {
							// Save the error incase something else depends on it
							installed[handler.name] = e;
							throw e;
						}
					});

					if(host.handlers.length > 0) {
						host.parts = [];
						_logger.gears("Processing", host.handlers.length, host.handlers.length>1 ? "handlers" : "handler");
						host.handlers.forEach(function(handler) {
							var consts = {};
							_.extend(consts, constants);
							_.extend(consts, handler.constants);
							handler.constants = consts;
						});

						for(var i=0;i<stages.length;i++) {
							var stage = stages[i];
							host.handlers.forEach(function(handler) {
								if(stage in handler.stages) {
									var part = argwrap.wrap0(handler.stages[stage], Object.keys(handler.constants));
									part.push(handler.constants);
									part.push(handler.name);
									host.parts.push(part);
								}
							});
						}
						delete host.handlers;
						_logger.debug("Found", host.parts.length, host.parts.length>1 ? "parts" : "parts");
					} else
						throw new Error("No usable parts configured");
				});
			} catch(e) {
				host.configure(e);
			}
			
			if(host.key == "*")
				fallback = host;
			else
				hosts.push(host);

		})(key);
	}
	if(fallback)
		hosts.push(fallback);
	
	if(hosts.length > 0)
		logger.info("Configuring", hosts.length, hosts.length > 1 ? "hosts" : "host");
	else
		throw new Error("No hosts to configure.");
	
	hosts.forEach(function(host) {
		if(!host.configured) {
			host.logger.debug("Configuring", host.parts.length, host.parts.length>1 ? "parts" : "part");

			var lastPart = null, next;
			var router = express.Router();
			router.use(function nexusfork_logger(req, res, next) {
				if("user-agent" in req.headers)
					host.logger.info(req.method, req.hostname, req.url, "from", req.ip, req.headers['user-agent']);
				else
					host.logger.info(req.method, req.hostname, req.url, "from", req.ip);
				next();
			});
			var install = function(config, part) {
				host.logger.gears("Installing handler...", _.keys(config));

				var type = config.type || "use";
				if("path" in config)
					router[type](config.path, part);
				else
					router[type](part);

				host.logger.gears("installed", type, config.path);
			}
			next = function(part) {
				host.domain.run(function() {
					if(part) {
						if(part instanceof Error)
							throw handler;

						host.logger.debug("Installing", lastPart[3], part.name);
						install(lastPart[2].config, part);
						delete lastPart;
						delete part;
					}

					if(host.parts.length > 0) {
						var args = {}, ret;
						var nextPart = host.parts.shift();
						host.logger.debug("Configuring", nextPart[3], JSON.stringify(nextPart[1]));
						var callNext = nextPart[1].indexOf("next") == -1;
						_.extend(args, nextPart[2]);
						if(!callNext) {
							args.next = next;
							ret = nextPart[0](args);
							lastPart = nextPart;
						} else
							ret = nextPart[0](args);
						if(_.isFunction(ret)) {
							host.logger.debug("Installing", nextPart[3], ret.name);
							install(nextPart[2].config, ret);
						}

						if(callNext)
							next();
						else
							host.logger.debug("Waiting on async part", nextPart[3]);
					} else {
						host.logger.debug("All parts configured");
						host.configure();
					}
				});
			}
			try {
				next();
			} catch(e) {
				host.configure(e);
			}
		}
		
		if(host.configured) {
			host.logger.debug("Configured before adding to app router!");
			if(host.configured instanceof Error)
				router = failure;
			else
				router.use(function(req, res) {
					host.logger.debug("Sending 404 response");
					res.sendStatus(404);
				});
		} else {
			host.logger.debug("Not configured yet...");
			
			var routerStack, partsRouter = router;
			routerStack = [function(req, res, next) {
				if(host.errored) {
					routerStack.shift();
					error(req, res);
				} else
					next();
				
			}, partsRouter, function(req, res) {
				if(host.configured) {
					routerStack.pop();
					host.logger.debug("Sending 404 response");
					res.sendStatus(404);
				} else
					startup(req, res);
			}];
			router = function(req, res) {
				var i = 0;
				var __next;
				__next = function() {
					var part = routerStack[i++];
					host.logger.debug("Slow handler", part.name);
					part(req, res, __next);
				};
				__next();
			};
			["use", "post", "get"].forEach(function(type) {
				router[type] = function() {
					partsRouter[type].apply(partsRouter, arguments);
				};
			});
		}
		
		if(host.key == "*")
			app.use(router);
		else {
			var match = host.key.match(regexpWrap);
			var flags = "i";
			var pattern;
			if(match)
				pattern = match[1];
			else
				pattern = "^" + host.key.replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g, "\\$&").replace(/\*/g, ".+") + "$";

			app.use(vhost(new RegExp(pattern, flags), router));
		}
	});
	
	var onlisten = function(err) {
		if(err) {
			if(process.env.HTTP_HOST)
				logger.debug("Failed to listen on", process.env.HTTP_HOST, process.env.HTTP_PORT);
			else
				logger.debug("Failed to listen on", process.env.HTTP_PORT);
			throw err;
		}
		
		if(process.env.HTTP_HOST)
			logger.debug("Ready for Connections on", process.env.HTTP_HOST, process.env.HTTP_PORT);
		else
			logger.debug("Ready for Connections on", process.env.HTTP_PORT);
	};
	
	//var crypto = require("crypto");
	app.use(function(err, req, res, next) {
		//var sha1 = crypto.createHash("sha1");
		//sha1.update(err.stack);
		logger.error(err);
		error(req, res);
	});
	
	messageRouter.receive("StartListening", function(data) {
		if(process.env.HTTP_HOST)
			logger.gears("Binding to", process.env.HTTP_HOST, process.env.HTTP_PORT);
		else
			logger.gears("Binding to", process.env.HTTP_PORT);
		try {
			if(process.env.HTTP_HOST)
				app.listen(process.env.HTTP_PORT || 80, process.env.HTTP_HOST, onlisten);
			else
				app.listen(process.env.HTTP_PORT || 80, onlisten);
		} catch(e) {
			onlisten(e);
		}
	});
	logger.info("Sending ReadyToListen");
	messageRouter.send("ReadyToListen", true);
};
