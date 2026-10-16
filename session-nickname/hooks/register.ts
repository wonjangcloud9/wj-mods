import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { hintTail, pickName, readRecent, remember } from './names'

const RECENT_KEY = 'recent'

const nickname = atom({ plugin: 'session-nickname', key: 'name' } as const, '')

// 기록을 못 읽거나 못 써도 이름은 붙인다. 겹칠 확률만 조금 올라간다.
async function assignName($: EngineInterface): Promise<string> {
  const recent = readRecent(await $.store.get(RECENT_KEY).catch(() => undefined))
  const name = pickName(recent)
  await $.store.set(RECENT_KEY, remember(recent, name)).catch(() => undefined)
  return name
}

export const register: Register = on => {
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    // /rename 이나 resume 으로 이미 이름이 있으면 주소가 바뀌지 않게 그대로 둔다.
    const existing = result.sessionTitle ?? e.session_title
    if (existing) {
      await update($, nickname, () => existing)
      return result
    }

    const name = await assignName($)
    await update($, nickname, () => name)
    return { ...result, sessionTitle: name }
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    const title = result.sessionTitle ?? e.session_title
    if (title) await update($, nickname, () => title)
    return result
  })

  // $.ui.status 는 엔진이 mod 이름을 앞에 붙여 그려서, 힌트 줄 끝에 닉네임만 붙인다.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const name = await read($, nickname)
    if (!name) return next(e)
    return next({ ...e, props: { ...e.props, tail: hintTail(name) } })
  })
}
