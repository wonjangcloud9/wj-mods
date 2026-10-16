import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

import { crossedAlerts, toSent } from './alerts'
import { bar, meter, parseStatus, tone, untilReset } from './format'

const NOW = Date.parse('2026-10-06T03:00:00Z')
const PLUGIN = 'usage-band'

const LIMITS: SessionRateLimit[] = [
  { kind: 'seven_day', percentUsed: 51.2, resetsAt: '2026-10-08T08:00:00Z' },
  { kind: 'five_hour', percentUsed: 32, resetsAt: '2026-10-06T05:14:00Z' },
]

const SUMMARY_OK = JSON.stringify({
  status: { indicator: 'none', description: 'All Systems Operational' },
  incidents: [],
  components: [{ name: 'Claude Code', status: 'operational' }],
})

const SUMMARY_MINOR = JSON.stringify({
  status: { indicator: 'minor', description: 'Minor Service Outage' },
  incidents: [{ name: 'Elevated errors on Claude Code', status: 'investigating' }],
})

type World = { rateLimits?: SessionRateLimit[]; stored?: Record<string, unknown>; status?: string | 'offline' }

function world(on: On, options: World = {}): string[] {
  const toasts: string[] = []
  mock.clock(on, { now: NOW })
  mock.store(on, options.stored ?? {})
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: options.rateLimits ?? [] },
  }))
  on('http.fetch', () => {
    if (options.status === 'offline') return { deny: 'offline' }
    return { value: { status: 200, ok: true, headers: {}, text: options.status ?? SUMMARY_OK } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return toasts
}

function mount($: Engine, bodyColumns: number, surface: 'terminal' | 'desktop' = 'terminal', hasSurvey = false) {
  return $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows: 12, bodyColumns, scroll: { offset: 0, bodyRows: 11 }, view: {} },
  })
}

const START = { cwd: '/tmp', surface: 'terminal' as const, isInteractive: true }

describe('format', () => {
  test('초기화까지 남은 시간을 짧게 쓴다', () => {
    expect(untilReset('2026-10-06T05:14:00Z', NOW)).toBe('2h14m')
    expect(untilReset('2026-10-08T08:00:00Z', NOW)).toBe('2d5h')
    expect(untilReset('2026-10-06T03:09:30Z', NOW)).toBe('10m')
    expect(untilReset('2026-10-06T02:00:00Z', NOW)).toBeUndefined()
    expect(untilReset(undefined, NOW)).toBeUndefined()
  })

  test('사용률에 따라 막대와 색을 정한다', () => {
    expect(bar(32, 12)).toEqual({ filled: '━━━━', rest: '────────' })
    expect(bar(140, 4)).toEqual({ filled: '━━━━', rest: '' })
    expect([tone(69), tone(70), tone(90)]).toEqual(['success', 'warning', 'error'])
  })

  test('초기화 시각이 지난 창은 0% 로 본다', () => {
    const past = { kind: 'five_hour', percentUsed: 95, resetsAt: '2026-10-06T02:00:00Z' }
    expect(meter(past, NOW, 4)).toEqual({ label: '5시간', percent: 0, tone: 'success', filled: '', rest: '────' })
  })

  test('창마다 80%·95% 를 처음 넘을 때만 알리고 초기화되면 다시 알린다', () => {
    const at = (percentUsed: number) => [{ kind: 'five_hour', percentUsed, resetsAt: '2026-10-06T05:14:00Z' }]

    const first = crossedAlerts(at(81), {}, NOW)
    expect(first.alerts).toEqual(['5시간 사용량이 80%를 넘었습니다 · 2h14m 뒤 초기화'])

    const same = crossedAlerts(at(88), first.sent, NOW)
    expect(same.alerts).toEqual([])

    const higher = crossedAlerts(at(96), same.sent, NOW)
    expect(higher.alerts).toEqual(['5시간 사용량이 95%를 넘었습니다 · 2h14m 뒤 초기화'])

    const reset = crossedAlerts(at(3), higher.sent, NOW)
    expect(reset).toEqual({ alerts: [], sent: { five_hour: 0 } })
    expect(crossedAlerts(at(80), reset.sent, NOW).alerts).toHaveLength(1)
  })

  test('저장된 알림 기록이 깨져 있으면 빈 기록으로 본다', () => {
    expect(toSent('broken')).toEqual({})
    expect(toSent({ five_hour: 80, seven_day: 'x' })).toEqual({ five_hour: 80 })
  })

  test('status page 응답을 해석한다', () => {
    expect(parseStatus(SUMMARY_OK)).toEqual({ level: 'ok' })
    expect(parseStatus(SUMMARY_MINOR)).toEqual({ level: 'minor', detail: 'Elevated errors on Claude Code' })
    expect(
      parseStatus(
        JSON.stringify({
          status: { indicator: 'none' },
          components: [{ name: 'Claude Code', status: 'degraded_performance' }],
        }),
      ),
    ).toEqual({ level: 'minor', detail: 'Claude Code 영향' })
    expect(parseStatus('<html>')).toEqual({ level: 'unknown' })
  })
})

