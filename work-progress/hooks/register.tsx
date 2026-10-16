import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { readLive, readSessions, readWork, readWorks, writeLive, writeWork } from './files'
import {
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_SCHEMA,
  MAIN_LOOP,
  describeCall,
  guideText,
  liveState,
  parentsBySession,
  progressOf,
  pruneNotes,
  sameBoard,
  toBoard,
  toReport,
} from './model'
import { densityOf, drawPane, drawSummary } from './view'

const board = atom({ plugin: 'work-progress', key: 'board' } as const, null)
const expanded = atom({ plugin: 'work-progress', key: 'expanded' } as const, null)
const snapshot = atom({ plugin: 'work-progress', key: 'snapshot' } as const, null)
const published = atom({ plugin: 'work-progress', key: 'live' } as const, null)
const notes = atom({ plugin: 'work-progress', key: 'activity' } as const, null)

const PANE = 'work-progress'
const PANE_TITLE = '업무 진행도'
const COMMAND = 'progress'
const TOOL = 'mcp__work-progress__report'
const REFRESH_MS = 10_000
const CLOCK_STEP_MS = 60_000

// 다른 세션은 이 세션의 서브에이전트와 도구 사용을 볼 수 없으므로, 바뀔 때마다 파일로 알린다.
async function publishLive($: EngineInterface): Promise<void> {
  const [list, seen] = await Promise.all([$.agent.list(), read($, notes)])
  const live = liveState(list, seen ?? {})
  await update($, notes, prev => (prev ? pruneNotes(prev, live) : prev))
  const text = JSON.stringify(live)
  if ((await read($, published)) === text) return
  await writeLive($, await $.session.id(), live)
  await update($, published, () => text)
}

async function noteActivity($: EngineInterface, call: Record<string, unknown>): Promise<void> {
  const line = describeCall(call)
  if (!line) return
  const loop = typeof call.agentId === 'string' ? call.agentId : MAIN_LOOP
  const at = await $.clock.now()
  await update($, notes, prev => ({ ...prev, [loop]: { text: line, at } }))
}

// 다른 세션의 기록은 파일로만 들어오므로 주기적으로 다시 읽는다. 내용이 같으면 시각이 1분 넘게 흘렀을 때만 다시 그린다.
async function refresh($: EngineInterface): Promise<void> {
  await publishLive($).catch(() => undefined)
  const [works, sessions, live, now] = await Promise.all([readWorks($), readSessions($), readLive($), $.clock.now()])
  const next = toBoard(works, sessions, now, live)
  await update($, board, prev => (prev && sameBoard(prev, next) && now - prev.at < CLOCK_STEP_MS ? prev : next))
}

async function sessionName($: EngineInterface, id: string): Promise<string> {
  const live = (await readSessions($)).find(s => s.sessionId === id)
  return live?.name ?? id.slice(0, 8)
}

async function archive($: EngineInterface, id: string): Promise<void> {
  const work = await readWork($, id)
  if (!work) return
  await writeWork($, { ...work, status: 'archived', updatedAt: await $.clock.now() })
  await update($, expanded, () => null)
  await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    await $.command.register({ name: COMMAND, description: '모든 세션의 업무 진행도를 패널로 연다' })
    await refresh($)
    // hot reload 때도 session.start 가 다시 오지만 이미 만든 안내는 그대로 둔다.
    const current = await read($, board)
    await update($, snapshot, prev => prev ?? guideText(current))
    $.clock.every(REFRESH_MS, () => void refresh($))
    return result
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const sessionId = await $.session.id()
    const at = await $.clock.now()
    const input = e as Record<string, unknown>
    const id = typeof input.work_id === 'string' ? input.work_id : ''
    const previous = id ? await readWork($, id.trim().toLowerCase()) : null
    const agentId = typeof input.agentId === 'string' ? input.agentId : undefined
    const parentId = agentId ? parentsBySession(await readWorks($)).get(sessionId)?.id : undefined
    const by = { sessionId, sessionName: await sessionName($, sessionId), agentId, parentId, at }
    const report = toReport(input, previous, by)
    if ('error' in report) return { deny: report.error }

    await writeWork($, report.work)
    await refresh($)
    const { done, total } = progressOf(report.work)
    const lines = [`기록함: ${report.work.title} ${done}/${total} (${report.work.status})`, ...report.notes]
    return { result: lines.join('\n') }
  }).catch(() => ({ deny: '진행 기록을 저장하지 못했어요. 작업은 그대로 이어 가세요.' }))

  // 모든 도구 호출을 지켜보되 막지 않는다. 기록에 실패해도 도구는 그대로 돈다.
  on('tool.call', async ($, e, next) => {
    await noteActivity($, e as Record<string, unknown>).catch(() => undefined)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const text = (await read($, snapshot)) ?? guideText(null)
    return { sections: [...result.sections, { id: 'work-progress:guide', text, scope: 'session' as const }] }
  })

  on('command.run', { command: COMMAND }, async $ => {
    await refresh($)
    const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: opened.isPlaced ? '업무 진행도 패널을 열었어요.' : `패널을 열지 못했어요: ${opened.reason}` }
  }).catch(() => ({ text: '업무 진행도 패널을 열지 못했어요.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const [current, open] = await Promise.all([read($, board), read($, expanded)])
    return drawPane(els, current, open, e.props.bodyColumns, {
      onToggle: id => void update($, expanded, prev => (prev === id ? null : id)),
      onArchive: id => void archive($, id),
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const current = await read($, board)
    if (!current || (current.rows.length === 0 && current.untracked.length === 0)) return below

    const els = $.ui.resolve(e)
    const { Box } = els
    return (
      <Box flexDirection="column">
        {drawSummary(els, current, densityOf(e.props.bodyColumns), true)}
        {below}
      </Box>
    )
  })
}
