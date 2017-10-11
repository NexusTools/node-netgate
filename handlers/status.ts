import {nexusfork} from "../types";

export = {
    postroute: function (config: any): nexusfork.WebRequestHandler{
        var code = config.code || 404;
        return function nexusfork_status_response(req, res) {
            res.sendStatus(code);
        };
    }
} as nexusfork.WebHandler;
