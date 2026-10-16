import type { Elements, RenderSurface } from 'claude-code'

import type { Board, ChildRow, Phase, WorkRow } from '../types'
import { PHASE_LABEL, ago, bar, countPhases, progressOf } from './model'

type Els = Elements[RenderSurface]

// wide 는 모든 글자, narrow 는 부가 정보를 빼고, tiny 는 아이콘과 숫자만 남긴다.
export type Density = 'wide' | 'narrow' | 'tiny'

const PHASE_ICON: Record<Phase, string> = { yourTurn: '◆', running: '●', stalled: '○', paused: '‖', done: '✓' }
const PHASE_COLOR: Record<Phase, string> = {
  yourTurn: 'warning',
  running: 'suggestion',
  stalled: 'subtle',
  paused: 'subtle',
  done: 'success',
}
const BAR_WIDTH: Record<Density, number> = { wide: 10, narrow: 6, tiny: 4 }
const INDENT: Record<Density, number> = { wide: 4, narrow: 2, tiny: 2 }
const MAX_CHILDREN = 4

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

// 완료 업무 위에 긋는 선. 폭에 맞춰 늘이고 가운데 이름을 넣는다.
export function divider(label: string, columns: number): string {
  const head = `── ${label} `
  return `${head}${'─'.repeat(Math.max(2, columns - widthOf(head)))}`
}

function phaseCount(phase: Phase, count: number, density: Density): string {
  return density === 'tiny' ? `${PHASE_ICON[phase]}${count}` : `${PHASE_ICON[phase]} ${PHASE_LABEL[phase]} ${count}`
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
        <Text>
          <Text dimColor>{' · '}</Text>
          <Text color={PHASE_COLOR[phase]}>{phaseCount(phase, count, density)}</Text>
        </Text>
      ))}
      {untracked ? <Text dimColor>{` · ${untracked}`}</Text> : ''}
      {hasHint && density !== 'tiny' ? <Text dimColor>{'  /progress'}</Text> : ''}
    </Text>
  )
}

type RowActions = { onToggle: (id: string) => void; onArchive: (id: string) => void }

// 부모 업무 아래 서브에이전트 줄. 끝난 서브에이전트는 한 줄로 묶었다가 업무를 펼치면 하나씩 보인다.
function drawChildren(els: Els, row: WorkRow, isOpen: boolean, density: Density, indent: number) {
  const { Box, Text } = els
  const { children, finished } = row
  if (children.length === 0 && finished.length === 0) return ''
  if (density === 'tiny') {
    const running = children.length > 0 ? [`서브 ${children.length}`] : []
    const ended = finished.length > 0 ? [`${PHASE_ICON.done}${finished.length}`] : []
    return (
      <Box marginLeft={indent}>
        <Text dimColor>{`└ ${[...running, ...ended].join(' ')}`}</Text>
      </Box>
    )
  }
  const hidden = children.length - MAX_CHILDREN
  return (
    <Box marginLeft={indent} flexDirection="column">
      {children.slice(0, MAX_CHILDREN).map(child => (
        <Text dimColor wrap="truncate-end" key={`child-${child.id}`}>
          {'└ '}
          <Text color={PHASE_COLOR.running}>{PHASE_ICON.running}</Text>
          {` ${child.title}`}
          {child.total ? <Text bold>{` ${child.done}/${child.total}`}</Text> : ''}
          {child.activity ? ` · 최근: ${child.activity.text}` : ''}
        </Text>
      ))}
      {hidden > 0 ? <Text dimColor>{`  서브에이전트 ${hidden}개 더`}</Text> : ''}
      {isOpen ? (
        finished.map(child => (
          <Text dimColor wrap="truncate-end" key={`finished-${child.id}`}>
            {'└ '}
            <Text color={PHASE_COLOR.done}>{PHASE_ICON.done}</Text>
            {` ${child.title}`}
            {child.total ? ` ${child.done}/${child.total}` : ''}
          </Text>
        ))
      ) : finished.length > 0 ? (
        <Text dimColor>
          {'└ '}
          <Text color={PHASE_COLOR.done}>{PHASE_ICON.done}</Text>
          {` 서브에이전트 ${finished.length}개 끝남`}
        </Text>
      ) : (
        ''
      )}
    </Box>
  )
}

// 완료 업무는 접어 두고 제목 한 줄만 보인다. 누르면 그 업무만 단계와 보관 버튼까지 펼쳐진다.
function drawFolded(els: Els, row: WorkRow, now: number, columns: number, actions: RowActions) {
  const { Box, Button, Text } = els
  const { work } = row
  const subs = row.finished.length > 0 ? ` · 서브 ${row.finished.length}` : ''
  const when = densityOf(columns) === 'tiny' ? '' : `${subs} · ${ago(work.doneAt ?? work.updatedAt, now)}`
  const title = fit(work.title, Math.max(4, columns - widthOf(PHASE_ICON.done) - 2 - widthOf(when)))
  return (
    <Box key={`row-${work.id}`}>
      <Button key={`toggle-${work.id}`} plain onPress={() => actions.onToggle(work.id)}>
        <Text wrap="truncate-end">
          <Text color={PHASE_COLOR.done}>{PHASE_ICON.done}</Text> <Text dimColor>{title}</Text>
          <Text dimColor>{when}</Text>
        </Text>
      </Button>
    </Box>
  )
}

