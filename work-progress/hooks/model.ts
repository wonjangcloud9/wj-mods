import type {
  Activity,
  Board,
  ChildRow,
  LiveAgent,
  LiveSession,
  Phase,
  SessionLive,
  Step,
  Work,
  WorkRow,
  WorkStatus,
} from '../types'

const DAY_MS = 24 * 60 * 60_000
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const PHASE_ORDER: Phase[] = ['yourTurn', 'running', 'stalled', 'paused', 'done']
const REPORTED_STATUS: WorkStatus[] = ['active', 'paused', 'done']
const ACTIVE_AGENT = ['pending', 'running', 'waiting']
const ACTIVITY_LENGTH = 80
export const MAIN_LOOP = 'main'

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function toStep(value: unknown): Step | null {
  const { title, isDone, done, evidence } = (value ?? {}) as Record<string, unknown>
  const name = text(title)
  if (!name) return null
  const flag = typeof isDone === 'boolean' ? isDone : done === true
  const proof = text(evidence)
  return proof ? { title: name, isDone: flag, evidence: proof } : { title: name, isDone: flag }
}

function toSteps(value: unknown): Step[] {
  return Array.isArray(value) ? value.flatMap(item => toStep(item) ?? []) : []
}

export function toWork(value: unknown): Work | null {
  const v = (value ?? {}) as Record<string, unknown>
  const id = text(v.id)
  const title = text(v.title)
  const sessionId = text(v.sessionId)
  const status = v.status as WorkStatus
  if (!id || !title || !sessionId || typeof v.updatedAt !== 'number') return null
  if (!['active', 'paused', 'done', 'archived'].includes(status)) return null
  return {
    id,
    title,
    steps: toSteps(v.steps),
    now: text(v.now),
    question: text(v.question),
    status,
    sessionId,
    sessionName: text(v.sessionName) ?? sessionId.slice(0, 8),
    agentId: text(v.agentId),
    parentId: text(v.parentId),
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : v.updatedAt,
    updatedAt: v.updatedAt,
    doneAt: typeof v.doneAt === 'number' ? v.doneAt : undefined,
  }
}

// ~/.claude/sessions/<pid>.json 은 엔진이 살아 있는 세션마다 남기는 기록이다.
export function toLiveSession(value: unknown): LiveSession | null {
  const { sessionId, name, status } = (value ?? {}) as Record<string, unknown>
  const id = text(sessionId)
  if (!id) return null
  return { sessionId: id, name: text(name) ?? id.slice(0, 8), isBusy: status === 'busy' }
}

function baseName(path: unknown): string | undefined {
  return text(path)?.split('/').filter(Boolean).pop()
}

function detailOf(call: Record<string, unknown>): string | undefined {
  switch (call.tool) {
    // 명령 본문에는 비밀값이 섞일 수 있어 설명이 없으면 프로그램 이름만 쓴다.
    case 'Bash':
      return text(call.description) ?? text(call.command)?.split(/\s+/)[0]
    case 'Agent':
      return text(call.description)
    case 'Read':
    case 'Edit':
    case 'Write':
      return baseName(call.file_path)
    case 'NotebookEdit':
      return baseName(call.notebook_path)
    case 'Grep':
    case 'Glob':
      return text(call.pattern)
    case 'WebSearch':
      return text(call.query)
    case 'Skill':
      return text(call.skill)
    default:
      return undefined
  }
}

// 도구 호출을 패널의 "최근" 한 줄로 바꾼다. 진행 기록 도구 자체는 활동으로 치지 않는다.
export function describeCall(call: Record<string, unknown>): string | undefined {
  const tool = text(call.tool)
  if (!tool || tool === `mcp__work-progress__${TOOL_NAME}`) return undefined
  const name = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(' ') : tool
  const detail = detailOf(call)
  return [...(detail ? `${name} ${detail}` : name)].slice(0, ACTIVITY_LENGTH).join('')
}

// 이 세션이 다른 세션에 알릴 상태. 아직 도는 서브에이전트와 각자의 최근 활동만 남긴다.
export function liveState(
  list: { id: string; description: string; status: string }[],
  notes: Record<string, Activity>,
): SessionLive {
  const agents = list
    .filter(agent => ACTIVE_AGENT.includes(agent.status))
    .map(({ id, description }) => (notes[id] ? { id, description, activity: notes[id] } : { id, description }))
  const main = notes[MAIN_LOOP]
  return main ? { activity: main, agents } : { agents }
}

