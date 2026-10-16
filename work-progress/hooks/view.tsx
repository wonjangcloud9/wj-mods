import type { Elements, RenderSurface } from 'claude-code'

import type { Board, ChildRow, Phase, Work, WorkRow } from '../types'
import { PHASE_LABEL, PHASE_ORDER, ago, bar, countPhases, progressOf, span, stepSpans, stepStartedAt } from './model'
import { remainingMs } from './pace'

type Els = Elements[RenderSurface]

// wide 는 모든 글자, narrow 는 부가 정보를 빼고, tiny 는 아이콘과 숫자만 남긴다.
export type Density = 'wide' | 'narrow' | 'tiny'

const PHASE_ICON: Record<Phase, string> = {
  yourTurn: '◆',
  running: '●',
  stalled: '○',
  paused: '‖',
  followUp: '□',
  done: '✓',
  dormant: '◌',
}
const PHASE_COLOR: Record<Phase, string> = {
  yourTurn: 'warning',
  running: 'suggestion',
  stalled: 'subtle',
  paused: 'subtle',
  followUp: 'warning',
  done: 'success',
  dormant: 'subtle',
}
// 이 칸들은 업무를 제목 한 줄로 접어 두고, 누른 업무만 펼친다.
const FOLDED: Phase[] = ['followUp', 'done', 'dormant']
const BAR_WIDTH: Record<Density, number> = { wide: 10, narrow: 6, tiny: 4 }
// 펼침 표시 한 칸과 공백 한 칸만큼 들여 써서 둘째 줄부터 제목과 줄을 맞춘다.
const INDENT = 2
const MAX_CHILDREN = 4
// 지금 단계가 이보다 오래 걸리면 막대 옆에 알린다.
const SLOW_STEP_MS = 30 * 60_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const MARK = { open: '▾', closed: '▸' }
// 덧붙이는 정보의 글자색. dimColor 는 어두운 배경에서 거의 안 보여서, 구분선 말고는 테마의 옅은 회색을 쓴다.
const SOFT = 'subtle'

export function densityOf(columns: number): Density {
  if (columns >= 60) return 'wide'
  if (columns >= 40) return 'narrow'
  return 'tiny'
}

// 한글과 전각 문자는 터미널에서 두 칸을 차지한다.
function cells(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  const isWide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  return isWide ? 2 : 1
}

export function widthOf(text: string): number {
  return [...text].reduce((sum, ch) => sum + cells(ch), 0)
}

export function fit(text: string, width: number): string {
  const chars = [...text]
  if (widthOf(text) <= width) return text
  let used = 0
  let out = ''
  for (const ch of chars) {
    if (used + cells(ch) > width - 1) break
    used += cells(ch)
    out += ch
  }
  return `${out}…`
}

// 칸마다 위에 긋는 선. 폭에 맞춰 늘이고 앞쪽에 칸 이름을 넣는다.
export function divider(label: string, columns: number): string {
  const head = `── ${label} `
  return `${head}${'─'.repeat(Math.max(2, columns - widthOf(head)))}`
}

function phaseCount(phase: Phase, count: number, density: Density): string {
  return density === 'tiny' ? `${PHASE_ICON[phase]}${count}` : `${PHASE_ICON[phase]} ${PHASE_LABEL[phase]} ${count}`
}

function isLeftOpen(child: ChildRow): boolean {
  return child.status === 'active' || child.status === 'paused'
}

export function drawSummary(els: Els, board: Board, density: Density, hasHint: boolean) {
  const { Text } = els
  const counts = countPhases(board)
  const total = density === 'wide' ? `업무 ${board.rows.length}개` : `업무 ${board.rows.length}`
  const untracked = density === 'wide' && board.untracked.length > 0 ? `기록 없는 세션 ${board.untracked.length}` : ''
  return (
    <Text wrap="truncate-end">
      <Text bold>{total}</Text>
      {counts.map(({ phase, count }) => (
        <Text key={`count-${phase}`}>
          <Text dimColor>{' · '}</Text>
          <Text color={PHASE_COLOR[phase]}>{phaseCount(phase, count, density)}</Text>
        </Text>
      ))}
      {untracked ? <Text color={SOFT}>{` · ${untracked}`}</Text> : ''}
      {hasHint && density !== 'tiny' ? <Text color={SOFT}>{'  /progress'}</Text> : ''}
    </Text>
  )
}

