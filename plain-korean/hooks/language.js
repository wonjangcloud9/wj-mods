"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEnglishAnswer = isEnglishAnswer;
var FENCED_CODE = /```[\s\S]*?```/g;
var INLINE_CODE = /`[^`\n]*`/g;
var URL = /\bhttps?:\/\/\S+/g;
var PATH = /\S*\/\S*/g;
var HANGUL = /[가-힣]/g;
var LATIN = /[A-Za-z]/g;
// 한글 한 음절은 영문 두 글자 정도의 분량으로 본다.
var HANGUL_WEIGHT = 2;
var MIN_LATIN = 80;
var MAX_HANGUL_SHARE = 0.25;
function count(text, pattern) {
    var _a, _b;
    return (_b = (_a = text.match(pattern)) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
}
// 코드, 경로, 주소를 뺀 본문이 영어로 쓰였는지 본다. 기술 용어가 섞인 한글 답변과 짧은 영어 한 줄은 통과한다.
function isEnglishAnswer(answer) {
    var prose = answer
        .replace(FENCED_CODE, ' ')
        .replace(INLINE_CODE, ' ')
        .replace(URL, ' ')
        .replace(PATH, ' ');
    var latin = count(prose, LATIN);
    if (latin < MIN_LATIN)
        return false;
    var hangul = count(prose, HANGUL) * HANGUL_WEIGHT;
    return hangul / (hangul + latin) < MAX_HANGUL_SHARE;
}
