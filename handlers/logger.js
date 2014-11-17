module.exports = {
	preroute: function(logger) {
		return function netgate_logger(req, res, next) {
			if("user-agent" in req.headers)
				logger.info(req.method, req.hostname, req.url, "from", req.ip, req.headers['user-agent']);
			else
				logger.info(req.method, req.hostname, req.url, "from", req.ip);
			next();
		}
	}
}