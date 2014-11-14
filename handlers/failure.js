module.exports = function(app, config) {
	app.get("/", function(req, res) {
		res.statusCode = 500;
		
		res.end("<html><head><title>Error Occured</title></head><body>Something went wrong while starting the server... sorry...</body></html>");
	});
}