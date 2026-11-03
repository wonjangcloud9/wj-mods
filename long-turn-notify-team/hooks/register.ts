import type { EngineInterface, Register } from 'claude-code'

import { DONE_SOUND, MIN_DURATION_MS, SPOKEN_NAME_FILE, WAITING_SOUND, appleScript, buildNotice, playCommand, projectName, soundDir, speakCommand, spokenName, waitingNotice, type Ending, type Notice, type Sound, type Waiting } from './notice'
import { isWaitingForPermission, readSessionName, readSessionRecord, type RecordCache } from './session-name'

const NOTIFY_TIMEOUT_MS = 5_000
// 권한 확인 창은 세션 기록으로만 알 수 있어서 이 간격으로 기록 파일 하나를 읽는다.
const PERMISSION_POLL_MS = 1_500

// 끝나면 세션을 다시 깨우는 에이전트의 상태다. 셸과 monitor 는 에이전트 목록에 없어서 기다리는 이유로 보지 않는다.
const WAKING_AGENT_STATUSES = new Set(['pending', 'running', 'waiting'])

async function hasWakingAgent($: EngineInterface): Promise<boolean> {
  const agents = await $.agent.list().catch(() => [])
  return agents.some(agent => WAKING_AGENT_STATUSES.has(agent.status))
}

async function runQuietly($: EngineInterface, argv: readonly string[]): Promise<string | undefined> {
  const run = await $.process.run(argv, { timeoutMs: NOTIFY_TIMEOUT_MS }).catch(() => undefined)
  if (run?.exitCode !== 0) {
    $.ui.log(`long-turn-notify-team: ${argv[0]} 실패 ${run?.stderr ?? ''}`.trim(), { to: 'debug' })
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

async function playSound($: EngineInterface, sound: Sound): Promise<void> {
  const sessionTitle = await readSessionName($).catch(() => undefined)
  if (sessionTitle) await speakSessionName($, sessionTitle)
  const file = await soundFile($, sound)
  if (file) await runQuietly($, playCommand(file))
}

async function notify($: EngineInterface, notice: Notice, sound: Sound): Promise<void> {
  await Promise.all([runQuietly($, ['osascript', '-e', appleScript(notice)]), playSound($, sound)])
}

async function notifyWaiting($: EngineInterface, waiting: Waiting, detail: string): Promise<void> {
  const notice = waitingNotice(projectName(await $.session.cwd()), waiting, detail)
  // 창이 뜨는 것을 늦추지 않도록 알림은 따로 띄운다.
  $.clock.after(0, () => void notify($, notice, WAITING_SOUND))
}

async function notifyDone($: EngineInterface, startedAt: number | undefined, ending: Ending, answer: string): Promise<void> {
  if (startedAt === undefined) return
  const durationMs = (await $.clock.now()) - startedAt
  if (durationMs < MIN_DURATION_MS) return

  const notice = buildNotice(projectName(await $.session.cwd()), ending, durationMs, answer)
  // 턴 마무리를 늦추지 않도록 알림은 턴이 끝난 뒤 띄운다.
  $.clock.after(0, () => void notify($, notice, DONE_SOUND))
}

type PermissionWatch = {
  cache: RecordCache
  // 선택 창도 권한 확인 상태로 보일 수 있어서, 선택 창 알림을 낸 동안에는 다시 울리지 않는다.
  isAsking: boolean
  // 권한 확인 창 하나에 한 번만 알린다. 창이 닫히면 다음 창을 위해 지운다.
  isNotified: boolean
  isPolling: boolean
}

async function watchPermission($: EngineInterface, watch: PermissionWatch): Promise<void> {
  if (watch.isPolling) return
  watch.isPolling = true
  try {
    const record = await readSessionRecord($, watch.cache)
    const isWaiting = isWaitingForPermission(record, await $.session.id())
    if (!isWaiting) watch.isNotified = false
    else if (!watch.isNotified && !watch.isAsking) {
      watch.isNotified = true
      await notifyWaiting($, 'permission', '')
    }
  } finally {
    watch.isPolling = false
  }
}

// Team·Enterprise 조직 계정에서는 기본 보안 플러그인(cc-plugin-sec-default)이 classic 훅을 사용자 플러그인에 넘기지 않는다.
// 그래서 작업의 시작과 끝은 classic 대신 turn 이벤트로 잰다.
export const register: Register = on => {
  const watch: PermissionWatch = { cache: {}, isAsking: false, isNotified: false, isPolling: false }
  // 메인 대화의 턴이 시작된 때부터 잰다. 백그라운드 에이전트가 끝나 다시 깨어난 턴까지 한 작업으로 본다.
  let startedAt: number | undefined

  // 한 작업의 끝은 한 번만 알리도록 시작 시각을 꺼내면서 지운다.
  const takeStartedAt = (): number | undefined => {
    const began = startedAt
    startedAt = undefined
    return began
  }

  // 권한 확인 창은 classic 알림이 오지 않는 조직 계정에서도 알 수 있게 세션 기록으로 지켜본다.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    if (e.isInteractive) $.clock.every(PERMISSION_POLL_MS, () => void watchPermission($, watch).catch(() => undefined))
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) startedAt ??= await $.clock.now()
    return next(e)
  })

  // 직접 멈춘 턴은 사용자가 화면 앞에 있으니 알리지 않는다.
  // 답한 턴이어도 백그라운드 에이전트가 남아 있으면 그것이 끝날 때 세션이 다시 깨어나므로 아직 명령을 기다리는 때가 아니다.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    if (e.reason === 'aborted') {
      startedAt = undefined
      return result
    }
    if (e.reason === 'answer' && (await hasWakingAgent($))) return result
    await notifyDone($, takeStartedAt(), e.reason, e.answer)
    return result
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await notifyWaiting($, 'question', e.questions[0]?.question ?? '')
    watch.isAsking = true
    watch.isNotified = true
    try {
      return await next(e)
    } finally {
      watch.isAsking = false
    }
  })
}
