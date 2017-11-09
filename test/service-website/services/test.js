"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
var service_1 = require("../../../src/service");
var TestService = /** @class */ (function (_super) {
    __extends(TestService, _super);
    function TestService() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._queue = [];
        return _this;
    }
    TestService.prototype.handleCommEmit = function (onerror, event) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        this._logger.info(event, args);
    };
    TestService.prototype.start0 = function (cb) {
        var _this = this;
        this._queue = [];
        this._interval = setInterval(function () {
            var queue = _this._queue;
            _this._queue = [];
            queue.forEach(function (impl) {
                impl();
            });
        }, 2000);
        cb();
    };
    TestService.prototype.stop0 = function (cb) {
        clearTimeout(this._interval);
        delete this._queue;
        cb();
    };
    return TestService;
}(service_1.SimpleCommService));
exports["default"] = TestService;
//# sourceMappingURL=test.js.map