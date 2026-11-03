import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { appleScript, buildNotice, firstLine, formatDuration, playCommand, projectName, speakCommand, spokenName, waitingNotice } from './notice'
import { isWaitingForPermission, nameFromRecord } from './session-name'

const ANSWER = '## 결과\n**E2E 가 통과했습니다.** 7분 43초 걸렸습니다.\n- 다음 단계는 커밋입니다.'
const SESSION_ID = 'session-1'
const SOUNDS = '/Users/me/.claude/long-turn-notify/sounds'

function finish(durationMs: number, reason: 'answer' | 'aborted' | 'error' = 'answer', agentId?: string) {
  return { answer: ANSWER, durationMs, isAborted: reason === 'aborted', turnId: 't1', reason, agentId }
}

const RUNNING_AGENT: AgentInfo = { id: 'a1', description: 'design-data-api-inventory', type: 'general-purpose', status: 'running' }
const FINISHED_AGENT: AgentInfo = { ...RUNNING_AGENT, status: 'completed' }

type World = { agents?: AgentInfo[]; sessionRecord?: Record<string, unknown>; hasSounds?: boolean }

function world(on: On, { agents = [], sessionRecord, hasSounds = true }: World = {}) {
  const runs: (readonly string[])[] = []
  const state = { agents, sessionRecord }
  const clock = mock.clock(on, { now: 0 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: state.agents }))
  on('tool.call', () => ({ deny: '테스트에서는 창을 띄우지 않는다' }))
  on('session.cwd', () => ({ value: '/Users/me/projects/my-project' }))
  on('session.id', () => ({ value: SESSION_ID }))
  on('env.get', () => ({ value: '/Users/me' }))
  on('fs.list', () => ({ value: state.sessionRecord ? [{ name: '123.json', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] : [] }))
  on('fs.read', () => ({ value: JSON.stringify(state.sessionRecord ?? {}) }))
  on('process.run', (_, e) => {
    runs.push(e.argv)
    const stdout = e.argv[0] === 'mktemp' ? '/tmp/long-turn-notify.abc\n' : ''
    const exitCode = e.argv[0] === 'test' && !hasSounds ? 1 : 0
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { runs, clock, state }
}

describe('notice', () => {
  test('걸린 시간을 한글로 쓴다', () => {
    expect(formatDuration(463_000)).toBe('7분 43초')
    expect(formatDuration(180_000)).toBe('3분')
    expect(formatDuration(3_780_000)).toBe('1시간 3분')
  })

  test('답변 첫 줄에서 마크다운 기호를 뺀다', () => {
    expect(firstLine(ANSWER)).toBe('결과')
    expect(firstLine('**E2E 가 통과했습니다.**')).toBe('E2E 가 통과했습니다.')
    expect(firstLine('가'.repeat(200))).toHaveLength(80)
    expect(firstLine('\n\n')).toBe('')
  })

  test('끝난 방식에 따라 문구를 고르고 따옴표를 이스케이프한다', () => {
    expect(buildNotice('my-project', 'answer', 463_000, '')).toEqual({
      title: 'Claude Code · my-project',
      subtitle: '7분 43초 걸린 작업이 끝났습니다',
      body: '7분 43초 걸린 작업이 끝났습니다',
    })
    expect(buildNotice('my-project', 'error', 180_000, '').subtitle).toBe('3분 만에 오류로 멈췄습니다')
    expect(appleScript({ title: 't', subtitle: 's', body: 'say "hi" \\ ok' })).toBe(
      'display notification "say \\"hi\\" \\\\ ok" with title "t" subtitle "s"',
    )
    expect(projectName('/Users/me/projects/my-project/')).toBe('my-project')
  })

  test('선택 창과 권한 확인 창은 무엇을 기다리는지 쓴다', () => {
    expect(waitingNotice('my-project', 'question', '**어느 쪽으로 할까요?**')).toEqual({
      title: 'Claude Code · my-project',
      subtitle: '선택을 기다리고 있습니다',
      body: '어느 쪽으로 할까요?',
    })
    expect(waitingNotice('my-project', 'permission', '').body).toBe('권한 확인을 기다리고 있습니다')
  })

  test('녹음한 사령관 음성을 3배 크기로 재생한다', () => {
    expect(playCommand(`${SOUNDS}/commander.aiff`)).toEqual(['afplay', '-v', '3', `${SOUNDS}/commander.aiff`])
  })

  test('세션 이름은 하이픈을 띄어 읽고, -로 시작하는 이름도 옵션으로 읽지 않는다', () => {
    expect(spokenName('sleepy-otter')).toBe('sleepy otter 세션')
    expect(speakCommand('/tmp/x/name.aiff', '-rf 세션')).toEqual(['say', '-v', 'Yuna', '-o', '/tmp/x/name.aiff', '--', '-rf 세션'])
  })

  test('세션 기록에서 이 세션의 이름만 꺼내고, 폴더 이름에서 만든 이름은 읽지 않는다', () => {
    expect(nameFromRecord({ sessionId: SESSION_ID, name: 'sleepy-otter', nameSource: 'hook' }, SESSION_ID)).toBe('sleepy-otter')
    expect(nameFromRecord({ sessionId: 'other', name: 'sleepy-otter', nameSource: 'hook' }, SESSION_ID)).toBeUndefined()
    expect(nameFromRecord({ sessionId: SESSION_ID, name: 'my-project-74', nameSource: 'derived' }, SESSION_ID)).toBeUndefined()
    expect(nameFromRecord(null, SESSION_ID)).toBeUndefined()
  })

  test('세션 기록에서 이 세션이 권한 확인을 기다리는지 읽는다', () => {
    expect(isWaitingForPermission({ sessionId: SESSION_ID, status: 'waiting', waitingFor: 'permission prompt' }, SESSION_ID)).toBe(true)
    expect(isWaitingForPermission({ sessionId: SESSION_ID, status: 'waiting', waitingFor: 'dialog open' }, SESSION_ID)).toBe(false)
    expect(isWaitingForPermission({ sessionId: 'other', status: 'waiting', waitingFor: 'permission prompt' }, SESSION_ID)).toBe(false)
  })
})

test('2분 넘게 걸린 작업이 끝나면 맥 알림을 띄우고 음성을 재생한다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.turn.start({ text: '진행해', turnId: 't1' })
  await clock.advance(463_000)
  const done = await $.turn.complete(finish(463_000))
  expect(done.text).toBe(ANSWER)

  await clock.advance(1)
  await clock.settle()
  expect(runs.map(argv => argv[0]).sort()).toEqual(['afplay', 'osascript', 'test'])
  const script = runs.find(argv => argv[0] === 'osascript')?.[2]
  expect(script).toContain('Claude Code · my-project')
  expect(script).toContain('7분 43초 걸린 작업이 끝났습니다')
  expect(runs.find(argv => argv[0] === 'afplay')?.at(-1)).toMatch(/sounds\/commander\.aiff$/)
})

test('짧은 작업, 직접 멈춘 작업, subagent 작업은 알리지 않는다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.turn.start({ text: '짧은 작업', turnId: 't1' })
  await clock.advance(90_000)
  await $.turn.complete(finish(90_000))

  await $.turn.start({ text: '멈출 작업', turnId: 't2' })
  await clock.advance(463_000)
  await $.turn.complete(finish(463_000, 'aborted'))

  await $.turn.start({ text: 'subagent 작업', turnId: 't3', agentId: 'agent-1' })
  await clock.advance(463_000)
  await $.turn.complete(finish(463_000, 'answer', 'agent-1'))
  await clock.advance(1)
  await clock.settle()

  expect(runs).toEqual([])
})