// 끝난 서브에이전트의 활동은 버린다.
export function pruneNotes(notes: Record<string, Activity>, live: SessionLive): Record<string, Activity> {
  const keep = new Set([MAIN_LOOP, ...live.agents.map(agent => agent.id)])
  return Object.fromEntries(Object.entries(notes).filter(([loop]) => keep.has(loop)))
}

function toActivity(value: unknown): Activity | undefined {
  const { text: line, at } = (value ?? {}) as Record<string, unknown>
  const said = text(line)
  return said && typeof at === 'number' ? { text: said, at } : undefined
}

export function toSessionLive(value: unknown): { sessionId: string; live: SessionLive } | null {
  const { sessionId, agents, activity } = (value ?? {}) as Record<string, unknown>
  const id = text(sessionId)
  if (!id || !Array.isArray(agents)) return null
  const list: LiveAgent[] = agents.flatMap(item => {
    const { id: agentId, description, activity: done } = (item ?? {}) as Record<string, unknown>
    const key = text(agentId)
    if (!key) return []
    const recent = toActivity(done)
    const agent = { id: key, description: text(description) ?? key }
    return [recent ? { ...agent, activity: recent } : agent]
  })
  const main = toActivity(activity)
  return { sessionId: id, live: main ? { activity: main, agents: list } : { agents: list } }
}

export function toId(value: unknown): string | undefined {
  const raw = text(value)?.toLowerCase()
  if (!raw) return undefined
  const id = raw.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
  return ID_PATTERN.test(id) ? id : undefined
}

export type Reporter = { sessionId: string; sessionName: string; agentId?: string; parentId?: string; at: number }
export type Report = { work: Work; notes: string[] } | { error: string }

export function toReport(input: Record<string, unknown>, previous: Work | null, by: Reporter): Report {
  const id = toId(input.work_id)
  if (!id) return { error: 'work_id 는 영문 소문자, 숫자, 하이픈으로 적어 주세요.' }
  const title = text(input.title) ?? previous?.title
  if (!title) return { error: 'title 에 업무 목표를 한 줄로 적어 주세요.' }
  const steps = toSteps(input.steps)
  if (steps.length === 0) return { error: 'steps 에 전체 단계 목록을 한 개 이상 보내 주세요.' }

  const asked = input.status as WorkStatus
  const status = REPORTED_STATUS.includes(asked) ? asked : 'active'
  const isNewlyDone = status === 'done' && previous?.status !== 'done'
  const work: Work = {
    id,
    title,
    steps,
    now: text(input.now),
    question: text(input.question),
    status,
    sessionId: by.sessionId,
    sessionName: by.sessionName,
    agentId: by.agentId,
    parentId: by.agentId ? previous?.parentId ?? by.parentId : undefined,
    createdAt: previous?.createdAt ?? by.at,
    updatedAt: by.at,
    doneAt: status === 'done' ? (isNewlyDone ? by.at : previous?.doneAt ?? by.at) : undefined,
  }
  const unproven = steps.filter(step => step.isDone && !step.evidence).map(step => step.title)
  const notes = unproven.length > 0 ? [`근거 없이 완료로 표시한 단계: ${unproven.join(', ')}`] : []
  return { work, notes }
}

