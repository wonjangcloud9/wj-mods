import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LaterItem, LaterStatus } from '../types'

import { readLater, readLive, readSessions, readWork, readWorks, writeLater, writeLive, writeWork } from './files'
import { LATER_TOOL_DESCRIPTION, LATER_TOOL_NAME, LATER_TOOL_SCHEMA, laterFromArgs, newLater, openLater, readLaterInput } from './later'
import {
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_SCHEMA,
  MAIN_LOOP,
  closingNote,
  describeCall,
  guideText,
  liveState,
  parentsBySession,
  progressOf,
  pruneNotes,
  runningIds,
  sameBoard,
  toBoard,
  toReport,
  unclosedChildren,
} from './model'
import { SUMMARY_ARGS, dailySummary } from './summary'
import { readOffsetMin } from './timezone'
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
// 이 도구 이름은 mod 를 처음 불러오기 전에는 엔진 타입 목록에 없어서 정규식으로 맞춘다.
const LATER_TOOL = new RegExp(`^mcp__work-progress__${LATER_TOOL_NAME}$`)
const REFRESH_MS = 10_000
const CLOCK_STEP_MS = 60_000

// 기한까지 남은 날을 셀 때 쓰는 이 컴퓨터의 UTC 차이(분). 다시 불러올 때도 session.start 가 다시 읽는다.
let offsetMin = 0

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
  const [works, sessions, live, later, now] = await Promise.all([
    readWorks($),
    readSessions($),
    readLive($),
    readLater($),
    $.clock.now(),
  ])
  const next = toBoard(works, sessions, now, live, offsetMin, later)
  await update($, board, prev => (prev && sameBoard(prev, next) && now - prev.at < CLOCK_STEP_MS ? prev : next))
}

async function sessionName($: EngineInterface, id: string): Promise<string> {
  const live = (await readSessions($)).find(s => s.sessionId === id)
  return live?.name ?? id.slice(0, 8)
}

// 메인 대화가 업무를 기록할 때, 그 아래 서브에이전트가 닫지 않고 끝난 기록을 알려 준다.
async function leftOpen($: EngineInterface, parentId: string): Promise<string[]> {
  const running = runningIds(await $.agent.list())
  return closingNote(unclosedChildren(await readWorks($), parentId, running))
}

async function archive($: EngineInterface, id: string): Promise<void> {
  const work = await readWork($, id)
  if (!work) return
  await writeWork($, { ...work, status: 'archived', updatedAt: await $.clock.now() })
  await update($, expanded, () => null)
  await refresh($)
}

// 나중에 할 일 id. 여러 세션이 함께 쓰므로 무작위 글자로 겹치지 않게 한다.
function laterId(): string {
  return `later-${crypto.randomUUID().slice(0, 8)}`
}

async function closeLater($: EngineInterface, id: string, status: Exclude<LaterStatus, 'open'>): Promise<void> {
  const item = (await readLater($)).find(entry => entry.id === id)
  if (!item) return
  await writeLater($, { ...item, status, updatedAt: await $.clock.now() })
  await refresh($)
}

async function addLaterByUser($: EngineInterface, said: Pick<LaterItem, 'text' | 'topic'>): Promise<void> {
  const sessionId = await $.session.id()
  const by = { sessionName: await sessionName($, sessionId), at: await $.clock.now() }
  await writeLater($, newLater(said.text, by, laterId(), said.topic ? { topic: said.topic } : {}))
  await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    await $.tool.register({
      name: LATER_TOOL_NAME,
      description: LATER_TOOL_DESCRIPTION,
      inputSchema: LATER_TOOL_SCHEMA,
      isDeferred: false,
    })
    await $.command.register({
      name: COMMAND,
      description:
        '모든 세션의 업무 진행도를 패널로 연다. /progress 요약 은 최근 24시간 업무를 글로 정리하고, /progress 나중 <할 일> 은 나중에 할 일을 남긴다',
    })
    offsetMin = await readOffsetMin($)
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
    const children = agentId ? [] : await leftOpen($, report.work.id).catch(() => [])
    const lines = [`기록함: ${report.work.title} ${done}/${total} (${report.work.status})`, ...report.notes, ...children]
    return { result: lines.join('\n') }
  }).catch(() => ({ deny: '진행 기록을 저장하지 못했어요. 작업은 그대로 이어 가세요.' }))

  on('tool.call', { tool: LATER_TOOL }, async ($, e) => {
    const input = e as Record<string, unknown>
    const sessionId = await $.session.id()
    const [works, later, at, name] = await Promise.all([readWorks($), readLater($), $.clock.now(), sessionName($, sessionId)])
    const change = readLaterInput(input, {
      works: new Map(works.map(work => [work.id, work.title])),
      open: new Map(openLater(later).map(item => [item.id, item])),
      by: { sessionName: name, at },
      newId: laterId,
    })
    if ('error' in change) return { deny: change.error }
    await Promise.all([...change.add, ...change.close].map(item => writeLater($, item)))
    await refresh($)
    return { result: change.notes.join('\n') }
  }).catch(() => ({ deny: '나중에 할 일을 저장하지 못했어요. 작업은 그대로 이어 가세요.' }))

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

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (SUMMARY_ARGS.includes(e.args.trim().toLowerCase())) {
      return { text: dailySummary(await readWorks($), await $.clock.now(), offsetMin, await readLater($)) }
    }
    const later = laterFromArgs(e.args)
    if (later) {
      await addLaterByUser($, later)
      return { text: `나중에 할 일로 남겼어요: ${later.topic ? `[${later.topic}] ` : ''}${later.text}` }
    }
    await refresh($)
    const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: opened.isPlaced ? '업무 진행도 패널을 열었어요.' : `패널을 열지 못했어요: ${opened.reason}` }
  }).catch(() => ({ text: '업무 진행도 패널을 열지 못했어요.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const [current, open] = await Promise.all([read($, board), read($, expanded)])
    return drawPane(els, current, open, e.props.bodyColumns, {
      onToggle: id => void update($, expanded, prev => (prev === id ? null : id)),
      onExpand: key => void update($, expanded, () => key),
      onArchive: id => void archive($, id),
      onCloseLater: (id, status) => void closeLater($, id, status),
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const current = await read($, board)
    if (!current || (current.rows.length === 0 && current.untracked.length === 0 && current.later.length === 0)) return below

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
