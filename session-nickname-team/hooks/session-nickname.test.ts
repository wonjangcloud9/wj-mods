import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { RECENT_LIMIT, pickName, readRecent, remember } from './names'
import { nameFromRecord } from './registry'

const NAME = /^[a-z]+-[a-z]+$/
const SESSION_ID = 'session-1'

type World = {
  turns?: number
  registered?: { name: string; nameSource?: string }
  isRenameRefused?: boolean
}

function world(on: On, options: World = {}) {
  const tails: (string | undefined)[] = []
  const renames: string[] = []
  let attempts = 0
  let registered = options.registered
  const clock = mock.clock(on, { now: 0 })
  mock.store(on, {})
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('env.get', () => ({ value: '/Users/me' }))
  on('session.id', () => ({ value: SESSION_ID }))
  on('session.turns', () => ({ value: options.turns ?? 0 }))
  on('fs.list', () => ({ value: [{ name: '123.json', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] }))
  on('fs.read', () => ({ value: JSON.stringify({ sessionId: SESSION_ID, name: 'my-project-7b', nameSource: 'derived', ...registered }) }))
  on('command.run', { command: 'rename' }, (_, e) => {
    attempts++
    if (options.isRenameRefused) throw new Error('refused')
    renames.push(e.args)
    registered = { name: e.args, nameSource: 'user' }
    return { text: `Session renamed to: ${e.args}` }
  })
  on('ui.render', { component: 'PromptHint' }, (_, e) => {
    tails.push(e.props.tail)
    return { type: 'Text' }
  })
  return { tails, renames, clock, attempts: () => attempts, rename: (name: string) => (registered = { name, nameSource: 'user' }) }
}

async function drawHint($: Engine): Promise<void> {
  await $.ui.render({
    surface: 'terminal',
    component: 'PromptHint',
    requestId: 'hint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })
}

const START = { cwd: '/Users/me/my-project', surface: 'terminal', isInteractive: true } as const
const turn = (turnId: string, agentId?: string) => ({ text: 'hi', turnId, ...(agentId ? { agentId } : {}) })

describe('names', () => {
  test('최근에 쓴 이름은 건너뛴다', () => {
    const first = pickName([], () => 0)
    expect(first).toBe('sleepy-otter')
    expect(pickName([first], () => 0)).toBe('sleepy-panda')
  })

  test('최근 이름은 새것부터 정해진 개수만 남긴다', () => {
    const many = Array.from({ length: RECENT_LIMIT }, (_, i) => `n-${i}`)
    const kept = remember(many, 'n-5')
    expect(kept[0]).toBe('n-5')
    expect(kept).toHaveLength(RECENT_LIMIT)
    expect(remember(many, 'new')).toHaveLength(RECENT_LIMIT)
  })

  test('저장값이 깨져 있으면 빈 목록으로 읽는다', () => {
    expect(readRecent(undefined)).toEqual([])
    expect(readRecent(['a', 3, 'b'])).toEqual(['a', 'b'])
  })

  test('세션 목록 기록에서 엔진이 폴더 이름으로 만든 이름은 읽지 않는다', () => {
    expect(nameFromRecord({ sessionId: 's', name: 'repo-7b', nameSource: 'derived' }, 's')).toBeUndefined()
    expect(nameFromRecord({ sessionId: 's', name: 'sleepy-otter', nameSource: 'user' }, 's')).toBe('sleepy-otter')
    expect(nameFromRecord({ sessionId: 'other', name: 'sleepy-otter', nameSource: 'user' }, 's')).toBeUndefined()
    expect(nameFromRecord('broken', 's')).toBeUndefined()
  })
})

describe('session start', () => {
  test('새 세션은 시작 때 고른 이름을 /rename 으로 세션 목록 이름까지 붙이고 힌트 줄에 보여 준다', async ($, on) => {
    const { tails, renames, clock } = world(on)
    await $.session.start(START)
    await clock.advance(0)
    expect(renames).toHaveLength(1)
    expect(renames[0]).toMatch(NAME)
    await drawHint($)
    expect(tails.at(-1)).toBe(`  @${renames[0]}`)
  })

  test('이름이 붙은 뒤의 턴은 이름을 다시 붙이지 않는다', async ($, on) => {
    const { renames, clock } = world(on)
    await $.session.start(START)
    await clock.advance(0)
    await $.turn.start(turn('t1'))
    await $.turn.start(turn('t2'))
    await clock.advance(0)
    expect(renames).toHaveLength(1)
  })

  test('이미 이름이 있는 세션은 바꾸지 않는다', async ($, on) => {
    const { tails, renames, clock } = world(on, { registered: { name: 'my-work', nameSource: 'user' } })
    await $.session.start(START)
    await $.turn.start(turn('t1'))
    await clock.advance(0)
    expect(renames).toHaveLength(0)
    await drawHint($)
    expect(tails.at(-1)).toBe('  @my-work')
  })

  test('resume 한 세션은 첫 턴에 이름이 되살아났는지 보고 없을 때만 붙인다', async ($, on) => {
    const { renames, clock, rename } = world(on, { turns: 3 })
    await $.session.start(START)
    await clock.advance(0)
    expect(renames).toHaveLength(0)
    // 엔진이 첫 턴 전에 예전 이름을 되살렸다.
    rename('old-name')
    await $.turn.start(turn('t1'))
    await clock.advance(0)
    expect(renames).toHaveLength(0)
  })

  test('이름 없이 다시 불러온 세션은 다음 턴에 이름을 붙인다', async ($, on) => {
    const { renames, clock } = world(on, { turns: 5 })
    await $.session.start(START)
    await $.turn.start(turn('t1'))
    await clock.advance(0)
    expect(renames).toHaveLength(1)
  })

  test('/rename 으로 바뀐 이름을 다음 턴에 힌트 줄에 반영한다', async ($, on) => {
    const { tails, clock, rename } = world(on)
    await $.session.start(START)
    await clock.advance(0)
    rename('renamed')
    await $.turn.start(turn('t1'))
    await drawHint($)
    expect(tails.at(-1)).toBe('  @renamed')
  })

  test('서브에이전트 턴과 -p 실행에는 이름을 붙이지 않는다', async ($, on) => {
    const { renames, clock } = world(on, { turns: 1 })
    await $.session.start(START)
    await $.turn.start(turn('t1', 'agent-1'))
    await clock.advance(0)
    expect(renames).toHaveLength(0)

    await $.session.start({ ...START, surface: null, isInteractive: false })
    await $.turn.start(turn('t2'))
    await clock.advance(0)
    expect(renames).toHaveLength(0)
  })

  test('/rename 이 실패해도 턴마다 되풀이하지 않는다', async ($, on) => {
    const { tails, clock, attempts } = world(on, { isRenameRefused: true })
    await $.session.start(START)
    await clock.advance(0)
    await $.turn.start(turn('t1'))
    await clock.advance(0)
    expect(attempts()).toBe(1)
    await drawHint($)
    expect(tails.at(-1)).toMatch(/^ {2}@[a-z]+-[a-z]+$/)
  })

  test('이름이 정해지기 전에는 힌트 줄을 그대로 둔다', async ($, on) => {
    const { tails } = world(on)
    await drawHint($)
    expect(tails.at(-1)).toBeUndefined()
  })
})
