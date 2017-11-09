"use strict";
exports.__esModule = true;
var log = require("nulllogger");
var logger = new log();
var service = require(process.env.service)["default"];
var _impl = new service(logger, JSON.parse(process.env.config), undefined);
var start = function () {
    try {
        _impl.start(function (err) {
            if (err)
                process.send({
                    cmd: "error",
                    message: err.message
                });
            else
                process.send({
                    cmd: "started"
                });
        });
    }
    catch (e) {
        process.send({
            cmd: "error",
            message: e.message
        });
    }
};
process.on("message", function (msg) {
    try {
        switch (msg.cmd) {
            case "exit":
                process.exit(0);
                break;
            case "start":
                start();
                break;
            case "stop":
                _impl.stop(function (err) {
                    if (err)
                        process.send({
                            cmd: "error",
                            message: err.message
                        });
                    else
                        process.send({
                            cmd: "stopped"
                        });
                });
                break;
            default:
                logger.warn("Unhandled message", msg);
        }
    }
    catch (e) {
        process.send({
            cmd: "error",
            message: e.message
        });
    }
});
start();
//# sourceMappingURL=worker.js.map