export function progressOf(work: Work): { done: number; total: number; percent: number } {
  const total = work.steps.length
  const done = work.steps.filter(step => step.isDone).length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

function isVisible(work: Work, now: number): boolean {
  if (work.status === 'archived') return false
  if (work.status === 'done') return now - (work.doneAt ?? work.updatedAt) < DAY_MS
  return true
}

function newest(works: Work[]): Work | undefined {
  return works.reduce<Work | undefined>((best, work) => (!best || best.updatedAt < work.updatedAt ? work : best), undefined)
}

function childOf(agent: LiveAgent, record: Work | undefined): ChildRow {
  const recent = agent.activity ? { activity: agent.activity } : {}
  if (!record) return { id: agent.id, title: agent.description, ...recent }
  const { done, total } = progressOf(record)
  return { id: agent.id, title: record.title, done, total, ...recent }
}

function finishedOf(record: Work): ChildRow {
  const { done, total } = progressOf(record)
  return { id: record.id, title: record.title, done, total }
}

export function isSubWork(work: Work): boolean {
  return Boolean(work.agentId || work.parentId)
}

// 서브에이전트를 붙일 세션별 부모. 진행 중인 업무가 없으면 가장 최근에 보류한 업무를 쓴다.
export function parentsBySession(works: Work[]): Map<string, Work> {
  const parents = new Map<string, Work>()
  for (const work of works) {
    if (isSubWork(work) || (work.status !== 'active' && work.status !== 'paused')) continue
    const seen = parents.get(work.sessionId)
    const isBetter = !seen || (seen.status === work.status ? seen.updatedAt < work.updatedAt : work.status === 'active')
    if (isBetter) parents.set(work.sessionId, work)
  }
  return parents
}

// 서브에이전트가 일하는 동안에는 메인 대화가 입력을 기다리거나 보류로 적어 두었어도 그 업무는 작업 중이다.
function phaseOf(work: Work, live: LiveSession | undefined, isCurrent: boolean, hasAgents: boolean): Phase {
  if (work.status === 'done') return 'done'
  if (hasAgents) return 'running'
  if (work.status === 'paused') return 'paused'
  if (!live || !isCurrent) return 'stalled'
  return live.isBusy ? 'running' : 'yourTurn'
}

export function toBoard(
  works: Work[],
  sessions: LiveSession[],
  now: number,
  live: Map<string, SessionLive> = new Map(),
): Board {
  const bySession = new Map(sessions.map(s => [s.sessionId, s]))
  // 끝난 세션이 남긴 상태는 믿지 않는다.
  const stateOf = (sessionId: string) => (bySession.has(sessionId) ? live.get(sessionId) : undefined)
  const agentsOf = (sessionId: string) => stateOf(sessionId)?.agents ?? []
  const recordOf = (agentId: string) => newest(works.filter(work => work.agentId === agentId))

  const parents = parentsBySession(works)
  // 한 세션이 업무를 여러 개 열어 두었으면 메인 대화가 가장 최근에 기록한 진행 중 업무만 그 세션의 현재 업무로 본다.
  const latest = new Map([...parents].filter(([, work]) => work.status === 'active'))

  const mainRows: WorkRow[] = works
    .filter(work => !isSubWork(work) && isVisible(work, now))
    .map(work => {
      const isCurrent = latest.get(work.sessionId)?.id === work.id
      const isParent = parents.get(work.sessionId)?.id === work.id
      const running = isParent ? agentsOf(work.sessionId) : []
      const runningIds = new Set(running.map(agent => agent.id))
      const activity = isParent ? stateOf(work.sessionId)?.activity : undefined
      const finished = works
        .filter(record => record.parentId === work.id && !(record.agentId && runningIds.has(record.agentId)))
        .sort((a, b) => a.createdAt - b.createdAt)
      return {
        work,
        phase: phaseOf(work, bySession.get(work.sessionId), isCurrent, running.length > 0),
        children: running.map(agent => childOf(agent, recordOf(agent.id))),
        finished: finished.map(finishedOf),
        ...(activity ? { activity } : {}),
      }
    })
  // 서브에이전트의 기록은 부모 업무 아래에 붙는다. 부모가 없으면 그 서브에이전트가 도는 동안만 따로 보인다.
  const orphanRows: WorkRow[] = works.flatMap(work => {
    const { agentId } = work
    if (!agentId || parents.has(work.sessionId) || work.status !== 'active') return []
    const agent = agentsOf(work.sessionId).find(item => item.id === agentId)
    if (!agent || recordOf(agentId) !== work) return []
    return [
      { work, phase: 'running' as const, children: [], finished: [], ...(agent.activity ? { activity: agent.activity } : {}) },
    ]
  })

  const rows = [...mainRows, ...orphanRows].sort(
    (a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) || b.work.updatedAt - a.work.updatedAt,
  )
  const tracked = new Set(
    rows.filter(row => row.phase === 'running' || row.phase === 'yourTurn').map(row => row.work.sessionId),
  )
  const untracked = sessions.filter(s => !tracked.has(s.sessionId))
  return { rows, untracked, at: now }
}

export const PHASE_LABEL: Record<Phase, string> = {
  yourTurn: '내 차례',
  running: '작업 중',
  stalled: '멈춤',
  paused: '보류',
  done: '오늘 완료',
}

export function countPhases(board: Board): { phase: Phase; count: number }[] {
  return PHASE_ORDER.map(phase => ({ phase, count: board.rows.filter(row => row.phase === phase).length })).filter(
    item => item.count > 0,
  )
}

export function bar(percent: number, width: number): { filled: string; rest: string } {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * width)
  return { filled: '━'.repeat(filled), rest: '─'.repeat(width - filled) }
}

