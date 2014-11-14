module.exports = function(app, config) {
	app.get("/", function(req, res) {
		res.end("<html><head><title>Maintenance</title></head><body>Server is undergoing maintenance... Check back later...</body></html>");
	});
}