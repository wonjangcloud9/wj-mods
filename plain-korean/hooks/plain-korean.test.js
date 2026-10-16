"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var testing_1 = require("claude-code/testing");
var clarity_1 = require("./clarity");
var language_1 = require("./language");
var ENGLISH = 'I updated the SSE parser so duplicate events are dropped before they reach the store. ' +
    'The resubscribe test now covers the reconnect path, and the remaining work is the web builder hook.';
var KOREAN = '`use-parse-sse-stream.ts` 에서 중복 event 를 store 에 넣기 전에 걸러 내도록 고쳤습니다. ' +
    'resubscribe test 는 reconnect 경로까지 확인하고, 남은 작업은 web builder hook 입니다.';
function submit(text) {
    return { text: text, wait: false, origin: { kind: 'composer' } };
}
function finish(answer, agentId) {
    return { answer: answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', agentId: agentId };
}
(0, testing_1.describe)('isEnglishAnswer', function () {
    (0, testing_1.test)('기술 용어가 섞인 한글 답변은 통과한다', function () {
        (0, testing_1.expect)((0, language_1.isEnglishAnswer)(KOREAN)).toBe(false);
    });
    (0, testing_1.test)('영어 답변을 잡는다', function () {
        (0, testing_1.expect)((0, language_1.isEnglishAnswer)(ENGLISH)).toBe(true);
    });
    (0, testing_1.test)('코드 블록과 경로만 영어인 한글 답변은 통과한다', function () {
        var answer = "\uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.\n\n```ts\n".concat(ENGLISH, "\n```\n\nsrc/app/(menu)/builder/_hooks/use-builder-execute/types.ts");
        (0, testing_1.expect)((0, language_1.isEnglishAnswer)(answer)).toBe(false);
    });
    (0, testing_1.test)('짧은 영어 한 줄은 통과한다', function () {
        (0, testing_1.expect)((0, language_1.isEnglishAnswer)('Done. All tests passed.')).toBe(false);
    });
});
(0, testing_1.test)('영어 답변 아래에 경고를 붙이고 다음 프롬프트에 한 번만 교정 지시를 넣는다', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var context, done;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                context = [];
                on('turn.complete', function (_, e) { return ({ text: e.answer }); });
                on('prompt.submit', function (_, e) {
                    var _a;
                    context = (_a = e.context) !== null && _a !== void 0 ? _a : [];
                    return { text: e.text, context: e.context };
                });
                return [4 /*yield*/, $.turn.complete(finish(ENGLISH))];
            case 1:
                done = _a.sent();
                (0, testing_1.expect)(done.text).toContain('영어로 쓰였습니다');
                return [4 /*yield*/, $.prompt.submit(submit('다음 작업 진행해줘'))];
            case 2:
                _a.sent();
                (0, testing_1.expect)(context.some(function (c) { return c.includes('한글로 쓰고'); })).toBe(true);
                return [4 /*yield*/, $.prompt.submit(submit('그다음도'))];
            case 3:
                _a.sent();
                (0, testing_1.expect)(context).toEqual([]);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('한글 답변이면 답변과 다음 프롬프트를 그대로 둔다', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var context, done;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                context = [];
                on('turn.complete', function (_, e) { return ({ text: e.answer }); });
                on('prompt.submit', function (_, e) {
                    var _a;
                    context = (_a = e.context) !== null && _a !== void 0 ? _a : [];
                    return { text: e.text, context: e.context };
                });
                return [4 /*yield*/, $.turn.complete(finish(KOREAN))];
            case 1:
                done = _a.sent();
                (0, testing_1.expect)(done.text).toBe(KOREAN);
                return [4 /*yield*/, $.prompt.submit(submit('다음'))];
            case 2:
                _a.sent();
                (0, testing_1.expect)(context).toEqual([]);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('subagent 턴은 검사하지 않는다', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var done;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                on('turn.complete', function (_, e) { return ({ text: e.answer }); });
                return [4 /*yield*/, $.turn.complete(finish(ENGLISH, 'agent-1'))];
            case 1:
                done = _a.sent();
                (0, testing_1.expect)(done.text).toBe(ENGLISH);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.describe)('clarityAsk', function () {
    (0, testing_1.test)('이해하지 못했다는 말을 잡는다', function () {
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('시도 성사 실패가 뭔말이야.. 하나도 안그려지는데')).toBe('confused');
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('이해가 안되는데 뭐 어쩌란거냐 각각 뭘 선택해달라는거임')).toBe('confused');
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('push 해주고 릴리즈 인계는 계속 뭔말이지..')).toBe('confused');
    });
    (0, testing_1.test)('짧게 해 달라는 말을 잡는다', function () {
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('그래서 결론 더 짧게 정리해줘')).toBe('shorter');
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('완전 요약본도 부탁')).toBe('shorter');
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('요약해줘 pod가 교체되면 SSE 저거 텀이 몇 분 정도되는거야 그럼?')).toBe('shorter');
    });
    (0, testing_1.test)('일반 작업 지시와 긴 프롬프트는 건드리지 않는다', function () {
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('웹 빌드 실패 원인 찾아줘')).toBeUndefined();
        (0, testing_1.expect)((0, clarity_1.clarityAsk)('회의록 요약 앱부터 봐줘')).toBeUndefined();
        (0, testing_1.expect)((0, clarity_1.clarityAsk)("".concat('회의록 텍스트를 붙여넣으면 정리해 주는 앱 '.repeat(15), "\uC9E7\uAC8C \uB9CC\uB4E4\uC5B4\uC918"))).toBeUndefined();
    });
});
(0, testing_1.test)('이해 못 했다는 프롬프트에는 쉽게 다시 설명하라는 지시를 붙인다', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var context;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                context = [];
                on('prompt.submit', function (_, e) {
                    var _a;
                    context = (_a = e.context) !== null && _a !== void 0 ? _a : [];
                    return { text: e.text, context: e.context };
                });
                return [4 /*yield*/, $.prompt.submit(submit('뭔 말인지 하나도 모르겠어'))];
            case 1:
                _a.sent();
                (0, testing_1.expect)(context.some(function (c) { return c.includes('이해하지 못했다'); })).toBe(true);
                return [4 /*yield*/, $.prompt.submit(submit('다음 작업 진행해줘'))];
            case 2:
                _a.sent();
                (0, testing_1.expect)(context).toEqual([]);
                return [2 /*return*/];
        }
    });
}); });