function drawHeader(els: Els, phase: Phase, count: number, columns: number) {
  const { Text } = els
  const label = phaseCount(phase, count, densityOf(columns))
  const rule = divider(label, columns).slice(`── ${label} `.length)
  return (
    <Text wrap="truncate-end" key={`head-${phase}`}>
      <Text dimColor>{'── '}</Text>
      <Text color={PHASE_COLOR[phase]} bold>
        {label}
      </Text>
      <Text dimColor>{` ${rule}`}</Text>
    </Text>
  )
}

// 서브에이전트가 완료로 닫지 않고 끝난 기록. 부모 업무를 접어 두어도 보인다.
function drawUnclosed(els: Els, unclosed: ChildRow[]) {
  const { Text } = els
  return unclosed.map(child => (
    <Text wrap="truncate-end" key={`open-${child.id}`}>
      <Text color={SOFT}>{'└ '}</Text>
      <Text color="warning">{child.status === 'paused' ? PHASE_ICON.paused : PHASE_ICON.stalled}</Text>
      {` ${child.title}`}
      {child.total ? ` ${child.done}/${child.total}` : ''}
      <Text color="warning">{child.status === 'paused' ? ' · 보류로 끝남' : ' · 닫지 않고 끝남'}</Text>
      {child.now ? <Text color={SOFT}>{` · ${child.now}`}</Text> : ''}
    </Text>
  ))
}

// 부모 업무 아래 서브에이전트 줄. 끝난 서브에이전트는 한 줄로 묶었다가 업무를 펼치면 하나씩 보인다.
function drawChildren(els: Els, row: WorkRow, isOpen: boolean, density: Density) {
  const { Box, Text } = els
  const { children, finished } = row
  if (children.length === 0 && finished.length === 0) return ''
  const unclosed = finished.filter(isLeftOpen)
  const closed = finished.filter(child => !isLeftOpen(child))
  if (density === 'tiny') {
    const parts = [
      ...(children.length > 0 ? [`서브 ${children.length}`] : []),
      ...(closed.length > 0 ? [`${PHASE_ICON.done}${closed.length}`] : []),
      ...(unclosed.length > 0 ? [`안 닫힘 ${unclosed.length}`] : []),
    ]
    return (
      <Box marginLeft={INDENT}>
        <Text color={SOFT}>{`└ ${parts.join(' ')}`}</Text>
      </Box>
    )
  }
  const hidden = children.length - MAX_CHILDREN
  return (
    <Box marginLeft={INDENT} flexDirection="column">
      {children.slice(0, MAX_CHILDREN).map(child => (
        <Text wrap="truncate-end" key={`child-${child.id}`}>
          <Text color={SOFT}>{'└ '}</Text>
          <Text color={PHASE_COLOR.running}>{PHASE_ICON.running}</Text>
          {` ${child.title}`}
          {child.total ? <Text bold>{` ${child.done}/${child.total}`}</Text> : ''}
          {child.activity ? <Text color={SOFT}>{` · 최근: ${child.activity.text}`}</Text> : ''}
        </Text>
      ))}
      {hidden > 0 ? <Text color={SOFT}>{`  서브에이전트 ${hidden}개 더`}</Text> : ''}
      {drawUnclosed(els, unclosed)}
      {isOpen ? (
        closed.map(child => (
          <Text color={SOFT} wrap="truncate-end" key={`finished-${child.id}`}>
            {'└ '}
            <Text color={PHASE_COLOR.done}>{PHASE_ICON.done}</Text>
            {` ${child.title}`}
            {child.total ? ` ${child.done}/${child.total}` : ''}
          </Text>
        ))
      ) : closed.length > 0 ? (
        <Text color={SOFT}>
          {'└ '}
          <Text color={PHASE_COLOR.done}>{PHASE_ICON.done}</Text>
          {` 서브에이전트 ${closed.length}개 끝남`}
        </Text>
      ) : (
        ''
      )}
    </Box>
  )
}

function drawFollowups(els: Els, work: Work) {
  const { Box, Text } = els
  if (!work.followups) return ''
  return (
    <Box marginLeft={INDENT} flexDirection="column">
      {work.followups.map((item, index) => (
        <Text wrap="truncate-end" key={`followup-${index}`}>
          <Text color={PHASE_COLOR.followUp}>{PHASE_ICON.followUp}</Text>
          {` ${item}`}
        </Text>
      ))}
    </Box>
  )
}

type StepKind = 'done' | 'current' | 'todo'

