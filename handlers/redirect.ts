import {nexusfork} from "../types";

var endSlash = /\/$/;
export = function (config: {to: string, code: number, stripURL: boolean}, logger: nulllogger.INullLogger): nexusfork.WebRequestHandler{
    if (!config.to)
        throw new Error("Handler `redirect` requires `to` parameter");

    var to = config.to;
    var code = config.code || 302;
    if (config.stripURL)
        return function nexusfork_redirect(req, res) {
            logger.info("Redirecting to", to, code);
            res.redirect(code, to);
        };
    else {
        if (endSlash.test(to))
            to = to.substring(0, to.length - 1);

        return function nexusfork_redirect(req, res) {
            var concat = to + req.url;
            logger.info("Redirecting to", concat, code);
            res.redirect(code, concat);
        };
    }
} as nexusfork.WebHandlerImpl;
