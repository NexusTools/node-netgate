import { SimpleCommService } from "../../../src/service";
export default class TestService extends SimpleCommService {
    private _queue;
    private _interval;
    protected handleCommEmit(onerror: (err: Error) => void, event: string, ...args: any[]): void;
    protected start0(cb: (err?: Error) => void): void;
    protected stop0(cb: (err?: Error) => void): void;
}
