import { ServiceGroup } from "./service";
import paths = require("node-paths");
import { nexusfork } from "../types";
export declare class NexusFork extends ServiceGroup {
    readonly searchPaths: paths;
    static readonly INSTALL_PATH: paths;
    constructor(config?: string | nexusfork.Config, ...addons: string[]);
    loadConfig(config?: string | nexusfork.Config, ...addons: string[]): void;
}
