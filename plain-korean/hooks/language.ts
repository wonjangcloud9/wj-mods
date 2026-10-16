const FENCED_CODE = /```[\s\S]*?```/g
const INLINE_CODE = /`[^`\n]*`/g
const URL = /\bhttps?:\/\/\S+/g
const PATH = /\S*\/\S*/g
const HANGUL = /[가-힣]/g
const LATIN = /[A-Za-z]/g

// 한글 한 음절은 영문 두 글자 정도의 분량으로 본다.
const HANGUL_WEIGHT = 2
const MIN_LATIN = 80
const MAX_HANGUL_SHARE = 0.25

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

// 코드, 경로, 주소를 뺀 본문이 영어로 쓰였는지 본다. 기술 용어가 섞인 한글 답변과 짧은 영어 한 줄은 통과한다.
export function isEnglishAnswer(answer: string): boolean {
  const prose = answer
    .replace(FENCED_CODE, ' ')
    .replace(INLINE_CODE, ' ')
    .replace(URL, ' ')
    .replace(PATH, ' ')
  const latin = count(prose, LATIN)
  if (latin < MIN_LATIN) return false

  const hangul = count(prose, HANGUL) * HANGUL_WEIGHT
  return hangul / (hangul + latin) < MAX_HANGUL_SHARE
}
