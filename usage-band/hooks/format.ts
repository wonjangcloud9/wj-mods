import type { ClaudeStatus, ClaudeStatusLevel, Limit } from '../types'

export type Tone = 'success' | 'warning' | 'error'

export type Meter = { label: string; percent: number; tone: Tone; filled: string; rest: string; reset?: string }

const LABEL: Record<string, string> = { five_hour: '5시간', seven_day: '주간', spend_limit: '지출 한도' }
const ORDER = ['five_hour', 'seven_day']
const WATCHED_COMPONENTS = ['Claude Code', 'Claude API (api.anthropic.com)', 'claude.ai']
const OPEN_INCIDENT = ['investigating', 'identified', 'monitoring']

export const STATUS_TEXT: Record<ClaudeStatusLevel, string> = {
  pending: 'Claude status 확인 중',
  ok: 'Claude 정상',
  minor: 'Claude 일부 장애',
  major: 'Claude 장애',
  maintenance: 'Claude 점검 중',
  unknown: 'Claude status 확인 불가',
}

export function limitLabel(kind: string): string {
  return LABEL[kind] ?? kind
}

export function sortLimits(limits: readonly Limit[]): Limit[] {
  const rank = (kind: string) => (ORDER.includes(kind) ? ORDER.indexOf(kind) : ORDER.length)
  return [...limits].sort((a, b) => rank(a.kind) - rank(b.kind))
}

export function toLimits(value: unknown): Limit[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const { kind, percentUsed, resetsAt } = (item ?? {}) as Record<string, unknown>
    if (typeof kind !== 'string' || typeof percentUsed !== 'number') return []
    return [typeof resetsAt === 'string' ? { kind, percentUsed, resetsAt } : { kind, percentUsed }]
  })
}

export function hasReset(limit: Limit, now: number): boolean {
  const at = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  return !Number.isNaN(at) && at <= now
}

export function tone(percent: number): Tone {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'
  return 'success'
}

export function bar(percent: number, width: number): { filled: string; rest: string } {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * width)
  return { filled: '━'.repeat(filled), rest: '─'.repeat(width - filled) }
}

export function meter(limit: Limit, now: number, width: number): Meter {
  const percent = hasReset(limit, now) ? 0 : Math.round(limit.percentUsed)
  const reset = untilReset(limit.resetsAt, now)
  return {
    label: limitLabel(limit.kind),
    percent,
    tone: tone(percent),
    ...bar(percent, width),
    ...(reset ? { reset } : {}),
  }
}

export function untilReset(resetsAt: string | undefined, now: number): string | undefined {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return undefined

  const minutes = Math.ceil((at - now) / 60_000)
  if (minutes <= 0) return undefined

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days}d${hours}h`
  if (hours > 0) return `${hours}h${rest}m`
  return `${rest}m`
}

type Summary = {
  status?: { indicator?: string; description?: string }
  incidents?: { name?: string; status?: string }[]
  components?: { name?: string; status?: string }[]
}

export function parseStatus(text: string): ClaudeStatus {
  let summary: Summary
  try {
    summary = JSON.parse(text) as Summary
  } catch {
    return { level: 'unknown' }
  }

  const incident = summary.incidents?.find(i => OPEN_INCIDENT.includes(i.status ?? ''))?.name
  const degraded = (summary.components ?? [])
    .filter(c => WATCHED_COMPONENTS.includes(c.name ?? '') && c.status !== 'operational')
    .map(c => c.name)
  const detail = incident ?? (degraded.length > 0 ? `${degraded.join(', ')} 영향` : undefined)

  switch (summary.status?.indicator) {
    case 'none':
      return detail ? { level: 'minor', detail } : { level: 'ok' }
    case 'minor':
      return { level: 'minor', detail: detail ?? summary.status.description }
    case 'major':
    case 'critical':
      return { level: 'major', detail: detail ?? summary.status.description }
    case 'maintenance':
      return { level: 'maintenance', detail }
    default:
      return { level: 'unknown' }
  }
}
