import { nexusfork } from "../../../types";

export default function (req: nexusfork.WebRequest, res: nexusfork.WebResponse) {
    res.writeHead(200, {
        contentType: "text/plain"
    });
    req.services.emitWithErrorHandler("test", "test", function(err) {
        res.end("" + err);
    }, 23, function(result: number) {
        res.end("" + result);
    });
}