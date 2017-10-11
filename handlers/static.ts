import express = require("express");
import {nexusfork} from "../types";

export = function (config: {root: string}): nexusfork.WebRequestHandler{
    if (!config.root)
        throw new Error("Handler `static` requires `root` parameter");
    return express.static(config.root);
} as nexusfork.WebHandlerImpl;