// 끝낸 단계 ●, 지금 단계 ◉, 남은 단계 ○. 완료한 업무에는 지금 단계가 없다.
function stepKinds(work: Work, phase: Phase): StepKind[] {
  const current = phase === 'done' || phase === 'followUp' ? -1 : work.steps.findIndex(step => !step.isDone)
  return work.steps.map((step, index) => (step.isDone ? 'done' : index === current ? 'current' : 'todo'))
}

const NODE: Record<StepKind, string> = { done: '●', current: '◉', todo: '○' }

// 끝낸 단계에서 끝낸 단계나 지금 단계로 가는 구간만 지나온 길로 친다. 순서를 건너뛰어 끝낸 단계 뒤는 가는 선이다.
function isWalked(kinds: StepKind[], index: number): boolean {
  return kinds[index] === 'done' && kinds[index + 1] !== undefined && kinds[index + 1] !== 'todo'
}

// 단계를 노드로 이은 한 줄. 지나온 구간은 굵은 선, 남은 구간은 가는 선으로 잇는다.
// 자리가 모자라면 선을 빼고 노드만, 그래도 모자라면 막대로 그린다.
function drawChain(els: Els, work: Work, phase: Phase, room: number, density: Density) {
  const { Text } = els
  const kinds = stepKinds(work, phase)
  const total = kinds.length
  const isJoined = total * 2 - 1 <= room
  if (total === 0 || (!isJoined && total > room)) {
    const meter = bar(progressOf(work).percent, BAR_WIDTH[density])
    return [
      <Text color={PHASE_COLOR[phase]} key="bar-filled">
        {meter.filled}
      </Text>,
      <Text color={SOFT} key="bar-rest">
        {meter.rest}
      </Text>,
    ]
  }
  return kinds.map((kind, index) => {
    const walked = isWalked(kinds, index)
    const link = isJoined && index < total - 1 ? (walked ? '━' : '─') : ''
    return (
      <Text key={`node-${index}`}>
        <Text color={kind === 'todo' ? SOFT : PHASE_COLOR[phase]} bold={kind === 'current'}>
          {NODE[kind]}
        </Text>
        {link ? (
          <Text color={walked ? PHASE_COLOR[phase] : SOFT}>
            {link}
          </Text>
        ) : (
          ''
        )}
      </Text>
    )
  })
}

// 펼친 업무의 단계를 위에서 아래로 흐르는 그림으로 그린다. 노드 사이를 세로선으로 잇는다.
function drawSteps(els: Els, work: Work, phase: Phase) {
  const { Text } = els
  const spans = stepSpans(work)
  const kinds = stepKinds(work, phase)
  return work.steps.flatMap((step, index) => {
    const kind = kinds[index] ?? 'todo'
    const took = spans[index]
    const node = (
      <Text color={kind === 'todo' ? SOFT : undefined} bold={kind === 'current'} wrap="truncate-end" key={`step-${index}`}>
        <Text color={kind === 'todo' ? SOFT : PHASE_COLOR[phase]}>{NODE[kind]}</Text>
        {` ${step.title}`}
        {took ? <Text color={SOFT}>{` · ${span(took)}`}</Text> : ''}
        {step.evidence ? <Text color={SOFT}>{` — ${step.evidence}`}</Text> : ''}
        {kind === 'current' ? <Text color={PHASE_COLOR[phase]}>{'  ← 지금'}</Text> : ''}
      </Text>
    )
    if (index === work.steps.length - 1) return [node]
    const walked = isWalked(kinds, index)
    const link = (
      <Text color={walked ? PHASE_COLOR[phase] : SOFT} key={`link-${index}`}>
        {walked ? '┃' : '│'}
      </Text>
    )
    return [node, link]
  })
}

// 업무 줄 아래 한 줄. 사용자 답을 기다리면 질문, 보류면 기다리는 이유, 아니면 지금 하는 일이나 다음 단계를 보인다.
function detailOf(row: WorkRow): { label: string; text: string; isAsk: boolean } | undefined {
  const { work, phase } = row
  if (phase === 'yourTurn' && work.question) return { label: '질문: ', text: work.question, isAsk: true }
  if (work.waitingFor) return { label: '기다림: ', text: work.waitingFor, isAsk: false }
  if (work.now) return { label: '지금: ', text: work.now, isAsk: false }
  const next = work.steps.find(step => !step.isDone)
  return next && phase !== 'done' && phase !== 'followUp' ? { label: '다음 단계: ', text: next.title, isAsk: false } : undefined
}

