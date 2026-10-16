"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = void 0;
var clarity_1 = require("./clarity");
var language_1 = require("./language");
var NOTICE = '답변 규칙: 답변이 영어로 쓰였습니다. 다음 턴에 한글로 쓰도록 알려 둡니다.';
var REMINDER = '직전 답변을 영어로 썼다. 사용자는 답변, 중간 보고, 완료 요약을 모두 한글로 받기를 원한다. ' +
    '이번 답변은 한글로 쓰고, 직전 답변 내용이 아직 필요하면 한글로 다시 정리한다. 코드 식별자, 경로, 명령, 오류 원문은 원래 표기로 둔다.';
var CLARITY = {
    confused: '사용자가 직전 설명을 이해하지 못했다. 첫 문장에 결론을 쓴다. 직전 답에 나온 낯선 말, 줄임말, 번호를 그대로 반복하지 말고 무슨 뜻인지 풀어 쓴다. ' +
        '구체적인 예를 하나 든다. 제목과 표 없이 5줄 안으로 쓴다. 사용자가 정해야 할 것이 있으면 선택지마다 고르면 무엇이 달라지는지 한 줄로 쓴다.',
    shorter: '사용자가 짧은 답을 원한다. 결론부터 3줄 안으로 쓴다. 제목, 표, 근거 목록, 커밋 해시는 빼고 꼭 필요한 것만 남긴다.',
};
// 영어로 쓴 답변 아래에 경고를 붙이고, 다음 프롬프트에 한 번만 교정 지시를 넣는다.
// "뭔 말", "짧게" 같은 짧은 프롬프트에는 쉽게 다시 쓰라는 지시를 붙인다.
var register = function (on) {
    var isPending = false;
    on('turn.complete', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next(e)];
                case 1:
                    result = _a.sent();
                    if (e.agentId !== undefined || e.reason !== 'answer')
                        return [2 /*return*/, result];
                    if (!(0, language_1.isEnglishAnswer)(e.answer))
                        return [2 /*return*/, result];
                    isPending = true;
                    return [2 /*return*/, __assign(__assign({}, result), { text: NOTICE })];
            }
        });
    }); });
    on('prompt.submit', function ($, e, next) {
        var _a;
        var ask = (0, clarity_1.clarityAsk)(e.text);
        var added = __spreadArray(__spreadArray([], (isPending ? [REMINDER] : []), true), (ask ? [CLARITY[ask]] : []), true);
        if (added.length === 0)
            return next(e);
        isPending = false;
        return next(__assign(__assign({}, e), { context: __spreadArray(__spreadArray([], ((_a = e.context) !== null && _a !== void 0 ? _a : []), true), added, true) }));
    });
};
exports.register = register;
