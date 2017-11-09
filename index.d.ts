import { NexusFork } from "./src/nexusfork";
import { Service, SimpleCommService, ServiceGroup } from "./src/service";
import { nexusfork } from "./types";
declare const _export: {
    (config?: string | nexusfork.IndexCallback, cb?: nexusfork.IndexCallback): void;
    Service: Service;
    SimpleCommService: SimpleCommService;
    ServiceGroup: ServiceGroup;
    NexusFork: NexusFork;
};
export = _export;