// 이름표는 옅은 회색, 내용은 본문 색으로 쓴다.
function drawLabeled(els: Els, label: string, text: string, tail = '') {
  const { Text } = els
  return (
    <Text wrap="truncate-end">
      <Text color={SOFT}>{label}</Text>
      {text}
      {tail ? <Text color={SOFT}>{tail}</Text> : ''}
    </Text>
  )
}

// 지금 단계가 오래 걸리면 "이 단계 1시간째"를 돌려준다. 누가 일하는 중일 때만 센다.
function slowStep(row: WorkRow, now: number): string {
  const { work, phase } = row
  if (phase !== 'running' && phase !== 'yourTurn') return ''
  if (work.steps.every(step => step.isDone)) return ''
  const started = stepStartedAt(work)
  if (started === undefined || now - started < SLOW_STEP_MS) return ''
  return `이 단계 ${span(now - started)}째`
}

// 남은 단계와 단계 하나에 걸리는 시간으로 본 예상. 예상이라 10분이 안 되면 분, 1시간이 안 되면 5분, 그 위는 10분 단위로 끊는다.
function etaText(row: WorkRow, now: number): string {
  if (row.paceMs === undefined) return ''
  const ms = remainingMs(row.work, row.paceMs, row.phase, now)
  if (ms === undefined) return ''
  const unit = ms < 10 * MINUTE_MS ? MINUTE_MS : ms < HOUR_MS ? 5 * MINUTE_MS : 10 * MINUTE_MS
  return `약 ${span(Math.round(ms / unit) * unit)} 남음`
}

type RowActions = { onToggle: (id: string) => void; onArchive: (id: string) => void }

// 완료·남은 일·오래 멈춤 칸의 업무는 제목 한 줄로 접는다. 남은 일과 닫히지 않은 서브 기록은 접어도 보인다.
function drawFolded(els: Els, row: WorkRow, now: number, columns: number, actions: RowActions) {
  const { Box, Button, Text } = els
  const { work, phase } = row
  const density = densityOf(columns)
  const unclosed = row.finished.filter(isLeftOpen)
  const { done, total } = progressOf(work)
  const parts = [
    ...(phase === 'dormant' ? [`${done}/${total}`] : []),
    ...(row.finished.length > 0 ? [`서브 ${row.finished.length}`] : []),
    ago(work.doneAt ?? work.updatedAt, now),
  ]
  const tail = density === 'tiny' ? '' : ` · ${parts.join(' · ')}`
  const title = fit(work.title, Math.max(4, columns - INDENT - widthOf(tail)))
  return (
    <Box flexDirection="column" key={`row-${work.id}`}>
      <Button key={`toggle-${work.id}`} plain onPress={() => actions.onToggle(work.id)}>
        <Text wrap="truncate-end">
          <Text color={SOFT}>{MARK.closed}</Text> <Text color={phase === 'followUp' ? undefined : SOFT}>{title}</Text>
          <Text color={SOFT}>{tail}</Text>
        </Text>
      </Button>
      {phase === 'followUp' ? drawFollowups(els, work) : ''}
      {phase === 'dormant' && work.waitingFor && density !== 'tiny' ? (
        <Box marginLeft={INDENT}>
          {drawLabeled(els, '기다림: ', work.waitingFor)}
        </Box>
      ) : (
        ''
      )}
      {unclosed.length > 0 && density !== 'tiny' ? (
        <Box marginLeft={INDENT} flexDirection="column">
          {drawUnclosed(els, unclosed)}
        </Box>
      ) : (
        ''
      )}
    </Box>
  )
}

