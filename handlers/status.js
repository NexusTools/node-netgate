"use strict";
module.exports = {
    postroute: function (config) {
        var code = config.code || 404;
        return function nexusfork_status_response(req, res) {
            res.sendStatus(code);
        };
    }
};
//# sourceMappingURL=status.js.map