import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { hintTail, pickName, readRecent, remember } from './names'
import { readRegisteredName } from './registry'

const RECENT_KEY = 'recent'

const nickname = atom({ plugin: 'session-nickname-team', key: 'name' } as const, '')

// 기록을 못 읽거나 못 써도 이름은 붙인다. 겹칠 확률만 조금 올라간다.
async function assignName($: EngineInterface): Promise<string> {
  const recent = readRecent(await $.store.get(RECENT_KEY).catch(() => undefined))
  const name = pickName(recent)
  await $.store.set(RECENT_KEY, remember(recent, name)).catch(() => undefined)
  return name
}

// 세션 목록에 이미 이름이 있으면 그 이름을 힌트 줄에 보여 준다. /rename·resume 으로 붙은 이름도 여기서 읽는다.
async function showRegisteredName($: EngineInterface): Promise<boolean> {
  const registered = await readRegisteredName($).catch(() => undefined)
  if (!registered) return false
  await update($, nickname, () => registered)
  return true
}

async function rename($: EngineInterface, name: string): Promise<void> {
  try {
    await $.command.run({ command: 'rename', args: name })
  } catch (error) {
    $.ui.log(`session-nickname-team: 세션 이름을 붙이지 못했어요 (${String(error)})`)
  }
  // 다른 세션이 같은 이름을 쓰고 있으면 엔진이 이름을 바꿔 붙이므로 실제 이름을 다시 읽는다.
  await showRegisteredName($)
}

type Naming = {
  isInteractive: boolean
  // 불러온 동안 /rename 은 한 번만 시도한다. 실패해도 턴마다 되풀이하지 않는다.
  isRenameTried: boolean
}

async function nameIfUnnamed($: EngineInterface, naming: Naming): Promise<void> {
  if ((await showRegisteredName($)) || naming.isRenameTried) return
  naming.isRenameTried = true
  const name = (await read($, nickname)) || (await assignName($))
  await update($, nickname, () => name)
  // 훅 안에서 부르면 엔진이 거절하므로 훅이 끝난 뒤 부른다. 엔진은 세션이 쉴 때 실행한다.
  $.clock.after(0, () => void rename($, name))
}

// Team·Enterprise 조직 계정에서는 기본 보안 플러그인(cc-plugin-sec-default)이 classic 훅을 사용자 mod 에 넘기지 않는다.
// 그래서 classic 훅의 sessionTitle 대신 /rename 을 대신 실행해 이름을 붙인다. /rename 은 세션 목록 이름(@주소)까지 바꾼다.
export const register: Register = on => {
  const naming: Naming = { isInteractive: false, isRenameTried: false }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    naming.isInteractive = e.isInteractive
    if (!naming.isInteractive) return result
    // resume 한 세션은 엔진이 예전 이름을 세션 목록에 되살리는 중일 수 있어서 첫 턴까지 기다린다.
    if ((await $.session.turns()) === 0) await nameIfUnnamed($, naming)
    else await showRegisteredName($)
    return result
  })

  // 턴마다 세션 목록 이름을 다시 읽어 /rename 으로 바뀐 이름도 힌트 줄에 반영한다.
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (naming.isInteractive && e.agentId === undefined) await nameIfUnnamed($, naming)
    return result
  })

  // $.ui.status 는 엔진이 mod 이름을 앞에 붙여 그려서, 힌트 줄 끝에 닉네임만 붙인다.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const name = await read($, nickname)
    if (!name) return next(e)
    return next({ ...e, props: { ...e.props, tail: hintTail(name) } })
  })
}
