"use strict";
var path = require("path");
var fs = require("fs");
var template = fs.readFileSync(path.resolve(__dirname, "template.html"), "utf8");
var extras_meantime_head = "<h2>In the meantime you can:</h2><ul><li><a href='javascript:location.reload(true);void();'>Reload the page <sup id='timer'></sup></a></li>";
var extras_foot = '<li><a target="_blank" href="//reddit.com/r/todayilearned">Learn something new on reddit.</a></li><li><a target="_blank" href="//imgur.com">Browse imgur.</a></li></ul>';
var extras_meantime = extras_meantime_head + extras_foot;
var meantime_footer = "<script>" + fs.readFileSync(path.resolve(__dirname, "meantime.js"), "utf8") + "</script>";
var defaults = {
    "403": {
        title: "Permission denied",
        message: "You do not have permission to access the content for the requested URL.",
        extras: "",
        footer: ""
    },
    "404": {
        title: "No content",
        message: "There is no content to display for the requested URL.",
        extras: "",
        footer: ""
    },
    "500": {
        title: "Server failure",
        message: "An unrecoverable error occured while starting the server,<br />Our technicians have been notified and will have things back up as soon as possible.",
        extras: extras_meantime,
        footer: meantime_footer
    },
    "503": {
        title: "Maintenance",
        message: "Our server is currently undergoing maintenance, it will be back online shortly.",
        extras: extras_meantime,
        footer: meantime_footer
    }
};
module.exports = function (code, title, message, extras, footer) {
    var page = defaults[code];
    page = page || {};
    page.title = title || page.title;
    page.message = message || page.message;
    page.extras = extras || page.extras;
    page.footer = footer || page.footer;
    var data = template;
    Object.keys(page).forEach(function (key) {
        data = data.replace(new RegExp("\\{\\{" + key + "\\}\\}", "g"), page[key]);
    });
    return function nexusfork_internal(req, res, more) {
        var thisdata;
        if (more)
            thisdata = Buffer.from(data.replace(/{{more}}/g, more), "utf8");
        else
            thisdata = Buffer.from(data.replace(/{{more}}/g, ""), "utf8");
        res.writeHead(code, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": thisdata.length
        });
        if (req.method == "HEAD")
            res.end();
        else
            res.end(thisdata);
    };
};
//# sourceMappingURL=handler.js.map