const HEADING = /^#{1,4}\s/m
const TABLE_RULE = /^\|?\s*:?-{3,}:?\s*\|/m
const MIN_CHARS = 600
const MIN_LINES = 20
const MAX_ANSWER_CHARS = 12_000

export const PREFIX = '쉽게 말하면 · '

export const SYSTEM = [
  '너는 개발자에게 긴 답변을 쉬운 한국어로 풀어 주는 도우미다.',
  '두 문장으로만 쓴다. 첫 문장은 결론이나 지금 상태다. 두 번째 문장은 사용자가 해야 하거나 정해야 할 일이고, 없으면 "따로 할 일은 없다"고 쓴다.',
  '답변에 나온 줄임말, 번호, ID, 커밋 해시를 그대로 옮기지 말고 무슨 뜻인지 풀어 쓴다. 머리말, 목록, 마크다운 없이 바로 쓴다.',
].join('\n')

// 대화 기록상 "뭔 말이야" 직전 답변은 길이보다 제목과 표가 붙은 보고서 형태가 특징이었다.
export function isReportLike(answer: string): boolean {
  if (answer.length < MIN_CHARS) return false
  const lines = answer.split('\n').filter(line => line.trim()).length
  return HEADING.test(answer) || TABLE_RULE.test(answer) || lines >= MIN_LINES
}

export function summaryPrompt(answer: string): string {
  return `다음 답변을 두 문장으로 쉽게 풀어 줘.\n\n<answer>\n${answer.slice(0, MAX_ANSWER_CHARS)}\n</answer>`
}

export function summaryLine(reply: string): string | undefined {
  const text = reply.replace(/\s+/g, ' ').trim()
  return text ? `${PREFIX}${text}` : undefined
}
