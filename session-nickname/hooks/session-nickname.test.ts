import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { RECENT_LIMIT, pickName, readRecent, remember } from './names'

const NAME = /^[a-z]+-[a-z]+$/

function world(on: On, recent?: readonly string[]) {
  const tails: (string | undefined)[] = []
  mock.store(on, recent ? { recent } : {})
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('ui.render', { component: 'PromptHint' }, (_, e) => {
    tails.push(e.props.tail)
    return { type: 'Text' }
  })
  return { tails }
}

async function drawHint($: Engine): Promise<void> {
  await $.ui.render({
    surface: 'terminal',
    component: 'PromptHint',
    requestId: 'hint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })
}

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
})

describe('session start', () => {
  test('새 세션은 시작 때 고른 이름을 힌트 줄에 보여 주고 첫 프롬프트 때 세션 이름으로 붙인다', async ($, on) => {
    const { tails } = world(on)
    const started = await $.classic.SessionStart({ source: 'startup' })
    // 시작 때 넘기면 세션 목록 이름이 바뀌지 않으므로 넘기지 않는다.
    expect(started.sessionTitle).toBeUndefined()
    await drawHint($)
    const shown = tails.at(-1)?.trim().slice(1)
    expect(shown).toMatch(NAME)

    const submitted = await $.classic.UserPromptSubmit({ prompt: 'hi' })
    expect(submitted.sessionTitle).toBe(shown)
  })

  test('이름이 붙은 뒤의 프롬프트는 이름을 다시 넘기지 않는다', async ($, on) => {
    world(on)
    await $.classic.SessionStart({ source: 'startup' })
    const first = await $.classic.UserPromptSubmit({ prompt: 'hi' })
    const second = await $.classic.UserPromptSubmit({ prompt: 'again', session_title: first.sessionTitle })
    expect(second.sessionTitle).toBeUndefined()
  })

  test('이름이 정해지기 전에는 힌트 줄을 그대로 둔다', async ($, on) => {
    const { tails } = world(on)
    await drawHint($)
    expect(tails.at(-1)).toBeUndefined()
  })

  test('연달아 연 세션은 서로 다른 이름을 받는다', async ($, on) => {
    const { tails } = world(on)
    const names = new Set<string | undefined>()
    for (let i = 0; i < 20; i++) {
      await $.classic.SessionStart({ source: 'startup' })
      await drawHint($)
      names.add(tails.at(-1))
    }
    expect(names.size).toBe(20)
  })

  test('이미 이름이 있는 세션은 바꾸지 않는다', async ($, on) => {
    const { tails } = world(on)
    const result = await $.classic.SessionStart({ source: 'resume', session_title: 'my-work' })
    expect(result.sessionTitle).toBeUndefined()
    await drawHint($)
    expect(tails.at(-1)).toBe('  @my-work')
    const submitted = await $.classic.UserPromptSubmit({ prompt: 'hi', session_title: 'my-work' })
    expect(submitted.sessionTitle).toBeUndefined()
  })

  test('/rename 으로 바뀐 이름을 다음 프롬프트 때 힌트 줄에 반영한다', async ($, on) => {
    const { tails } = world(on)
    await $.classic.UserPromptSubmit({ prompt: 'hi', session_title: 'renamed' })
    await drawHint($)
    expect(tails.at(-1)).toBe('  @renamed')
  })
})
