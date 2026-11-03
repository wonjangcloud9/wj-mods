import type { Phase, Work } from '../types'

const MINUTE_MS = 60_000
// 이 업무를 이만큼 쟀으면 이 업무의 속도만 본다. 그보다 적으면 지난 업무 기록과 섞는다.
const OWN_SAMPLES = 2
// 섞어도 이보다 적으면 예상하지 않는다.
const MIN_SAMPLES = 3
// 지난 기록은 최근에 기록한 업무만 본다. 일하는 방식이 바뀌면 오래된 기록은 맞지 않는다.
const HISTORY_WORKS = 40

// 지금 단계를 시작한 시각. 예전 기록이라 완료 시각을 모르면 undefined 다.
export function stepStartedAt(work: Work): number | undefined {
  const done = work.steps.filter(step => step.isDone)
  if (done.length === 0) return work.createdAt
  const times = done.flatMap(step => (step.doneAt === undefined ? [] : [step.doneAt]))
  return times.length > 0 ? Math.max(...times) : undefined
}

// 단계마다 걸린 시간. 끝낸 순서대로 앞 단계를 끝낸 시각부터 잰다. 1분이 안 되거나 모르면 undefined 다.
export function stepSpans(work: Work): (number | undefined)[] {
  const order = work.steps
    .map((step, index) => ({ index, at: step.doneAt }))
    .filter((item): item is { index: number; at: number } => item.at !== undefined)
    .sort((a, b) => a.at - b.at)
  const spans: (number | undefined)[] = work.steps.map(() => undefined)
  let from = work.createdAt
  for (const { index, at } of order) {
    spans[index] = at - from >= MINUTE_MS ? at - from : undefined
    from = at
  }
  return spans
}

function measured(work: Work): number[] {
  return stepSpans(work).filter((ms): ms is number => ms !== undefined)
}

// 자리를 비운 시간처럼 튀는 값에 덜 흔들리도록 평균 대신 중앙값을 쓴다.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] ?? 0
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2
}

// 단계 하나에 걸리는 시간. others 는 같은 종류의 다른 업무다. 서브에이전트와 메인 대화는 속도가 달라 섞지 않는다.
export function paceOf(work: Work, others: Work[]): number | undefined {
  const own = measured(work)
  if (own.length >= OWN_SAMPLES) return median(own)
  const history = others
    .filter(other => other.id !== work.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, HISTORY_WORKS)
    .flatMap(measured)
  const pool = [...own, ...history]
  return pool.length >= MIN_SAMPLES ? median(pool) : undefined
}

// 남은 단계를 마치는 데 걸릴 시간. 일하는 중이면 지금 단계에 이미 쓴 시간을 뺀다.
// 남은 단계가 없거나 예상한 시간을 이미 넘겼으면 undefined 다.
export function remainingMs(work: Work, paceMs: number, phase: Phase, now: number): number | undefined {
  const left = work.steps.filter(step => !step.isDone).length
  if (left === 0) return undefined
  const started = phase === 'running' || phase === 'yourTurn' ? stepStartedAt(work) : undefined
  const spent = started === undefined ? 0 : Math.min(Math.max(0, now - started), paceMs)
  const ms = left * paceMs - spent
  return ms >= MINUTE_MS ? ms : undefined
}
