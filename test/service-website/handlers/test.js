"use strict";
exports.__esModule = true;
function default_1(req, res) {
    res.writeHead(200, {
        contentType: "text/plain"
    });
    req.services.emitWithErrorHandler("test", "test", function (err) {
        res.end("" + err);
    }, 23, function (result) {
        res.end("" + result);
    });
}
exports["default"] = default_1;
//# sourceMappingURL=test.js.map