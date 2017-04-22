function MessageRouter(receive, send, logger) {
    if (!logger)
        throw new Error();

    this.__send = send;
    this.__handlers = {};
    this.__requests = {};
    this.__receivers = {};
    this.__persisted = {};
    this.__responseCache = {};
    var self = this;
    receive(function (message) {
        try {
            if("cmd" in message && message.cmd == "log") {
                message.receiver = "Logger";
                delete message.cmd;
            }
            
            if (!("receiver" in message))
                throw new Error("Missing receiver: " + JSON.stringify(message));

            if ("response" in message) {
                throw new Error("No request: " + message.response);
            } else if ("request" in message) {
                var respond = function (response) {
                    response.receiver = message.receiver;
                    response.response = message.request;
                    __send.send(response);
                };

                if (message.receiver in self.__handlers)
                    self.__handlers[message.receiver](message.data, respond);
                else {
                    var err = "No handler installed for: " + message.receiver;
                    logger.warning(err);
                    respond({error: err});
                }
            } else {
                if (message.receiver in self.__receivers)
                    self.__receivers[message.receiver](message.data);
                else
                    throw new Error("No receiver installed for: " + message.receiver);
            }
        } catch (e) {
            logger.warn("Cannot handle message", message, e);
        }
    });
}

MessageRouter.prototype.receive = function (target, callback) {
    if (target in this.__receivers)
        throw new Error("Receiver for `" + target + "` is already installed on this MessageRouter");

    this.__receivers[target] = callback;
}

MessageRouter.prototype.handle = function (target, callback) {
    if (target in this.__handlers)
        throw new Error("Handler for `" + target + "` is already installed on this MessageRouter");

    this.__handlers[target] = callback;
}

MessageRouter.prototype.lookup = function (persistID) {
    if (persistID in this.__persisted)
        return this.__persisted[persistID];
    else
        throw false;
}

MessageRouter.prototype.request = function (target, message, callback, persist) {
    var persistID;
    if (persist)
        persistID = target + "::" + JSON.stringify(message);

    try {
        return this.lookup(persistID);
    } catch (e) {
        var requestID = Date.now() * Math.random() + Math.random();
        var data = {
            "receiver": "" + target,
            "request": requestID,
            "data": message
        };
        if (persist)
            data.persist = isNaN(data) ? true : data * 1;
        requestID = target + "::" + requestID;
        this.__requests[requestID] = {
            "persist": persist,
            "callback": callback
        };
        this.__send(data);
    }
}

MessageRouter.prototype.send = function (target, message) {
    var data = {
        "receiver": "" + target,
        "data": message
    };
    this.__send(data);
}

module.exports = MessageRouter;