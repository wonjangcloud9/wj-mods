// 사용자는 매일 오전 9시에 일을 시작한다. 그 시각을 하루가 바뀌는 때로 보고 "오늘 완료"를 비운다.

const DAY_MS = 24 * 60 * 60_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
export const WORKDAY_START_HOUR = 9

// now 가 속한 하루가 시작된 시각. 오전 9시 전이면 전날 오전 9시다. offsetMin 은 UTC 와의 차이(분)다.
export function workdayStart(now: number, offsetMin: number): number {
  const shift = (Number.isFinite(offsetMin) ? offsetMin : 0) * MINUTE_MS - WORKDAY_START_HOUR * HOUR_MS
  return Math.floor((now + shift) / DAY_MS) * DAY_MS - shift
}
