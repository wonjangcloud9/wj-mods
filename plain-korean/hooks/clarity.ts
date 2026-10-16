export type ClarityAsk = 'confused' | 'shorter'

const CONFUSED = /뭔 ?말|뭔 ?소리|무슨 ?말|무슨 ?소리|이해가 ?안|이해 ?못|알아듣게|하나도 모르|안 ?그려|추상적|어쩌란/
const SHORTER = /짧게|요약해|요약 ?좀|요약본|간단히|간단하게|쉽게 (?:말|설명|정리)|핵심만|한 ?줄로|너무 길/
// 긴 프롬프트는 작업 지시라서 그 안의 "요약" 같은 말은 답변 방식 요청이 아닐 때가 많다.
const MAX_PROMPT_CHARS = 300

export function clarityAsk(text: string): ClarityAsk | undefined {
  if (text.length > MAX_PROMPT_CHARS) return undefined
  if (CONFUSED.test(text)) return 'confused'
  if (SHORTER.test(text)) return 'shorter'
  return undefined
}