function drawRow(els: Els, row: WorkRow, isOpen: boolean, now: number, columns: number, actions: RowActions) {
  const { Box, Button, Text } = els
  const { work, phase } = row
  if (FOLDED.includes(phase) && !isOpen) return drawFolded(els, row, now, columns, actions)
  const density = densityOf(columns)
  const { done, total } = progressOf(work)
  const title = fit(work.title, Math.max(4, columns - INDENT))
  const slow = density === 'tiny' ? '' : slowStep(row, now)
  const eta = density === 'tiny' ? '' : etaText(row, now)
  const detail = detailOf(row)
  const where = density === 'tiny' ? ago(work.updatedAt, now) : `${ago(work.updatedAt, now)} · @${work.sessionName}`
  // 노드 줄은 개수, 예상 시간, 오래 걸림 알림, 시각과 세션 이름을 뺀 자리에 맞춘다.
  const room =
    columns - INDENT - widthOf(` ${done}/${total}${eta ? ` · ${eta}` : ''}${slow ? ` · ${slow}` : ''} · ${where}`)

  return (
    <Box flexDirection="column" key={`row-${work.id}`}>
      <Button key={`toggle-${work.id}`} plain onPress={() => actions.onToggle(work.id)}>
        <Text wrap="truncate-end">
          <Text color={SOFT}>{isOpen ? MARK.open : MARK.closed}</Text> <Text bold>{title}</Text>
        </Text>
      </Button>
      <Box marginLeft={INDENT}>
        <Text wrap="truncate-end">
          {drawChain(els, work, phase, room, density)}
          <Text bold>{` ${done}/${total}`}</Text>
          {eta ? <Text>{` · ${eta}`}</Text> : ''}
          {slow ? <Text color="warning">{` · ${slow}`}</Text> : ''}
          <Text color={SOFT}>{` · ${where}`}</Text>
        </Text>
      </Box>
      {detail ? (
        <Box marginLeft={INDENT}>
          {detail.isAsk ? (
            <Text color="warning" wrap="truncate-end">{`${detail.label}${detail.text}`}</Text>
          ) : (
            drawLabeled(els, detail.label, detail.text)
          )}
        </Box>
      ) : (
        ''
      )}
      {row.activity && density !== 'tiny' ? (
        <Box marginLeft={INDENT}>
          {drawLabeled(els, '최근: ', row.activity.text, ` · ${ago(row.activity.at, now)}`)}
        </Box>
      ) : (
        ''
      )}
      {drawChildren(els, row, isOpen, density)}
      {isOpen ? (
        <Box marginLeft={INDENT} flexDirection="column">
          {drawSteps(els, work, phase)}
        </Box>
      ) : (
        ''
      )}
      {isOpen ? drawFollowups(els, work) : ''}
      {isOpen ? (
        <Box marginLeft={INDENT}>
          <Button key={`archive-${work.id}`} label="보관" onPress={() => actions.onArchive(work.id)} />
        </Box>
      ) : (
        ''
      )}
    </Box>
  )
}

// 할 일이 남은 칸을 위에, 접어 두는 칸을 아래에 둔다. 칸마다 이름과 개수를 적은 선을 긋는다.
export function drawPane(els: Els, board: Board | null, expanded: string | null, columns: number, actions: RowActions) {
  const { Box, Text } = els
  const density = densityOf(columns)
  if (!board || (board.rows.length === 0 && board.untracked.length === 0)) {
    return <Text color={SOFT}>기록된 업무가 없어요.</Text>
  }

  const draw = (row: WorkRow) => drawRow(els, row, expanded === row.work.id, board.at, columns, actions)
  const groups = PHASE_ORDER.map(phase => ({ phase, rows: board.rows.filter(row => row.phase === phase) })).filter(
    group => group.rows.length > 0,
  )
  const open = groups.filter(group => !FOLDED.includes(group.phase))
  const folded = groups.filter(group => FOLDED.includes(group.phase))
  const untracked = board.untracked.map(s => `@${s.name}${s.isBusy ? ' 작업 중' : ''}`).join(', ')
  return (
    <Box flexDirection="column" rowGap={1}>
      {drawSummary(els, board, density, false)}
      {open.length === 0 ? <Text color={SOFT}>진행 중인 업무가 없어요.</Text> : ''}
      {open.map(({ phase, rows }) => (
        <Box flexDirection="column" key={`group-${phase}`}>
          {drawHeader(els, phase, rows.length, columns)}
          <Box flexDirection="column" rowGap={1}>
            {rows.map(draw)}
          </Box>
        </Box>
      ))}
      {untracked && density !== 'tiny' ? <Text color={SOFT} wrap="truncate-end">{`기록 없는 세션: ${untracked}`}</Text> : ''}
      {folded.map(({ phase, rows }) => (
        <Box flexDirection="column" key={`group-${phase}`}>
          {drawHeader(els, phase, rows.length, columns)}
          {rows.map(draw)}
        </Box>
      ))}
      {density === 'wide' ? <Text color={SOFT}>업무 줄을 누르면 단계 목록이 펼쳐져요.</Text> : ''}
    </Box>
  )
}