test('오른쪽 한 줄에 사용률과 status 를 보인다', async ($, on) => {
  world(on, { rateLimits: LIMITS })
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount($, 100, surface)
    expect(await ui.find({ type: 'Text', text: /^5시간 ━+─+ 32% 2h14m$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^주간 ━+─+ 51% 2d5h$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● 정상/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /초기화/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('좁은 화면에서는 막대를 빼고 숫자만 보인다', async ($, on) => {
  world(on, { rateLimits: LIMITS })
  await $.session.start(START)

  const ui = await mount($, 50)
  expect(await ui.find({ type: 'Text', text: /^5시간 32% 2h14m$/ })).toBeDefined()
})

test('첫 응답 전에는 대기 표시를 하고 측정이 오면 사용률로 바꾼다', async ($, on) => {
  world(on)
  await $.session.start(START)

  const ui = await mount($, 100)
  expect(await ui.find({ type: 'Text', text: /사용량 대기 중/ })).toBeDefined()

  await $.session.measure({ context: { window: 200_000 }, rateLimits: LIMITS, changed: ['rateLimits'] })
  expect(await ui.find({ type: 'Text', text: /5시간.*32%/ })).toBeDefined()
})

test('이전 세션이 남긴 사용량을 먼저 보여 준다', async ($, on) => {
  world(on, { stored: { limits: LIMITS } })
  await $.session.start(START)

  const ui = await mount($, 100)
  expect(await ui.find({ type: 'Text', text: /주간.*51%/ })).toBeDefined()
})

test('장애가 있으면 칩에 일부 장애로 표시한다', async ($, on) => {
  world(on, { rateLimits: LIMITS, status: SUMMARY_MINOR })
  await $.session.start(START)

  const ui = await mount($, 100)
  expect(await ui.find({ type: 'Text', text: /● Claude 일부 장애/ })).toBeDefined()
})

test('status 조회가 실패하면 확인 불가로 표시한다', async ($, on) => {
  world(on, { rateLimits: LIMITS, status: 'offline' })
  await $.session.start(START)

  const ui = await mount($, 100)
  expect(await ui.find({ type: 'Text', text: /Claude status 확인 불가/ })).toBeDefined()
})

test('사용률이 80% 를 넘는 측정이 오면 toast 를 한 번 띄운다', async ($, on) => {
  const toasts = world(on, { rateLimits: LIMITS })
  await $.session.start(START)
  expect(toasts).toEqual([])

  const over = (percentUsed: number) => [{ kind: 'five_hour', percentUsed, resetsAt: '2026-10-06T05:14:00Z' }, LIMITS[0]!]
  await $.session.measure({ context: { window: 200_000 }, rateLimits: over(81), changed: ['rateLimits'] })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: over(84), changed: ['rateLimits'] })
  expect(toasts).toEqual(['5시간 사용량이 80%를 넘었습니다 · 2h14m 뒤 초기화'])
})

test('다른 세션이 이미 알린 기준은 다시 알리지 않는다', async ($, on) => {
  const high = [{ kind: 'five_hour', percentUsed: 85, resetsAt: '2026-10-06T05:14:00Z' }]
  const toasts = world(on, { rateLimits: high, stored: { alerts: { five_hour: 80 } } })
  await $.session.start(START)

  expect(toasts).toEqual([])
})

test('survey 가 band 를 쓰는 동안에는 비켜 준다', async ($, on) => {
  world(on, { rateLimits: LIMITS })
  await $.session.start(START)

  const ui = await mount($, 100, 'terminal', true)
  expect(await ui.find({ type: 'Text', text: /5시간/ })).toBeUndefined()
})
