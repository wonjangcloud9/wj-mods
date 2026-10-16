import type { Limit } from '../types'
import { hasReset, limitLabel, untilReset } from './format'

export type Sent = Record<string, number>

const THRESHOLDS = [80, 95]

export function toSent(value: unknown): Sent {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'number'))
}

// 창마다 이미 알린 가장 높은 기준을 기억한다. 창이 초기화돼 사용률이 내려가면 기준도 내려가 다음에 다시 알린다.
export function crossedAlerts(limits: readonly Limit[], sent: Sent, now: number): { alerts: string[]; sent: Sent } {
  const next: Sent = { ...sent }
  const alerts: string[] = []

  for (const limit of limits) {
    if (hasReset(limit, now)) continue

    const crossed = Math.max(0, ...THRESHOLDS.filter(t => limit.percentUsed >= t))
    if (crossed > (sent[limit.kind] ?? 0)) {
      const reset = untilReset(limit.resetsAt, now)
      alerts.push(`${limitLabel(limit.kind)} 사용량이 ${crossed}%를 넘었습니다${reset ? ` · ${reset} 뒤 초기화` : ''}`)
    }
    next[limit.kind] = crossed
  }

  return { alerts, sent: next }
}
