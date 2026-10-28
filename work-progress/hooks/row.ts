// 대화 화면에 그리는 기록 도구 호출 줄. 사용자는 보낸 값 전체가 아니라 무엇을 기록했는지 한 줄만 본다.
const STATUS_WORD: Record<string, string> = { paused: '보류', done: '완료' }

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function reportRow(input: unknown): string {
  const call = (input ?? {}) as Record<string, unknown>
  const steps = list(call.steps)
  const done = steps.filter(step => (step as { done?: unknown } | null)?.done === true).length
  const name = typeof call.title === 'string' && call.title.trim() ? call.title.trim() : String(call.work_id ?? '')
  const status = typeof call.status === 'string' ? STATUS_WORD[call.status] : undefined
  return `진행도 기록 ${done}/${steps.length} · ${name}${status ? ` · ${status}` : ''}`
}

export function laterRow(input: unknown): string {
  const call = (input ?? {}) as Record<string, unknown>
  const parts = [
    [list(call.add).length, '남김'],
    [list(call.done).length, '끝냄'],
    [list(call.drop).length, '안 하기로 함'],
  ] as const
  const said = parts.filter(([count]) => count > 0).map(([count, word]) => `${count}개 ${word}`)
  return `나중에 할 일 · ${said.length > 0 ? said.join(', ') : '바뀐 것 없음'}`
}