function drawRow(els: Els, row: WorkRow, isOpen: boolean, now: number, columns: number, actions: RowActions) {
  const { Box, Button, Text } = els
  const { work, phase } = row
  if (phase === 'done' && !isOpen) return drawFolded(els, row, now, columns, actions)
  const density = densityOf(columns)
  const indent = INDENT[density]
  const { done, total, percent } = progressOf(work)
  const meter = bar(percent, BAR_WIDTH[density])
  // 완료 업무는 구분선이 이미 "오늘 완료"라고 알려 주므로 아이콘만 둔다.
  const head = density === 'wide' && phase !== 'done' ? `${PHASE_ICON[phase]} ${PHASE_LABEL[phase]}` : PHASE_ICON[phase]
  const title = fit(work.title, Math.max(4, columns - widthOf(head) - 2))
  const detail = phase === 'yourTurn' && work.question ? `질문: ${work.question}` : work.now ? `지금: ${work.now}` : ''
  const where = density === 'tiny' ? ago(work.updatedAt, now) : `${ago(work.updatedAt, now)} · @${work.sessionName}`

  return (
    <Box flexDirection="column" key={`row-${work.id}`}>
      <Button key={`toggle-${work.id}`} plain onPress={() => actions.onToggle(work.id)}>
        <Text color={PHASE_COLOR[phase]}>{head}</Text> <Text bold>{title}</Text>
      </Button>
      <Box marginLeft={indent}>
        <Text wrap="truncate-end">
          <Text color={PHASE_COLOR[phase]}>{meter.filled}</Text>
          <Text dimColor>{meter.rest}</Text>
          <Text bold>{` ${done}/${total}`}</Text>
          <Text dimColor>{` · ${where}`}</Text>
        </Text>
      </Box>
      {detail ? (
        <Box marginLeft={indent}>
          <Text color={phase === 'yourTurn' ? 'warning' : undefined} dimColor={phase !== 'yourTurn'} wrap="truncate-end">
            {detail}
          </Text>
        </Box>
      ) : (
        ''
      )}
      {row.activity && density !== 'tiny' ? (
        <Box marginLeft={indent}>
          <Text dimColor wrap="truncate-end">{`최근: ${row.activity.text} · ${ago(row.activity.at, now)}`}</Text>
        </Box>
      ) : (
        ''
      )}
      {drawChildren(els, row, isOpen, density, indent)}
      {isOpen ? (
        <Box marginLeft={indent} flexDirection="column">
          {work.steps.map(step => (
            <Text dimColor={step.isDone} wrap="truncate-end">
              {step.isDone ? '✓ ' : '· '}
              {step.title}
              {step.evidence ? <Text dimColor>{` — ${step.evidence}`}</Text> : ''}
            </Text>
          ))}
          <Button key={`archive-${work.id}`} label="보관" onPress={() => actions.onArchive(work.id)} />
        </Box>
      ) : (
        ''
      )}
    </Box>
  )
}

export function drawPane(
  els: Els,
  board: Board | null,
  expanded: string | null,
  columns: number,
  actions: RowActions,
) {
  const { Box, Text } = els
  const density = densityOf(columns)
  if (!board || (board.rows.length === 0 && board.untracked.length === 0)) {
    return <Text dimColor>기록된 업무가 없어요.</Text>
  }

  const untracked = board.untracked.map(s => `@${s.name}${s.isBusy ? ' 작업 중' : ''}`).join(', ')
  const open = board.rows.filter(row => row.phase !== 'done')
  const done = board.rows.filter(row => row.phase === 'done')
  const draw = (row: WorkRow) => drawRow(els, row, expanded === row.work.id, board.at, columns, actions)
  const doneLabel = density === 'tiny' ? `${PHASE_ICON.done}${done.length}` : `${PHASE_LABEL.done} ${done.length}`
  return (
    <Box flexDirection="column" rowGap={1}>
      {drawSummary(els, board, density, false)}
      {open.length === 0 ? <Text dimColor>진행 중인 업무가 없어요.</Text> : ''}
      {open.map(draw)}
      {untracked && density !== 'tiny' ? <Text dimColor wrap="truncate-end">{`기록 없는 세션: ${untracked}`}</Text> : ''}
      {density === 'wide' ? <Text dimColor>업무 줄을 누르면 단계 목록이 펼쳐져요.</Text> : ''}
      {done.length > 0 ? (
        <Box flexDirection="column">
          <Text dimColor wrap="truncate-end">{divider(doneLabel, columns)}</Text>
          {done.map(draw)}
        </Box>
      ) : (
        ''
      )}
    </Box>
  )
}
