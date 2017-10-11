import { Service } from "./service";
import log = require("nulllogger");

const logger = new log();
const service = require(process.env.service).default;
const _impl: Service = new service(logger, JSON.parse(process.env.config));

const start = function() {
    try {
        _impl.start(function(err) {
            if(err)
                process.send({
                    cmd: "error",
                    message: err.message
                });
            else
                process.send({
                    cmd: "started"
                })
        });
    } catch(e) {
        process.send({
            cmd: "error",
            message: e.message
        });
    }
}

process.on("message", function(msg) {
    try {
        switch(msg.cmd) {
            case "start":
                start();
                break;
            case "stop":
                _impl.stop(function(err) {
                    if(err)
                        process.send({
                            cmd: "error",
                            message: err.message
                        });
                    else
                        process.send({
                            cmd: "stopped"
                        })
                });
                break;
            default:
                logger.warn("Unhandled message", msg);
        }
    } catch(e) {
        process.send({
            cmd: "error",
            message: e.message
        });
    }
});

start();