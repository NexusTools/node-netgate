var compression = require("compression");

module.exports = function(app, config) {
	app.use(compression());
}