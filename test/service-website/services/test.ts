import { SimpleCommService } from "../../../src/service";
import { nexusfork } from "../../../types";

export default class TestService extends SimpleCommService {
    private _queue: Function[] = [];
    private _interval: NodeJS.Timer;
    protected handleCommEmit(onerror: (err: Error) => void, event: string, ...args: any[]): void{
        this._logger.info(event, args);
    }
    protected start0(cb: (err?: Error) => void): void{
        this._queue = [];
        this._interval = setInterval(() => {
            const queue = this._queue;
            this._queue = [];
            queue.forEach(function(impl) {
                impl();
            });
        }, 2000);
        cb();
    }
    protected stop0(cb: (err?: Error) => void): void{
        clearTimeout(this._interval);
        delete this._queue;
        cb();
    }
}