test('백그라운드 에이전트가 남은 채 답하면 알리지 않고, 다시 깨어나 끝나면 처음 턴부터 잰 시간으로 알린다', async ($, on) => {
  const { runs, clock, state } = world(on, { agents: [RUNNING_AGENT] })

  await $.turn.start({ text: '두 가지를 조사해', turnId: 't1' })
  await clock.advance(100_000)
  await $.turn.complete(finish(100_000))
  await clock.advance(1)
  await clock.settle()
  expect(runs).toEqual([])

  state.agents = [FINISHED_AGENT]
  await clock.advance(79_999)
  await $.turn.start({ text: '', turnId: 't2' })
  await $.turn.complete(finish(1))
  await clock.advance(1)
  await clock.settle()

  expect(runs.map(argv => argv[0]).sort()).toEqual(['afplay', 'osascript', 'test'])
  expect(runs.find(argv => argv[0] === 'osascript')?.[2]).toContain('3분 걸린 작업이 끝났습니다')
  expect(runs.find(argv => argv[0] === 'afplay')?.at(-1)).toMatch(/sounds\/commander\.aiff$/)
})

test('오류로 멈춘 작업은 에이전트가 남아 있어도 알린다', async ($, on) => {
  const { runs, clock } = world(on, { agents: [RUNNING_AGENT] })

  await $.turn.start({ text: '진행해', turnId: 't1' })
  await clock.advance(180_000)
  await $.turn.complete(finish(180_000, 'error'))
  await clock.advance(1)
  await clock.settle()

  expect(runs.find(argv => argv[0] === 'osascript')?.[2]).toContain('3분 만에 오류로 멈췄습니다')
})

