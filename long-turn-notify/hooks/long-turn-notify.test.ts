import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { appleScript, buildNotice, firstLine, formatDuration, playCommand, projectName, speakCommand, spokenName, waitingNotice } from './notice'

const ANSWER = '## 결과\n**E2E 가 통과했습니다.** 7분 43초 걸렸습니다.\n- 다음 단계는 커밋입니다.'

function finish(durationMs: number, reason: 'answer' | 'aborted' | 'error' = 'answer', agentId?: string) {
  return { answer: ANSWER, durationMs, isAborted: reason === 'aborted', turnId: 't1', reason, agentId }
}

const SUBAGENT_TASK = { id: 'a1', type: 'subagent', status: 'running', description: 'design-data-api-inventory' }
const CAFFEINATE_TASK = { id: 'b1', type: 'shell', status: 'running', description: '전수조사 동안 Mac 잠자기 방지', command: 'exec caffeinate -dims' }

const SOUNDS = '/Users/me/.claude/long-turn-notify/sounds'

function world(on: On, hasSounds = true) {
  const runs: (readonly string[])[] = []
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { HOME: '/Users/me' })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ deny: '테스트에서는 창을 띄우지 않는다' }))
  on('classic.Notification', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('classic.Stop', () => ({}))
  on('session.cwd', () => ({ value: '/Users/me/projects/my-project' }))
  on('process.run', (_, e) => {
    runs.push(e.argv)
    const stdout = e.argv[0] === 'mktemp' ? '/tmp/long-turn-notify.abc\n' : ''
    const exitCode = e.argv[0] === 'test' && !hasSounds ? 1 : 0
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { runs, clock }
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
})

test('2분 넘게 걸린 작업이 끝나면 맥 알림을 띄우고 음성을 재생한다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.classic.UserPromptSubmit({ prompt: '진행해' })
  await clock.advance(463_000)
  const done = await $.turn.complete(finish(463_000))
  expect(done.text).toBe(ANSWER)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ANSWER, background_tasks: [] })

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

  await $.classic.UserPromptSubmit({ prompt: '짧은 작업' })
  await clock.advance(90_000)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ANSWER, background_tasks: [] })

  await $.classic.UserPromptSubmit({ prompt: '멈출 작업' })
  await clock.advance(463_000)
  await $.turn.complete(finish(463_000, 'aborted'))

  await $.classic.UserPromptSubmit({ prompt: 'subagent 작업' })
  await clock.advance(463_000)
  await $.turn.complete(finish(463_000, 'error', 'agent-1'))
  await $.classic.Stop({ stop_hook_active: false, agent_id: 'agent-1', last_assistant_message: ANSWER, background_tasks: [] })
  await clock.advance(1)
  await clock.settle()

  expect(runs).toEqual([])
})

test('백그라운드 작업이 남은 채 응답이 멈추면 알리지 않고, 다시 깨어나 끝나면 처음 프롬프트부터 잰 시간으로 알린다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.classic.UserPromptSubmit({ prompt: '두 가지를 조사해' })
  await clock.advance(100_000)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: '두 조사가 끝나면 이어서 씁니다.', background_tasks: [SUBAGENT_TASK] })
  await clock.advance(1)
  await clock.settle()
  expect(runs).toEqual([])

  await clock.advance(80_000)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ANSWER, background_tasks: [] })
  await clock.advance(1)
  await clock.settle()

  expect(runs.map(argv => argv[0]).sort()).toEqual(['afplay', 'osascript', 'test'])
  expect(runs.find(argv => argv[0] === 'osascript')?.[2]).toContain('3분 걸린 작업이 끝났습니다')
  expect(runs.find(argv => argv[0] === 'afplay')?.at(-1)).toMatch(/sounds\/commander\.aiff$/)
})

test('끝나지 않는 백그라운드 셸만 남은 채 멈추면 바로 알린다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.classic.UserPromptSubmit({ prompt: '전수조사 해줘' })
  await clock.advance(463_000)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ANSWER, background_tasks: [CAFFEINATE_TASK] })
  await clock.advance(1)
  await clock.settle()

  expect(runs.map(argv => argv[0]).sort()).toEqual(['afplay', 'osascript', 'test'])
  expect(runs.find(argv => argv[0] === 'osascript')?.[2]).toContain('7분 43초 걸린 작업이 끝났습니다')
})

test('오류로 멈춘 작업은 Stop 없이도 알린다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.classic.UserPromptSubmit({ prompt: '진행해' })
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

test('권한 확인 창이면 알리고, 입력을 오래 기다린다는 알림에는 다시 울리지 않는다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await $.classic.Notification({ message: 'Claude is waiting for your input', notification_type: 'idle_prompt' })
  await clock.advance(1)
  await clock.settle()

  expect(runs.filter(argv => argv[0] === 'afplay').map(argv => argv.at(-1))).toEqual([expect.stringMatching(/sounds\/choice\.aiff$/)])
  expect(runs.find(argv => argv[0] === 'osascript')?.[2]).toContain('권한 확인을 기다리고 있습니다')
})

test('세션 이름을 알면 녹음 음성 앞에 세션 이름을 먼저 읽는다', async ($, on) => {
  const { runs, clock } = world(on)

  await $.classic.UserPromptSubmit({ prompt: '진행해', session_title: 'sleepy-otter' })
  await clock.advance(463_000)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ANSWER, background_tasks: [] })
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
  const { runs, clock } = world(on, false)

  await $.classic.UserPromptSubmit({ prompt: '진행해' })
  await clock.advance(463_000)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ANSWER, background_tasks: [] })
  await clock.advance(1)
  await clock.settle()

  expect(runs.filter(argv => argv[0] !== 'osascript')).toEqual([
    ['test', '-s', `${SOUNDS}/commander.aiff`],
    ['mkdir', '-p', SOUNDS],
    ['say', '-v', 'Yuna', '-o', `${SOUNDS}/commander.aiff`, '--', '명령을 내려주십시오 사령관님'],
    ['afplay', '-v', '3', `${SOUNDS}/commander.aiff`],
  ])
})
