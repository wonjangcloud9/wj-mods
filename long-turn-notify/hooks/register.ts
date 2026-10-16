import type { EngineInterface, Register } from 'claude-code'

import { DONE_SOUND, MIN_DURATION_MS, SPOKEN_NAME_FILE, WAITING_SOUND, appleScript, buildNotice, playCommand, projectName, soundDir, speakCommand, spokenName, waitingNotice, type Ending, type Notice, type Sound, type Waiting } from './notice'

const NOTIFY_TIMEOUT_MS = 5_000

const LONG_LIVED_TASK_TYPES = new Set(['shell', 'monitor'])

function willWakeSession(task: { type: string }): boolean {
  return !LONG_LIVED_TASK_TYPES.has(task.type)
}

async function runQuietly($: EngineInterface, argv: readonly string[]): Promise<string | undefined> {
  const run = await $.process.run(argv, { timeoutMs: NOTIFY_TIMEOUT_MS }).catch(() => undefined)
  if (run?.exitCode !== 0) {
    $.ui.log(`long-turn-notify: ${argv[0]} 실패 ${run?.stderr ?? ''}`.trim(), { to: 'debug' })
    return undefined
  }
  return run.stdout
}

// 이름을 못 읽어도 녹음 음성은 그대로 재생한다.
async function speakSessionName($: EngineInterface, sessionTitle: string): Promise<void> {
  const dir = (await runQuietly($, ['mktemp', '-d', '-t', 'long-turn-notify']))?.trim()
  if (!dir) return
  const file = `${dir}/${SPOKEN_NAME_FILE}`
  if ((await runQuietly($, speakCommand(file, spokenName(sessionTitle)))) !== undefined) {
    await runQuietly($, playCommand(file))
  }
  await runQuietly($, ['rm', '-rf', dir])
}

// 처음 한 번만 녹음한다. 녹음하지 못하면 소리 없이 알림만 띄운다.
async function soundFile($: EngineInterface, sound: Sound): Promise<string | undefined> {
  const dir = soundDir((await $.env.get('HOME')) ?? '')
  const file = `${dir}/${sound.file}`
  if ((await runQuietly($, ['test', '-s', file])) !== undefined) return file
  if ((await runQuietly($, ['mkdir', '-p', dir])) === undefined) return undefined
  return (await runQuietly($, speakCommand(file, sound.text))) !== undefined ? file : undefined
}

async function playSound($: EngineInterface, sound: Sound, sessionTitle: string | undefined): Promise<void> {
  if (sessionTitle) await speakSessionName($, sessionTitle)
  const file = await soundFile($, sound)
  if (file) await runQuietly($, playCommand(file))
}

async function notify($: EngineInterface, notice: Notice, sound: Sound, sessionTitle: string | undefined): Promise<void> {
  await Promise.all([
    runQuietly($, ['osascript', '-e', appleScript(notice)]),
    playSound($, sound, sessionTitle),
  ])
}

async function notifyWaiting($: EngineInterface, waiting: Waiting, detail: string, sessionTitle: string | undefined): Promise<void> {
  const notice = waitingNotice(projectName(await $.session.cwd()), waiting, detail)
  // 창이 뜨는 것을 늦추지 않도록 알림은 따로 띄운다.
  $.clock.after(0, () => void notify($, notice, WAITING_SOUND, sessionTitle))
}

async function notifyDone($: EngineInterface, startedAt: number | undefined, ending: Ending, answer: string, sessionTitle: string | undefined): Promise<void> {
  if (startedAt === undefined) return
  const durationMs = (await $.clock.now()) - startedAt
  if (durationMs < MIN_DURATION_MS) return

  const notice = buildNotice(projectName(await $.session.cwd()), ending, durationMs, answer)
  // 턴 마무리를 늦추지 않도록 알림은 턴이 끝난 뒤 띄운다.
  $.clock.after(0, () => void notify($, notice, DONE_SOUND, sessionTitle))
}

export const register: Register = on => {
  // 선택 창이 권한 확인 알림을 함께 일으켜도 음성은 한 번만 나오게 한다.
  let isAsking = false
  // 알림은 항상 프롬프트 뒤에 오므로, 프롬프트 때 받은 세션 이름이면 충분하다. /rename 도 다음 프롬프트에 반영된다.
  let sessionTitle: string | undefined
  // 걸린 시간은 사용자가 프롬프트를 보낸 때부터 잰다. 백그라운드 작업이 끝나 다시 깨어난 턴까지 한 작업으로 본다.
  let startedAt: number | undefined

  // 한 작업의 끝은 한 번만 알리도록 시작 시각을 꺼내면서 지운다.
  const takeStartedAt = (): number | undefined => {
    const began = startedAt
    startedAt = undefined
    return began
  }

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    sessionTitle = result.sessionTitle ?? e.session_title ?? sessionTitle
    startedAt ??= await $.clock.now()
    return result
  })

  // 응답이 멈춰도 백그라운드 에이전트가 남아 있으면 그것이 끝날 때 세션이 다시 깨어나므로 아직 명령을 기다리는 때가 아니다.
  // 셸과 monitor 는 caffeinate·개발 서버처럼 끝나지 않는 것이 많아 기다리는 이유로 보지 않는다.
  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    if (e.agent_id === undefined && !e.background_tasks?.some(willWakeSession)) await notifyDone($, takeStartedAt(), 'answer', e.last_assistant_message ?? '', sessionTitle)
    return result
  })

  // Stop 이 오지 않는 오류는 턴 끝에서 알린다. 직접 멈춘 턴은 사용자가 화면 앞에 있으니 알리지 않는다.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason === 'answer') return result
    if (e.reason === 'aborted') startedAt = undefined
    else await notifyDone($, takeStartedAt(), e.reason, e.answer, sessionTitle)
    return result
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await notifyWaiting($, 'question', e.questions[0]?.question ?? '', sessionTitle)
    isAsking = true
    try {
      return await next(e)
    } finally {
      isAsking = false
    }
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' && !isAsking) await notifyWaiting($, 'permission', e.message, sessionTitle)
    return next(e)
  })
}