test('짧은 작업이어도 선택 창이 뜨면 바로 알리고 선택 음성을 재생한다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.tool.call({
    tool: 'AskUserQuestion',
    questions: [{ question: '어느 쪽으로 할까요?', header: '방식', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }], multiSelect: false }],
  })
  await clock.advance(1)
  await clock.settle()

  expect(runs.map(argv => argv[0]).sort()).toEqual(['afplay', 'osascript', 'test'])
  const script = runs.find(argv => argv[0] === 'osascript')?.[2]
  expect(script).toContain('선택을 기다리고 있습니다')
  expect(script).toContain('어느 쪽으로 할까요?')
  expect(runs.find(argv => argv[0] === 'afplay')?.at(-1)).toMatch(/sounds\/choice\.aiff$/)
})

const START = { cwd: '/Users/me/projects/my-project', surface: 'terminal', isInteractive: true } as const
const WAITING = { sessionId: SESSION_ID, name: 'my-project-7b', nameSource: 'derived', status: 'waiting', waitingFor: 'permission prompt' }
const BUSY = { ...WAITING, status: 'busy', waitingFor: undefined }

test('권한 확인 창이 뜨면 세션 기록을 보고 창 하나에 한 번만 알린다', async ($, on) => {
  const { runs, clock, state } = world(on, { sessionRecord: BUSY })
  await $.session.start(START)
  await clock.advance(1_500)
  await clock.settle()
  expect(runs).toEqual([])

  state.sessionRecord = WAITING
  await clock.advance(1_500)
  await clock.settle()
  await clock.advance(1_500)
  await clock.settle()
  expect(runs.filter(argv => argv[0] === 'afplay').map(argv => argv.at(-1))).toEqual([expect.stringMatching(/sounds\/choice\.aiff$/)])
  expect(runs.find(argv => argv[0] === 'osascript')?.[2]).toContain('권한 확인을 기다리고 있습니다')

  // 창이 닫혔다가 다음 창이 뜨면 다시 알린다.
  state.sessionRecord = BUSY
  await clock.advance(1_500)
  await clock.settle()
  state.sessionRecord = WAITING
  await clock.advance(1_500)
  await clock.settle()
  expect(runs.filter(argv => argv[0] === 'afplay')).toHaveLength(2)
})

test('-p 실행에서는 권한 확인 창을 지켜보지 않는다', async ($, on) => {
  const { runs, clock } = world(on, { sessionRecord: WAITING })
  await $.session.start({ ...START, surface: null, isInteractive: false })
  await clock.advance(3_000)
  await clock.settle()
  expect(runs).toEqual([])
})

test('세션 기록에 사람이 붙인 이름이 있으면 녹음 음성 앞에 세션 이름을 먼저 읽는다', async ($, on) => {
  const { runs, clock } = world(on, { sessionRecord: { sessionId: SESSION_ID, name: 'sleepy-otter', nameSource: 'hook' } })

  await $.turn.start({ text: '진행해', turnId: 't1' })
  await clock.advance(463_000)
  await $.turn.complete(finish(463_000))
  await clock.advance(1)
  await clock.settle()

  const sounds = runs.filter(argv => argv[0] !== 'osascript')
  expect(sounds).toEqual([
    ['mktemp', '-d', '-t', 'long-turn-notify'],
    ['say', '-v', 'Yuna', '-o', '/tmp/long-turn-notify.abc/name.aiff', '--', 'sleepy otter 세션'],
    ['afplay', '-v', '3', '/tmp/long-turn-notify.abc/name.aiff'],
    ['rm', '-rf', '/tmp/long-turn-notify.abc'],
    ['test', '-s', `${SOUNDS}/commander.aiff`],
    ['afplay', '-v', '3', `${SOUNDS}/commander.aiff`],
  ])
})

test('녹음 파일이 없으면 처음 한 번 say 로 만든 뒤 재생한다', async ($, on) => {
  const { runs, clock } = world(on, { hasSounds: false })

  await $.turn.start({ text: '진행해', turnId: 't1' })
  await clock.advance(463_000)
  await $.turn.complete(finish(463_000))
  await clock.advance(1)
  await clock.settle()

  expect(runs.filter(argv => argv[0] !== 'osascript')).toEqual([
    ['test', '-s', `${SOUNDS}/commander.aiff`],
    ['mkdir', '-p', SOUNDS],
    ['say', '-v', 'Yuna', '-o', `${SOUNDS}/commander.aiff`, '--', '명령을 내려주십시오 사령관님'],
    ['afplay', '-v', '3', `${SOUNDS}/commander.aiff`],
  ])
})
