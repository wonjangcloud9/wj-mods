import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ClaudeStatus, Limit } from '../types'
import { crossedAlerts, toSent } from './alerts'
import { STATUS_TEXT, meter, parseStatus, sortLimits, toLimits } from './format'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [])
const claude = atom({ plugin: 'usage-band', key: 'claude' } as const, { level: 'pending' })
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)

const STATUS_URL = 'https://status.claude.com/api/v2/summary.json'
const STATUS_EVERY_MS = 5 * 60_000
const TICK_MS = 60_000
const LIMITS_KEY = 'limits'
const ALERTS_KEY = 'alerts'
const ALERT_TOAST_MS = 10_000
const CHIP_BAR_WIDTH = 6
const CHIP_BAR_MIN_COLUMNS = 72

const STATUS_COLOR: Record<ClaudeStatus['level'], string> = {
  pending: 'subtle',
  ok: 'success',
  minor: 'warning',
  major: 'error',
  maintenance: 'suggestion',
  unknown: 'subtle',
}

async function alertCrossed($: EngineInterface, live: Limit[]): Promise<void> {
  const { alerts, sent } = crossedAlerts(live, toSent(await $.store.get(ALERTS_KEY)), await $.clock.now())
  await $.store.set(ALERTS_KEY, sent)
  for (const text of alerts) $.ui.toast(text, { timeoutMs: ALERT_TOAST_MS })
}

async function saveLimits($: EngineInterface, live: Limit[]): Promise<void> {
  if (live.length === 0) return
  await update($, limits, () => live)
  await $.store.set(LIMITS_KEY, live)
  await alertCrossed($, live)
}

async function loadLimits($: EngineInterface): Promise<void> {
  const live = toLimits((await $.session.usage()).rateLimits)
  if (live.length > 0) return saveLimits($, live)

  const stored = toLimits(await $.store.get(LIMITS_KEY))
  if (stored.length > 0) await update($, limits, () => stored)
}

async function refreshStatus($: EngineInterface): Promise<void> {
  const status = await $.http.fetch(STATUS_URL).then(
    res => (res.ok ? parseStatus(res.text) : { level: 'unknown' as const }),
    () => ({ level: 'unknown' as const }),
  )
  await update($, claude, () => status)
}

async function tick($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await Promise.all([tick($), loadLimits($)])
    void refreshStatus($)
    $.clock.every(TICK_MS, () => void tick($))
    $.clock.every(STATUS_EVERY_MS, () => void refreshStatus($))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await saveLimits($, toLimits(e.rateLimits))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const { Box, Text } = $.ui.resolve(e)
    const [list, status, at] = await Promise.all([read($, limits), read($, claude), read($, now)])
    const columns = e.props.bodyColumns
    const hasBars = columns >= CHIP_BAR_MIN_COLUMNS
    const meters = sortLimits(list).map(limit => meter(limit, at, CHIP_BAR_WIDTH))

    const chip = (
      <Box flexDirection="row" columnGap={2}>
        {meters.length === 0 ? <Text dimColor>사용량 대기 중</Text> : ''}
        {meters.map(m => (
          <Text>
            <Text bold>{m.label}</Text>{' '}
            {hasBars ? <Text color={m.tone}>{m.filled}</Text> : ''}
            {hasBars ? <Text dimColor>{`${m.rest} `}</Text> : ''}
            <Text color={m.tone} bold>{`${m.percent}%`}</Text>
            {m.reset ? <Text dimColor>{` ${m.reset}`}</Text> : ''}
          </Text>
        ))}
        <Text>
          <Text color={STATUS_COLOR[status.level]}>●</Text> {status.level === 'ok' ? '정상' : STATUS_TEXT[status.level]}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="flex-end" width={columns}>
          {chip}
        </Box>
        {below}
      </Box>
    )
  })
}