export function ago(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// 화면에 그릴 때 바뀌는 시각을 빼고 비교해, 내용이 같으면 다시 그리지 않는다.
export function sameBoard(a: Board | null, b: Board): boolean {
  if (!a) return false
  return JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 })
}

export const TOOL_NAME = 'report'

export const TOOL_DESCRIPTION =
  '여러 단계짜리 업무의 목표, 전체 단계 목록, 지금 하는 일을 기록한다. 사용자는 이 기록으로 모든 세션의 진행도를 한 화면에서 본다. 매번 전체 단계 목록을 보낸다.'

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    work_id: {
      type: 'string',
      description: '업무 식별자. 영문 소문자, 숫자, 하이픈. 이전 세션의 업무를 이어 가면 기존 id 를 그대로 쓴다.',
    },
    title: { type: 'string', description: '업무 목표 한 줄. 한국어 40자 안팎.' },
    steps: {
      type: 'array',
      description: '전체 단계 목록. 끝난 단계도 빼지 않는다.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '단계 이름 한 줄' },
          done: { type: 'boolean' },
          evidence: { type: 'string', description: '완료 근거. 커밋 해시, 테스트 결과, 확인한 화면처럼 짧게.' },
        },
        required: ['title', 'done'],
      },
    },
    now: { type: 'string', description: '지금 하는 일 한 줄' },
    question: { type: 'string', description: '사용자 답을 기다리는 질문 한 줄. 없으면 생략.' },
    status: { type: 'string', enum: ['active', 'paused', 'done'], description: '기본은 active' },
  },
  required: ['work_id', 'title', 'steps'],
}

const GUIDE = `# 업무 진행 기록
사용자는 여러 세션의 업무 진행도를 한 화면에서 본다. 그 화면은 \`mcp__work-progress__${TOOL_NAME}\` 기록으로 채워진다.
- 3단계 이상이거나 여러 턴에 걸칠 작업을 시작하면 목표와 전체 단계 목록을 기록한다. 한 번에 끝나는 질문, 설명, 작은 수정에는 기록하지 않는다.
- 단계를 끝냈을 때, 계획이 바뀌어 단계가 늘거나 줄 때, 사용자 답을 기다리며 턴을 끝내기 직전, 업무가 끝났을 때 다시 기록한다.
- 단계 완료는 근거가 있을 때만 표시하고 evidence 에 짧게 적는다.
- 이전 세션에서 하던 업무를 이어 가면 아래 목록의 work_id 를 그대로 쓴다.
- 서브에이전트로 일할 때는 부모 대화의 work_id 를 쓰지 않고 맡은 일만 새 work_id 로 기록한다. 부모 업무 아래 한 줄로 보인다.`

// 시스템 안내가 바뀌면 대화 전체의 prompt cache 가 깨지므로 세션 시작 때 한 번만 만든다.
export function guideText(board: Board | null): string {
  const open = (board?.rows ?? []).filter(row => row.phase !== 'done' && !isSubWork(row.work))
  if (open.length === 0) return `${GUIDE}\n\n진행 중인 업무: 없음`
  const lines = open.map(({ work }) => {
    const { done, total } = progressOf(work)
    return `- ${work.id} · ${work.title} · ${done}/${total} 단계 · @${work.sessionName} · ${ago(work.updatedAt, board?.at ?? work.updatedAt)}`
  })
  return `${GUIDE}\n\n세션 시작 때 진행 중이던 업무:\n${lines.join('\n')}`
}
