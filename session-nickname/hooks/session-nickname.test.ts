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
  test('이름이 없는 새 세션에 랜덤 이름을 붙이고 힌트 줄 끝에 이름만 보여 준다', async ($, on) => {
    const { tails } = world(on)
    const result = await $.classic.SessionStart({ source: 'startup' })
    expect(result.sessionTitle).toMatch(NAME)
    await drawHint($)
    expect(tails.at(-1)).toBe(`  @${result.sessionTitle}`)
  })

  test('이름이 정해지기 전에는 힌트 줄을 그대로 둔다', async ($, on) => {
    const { tails } = world(on)
    await drawHint($)
    expect(tails.at(-1)).toBeUndefined()
  })

  test('연달아 연 세션은 서로 다른 이름을 받는다', async ($, on) => {
    world(on)
    const names = new Set<string | undefined>()
    for (let i = 0; i < 20; i++) names.add((await $.classic.SessionStart({ source: 'startup' })).sessionTitle)
    expect(names.size).toBe(20)
  })

  test('이미 이름이 있는 세션은 바꾸지 않는다', async ($, on) => {
    const { tails } = world(on)
    const result = await $.classic.SessionStart({ source: 'resume', session_title: 'my-work' })
    expect(result.sessionTitle).toBeUndefined()
    await drawHint($)
    expect(tails.at(-1)).toBe('  @my-work')
  })

  test('/rename 으로 바뀐 이름을 다음 프롬프트 때 힌트 줄에 반영한다', async ($, on) => {
    const { tails } = world(on)
    await $.classic.UserPromptSubmit({ prompt: 'hi', session_title: 'renamed' })
    await drawHint($)
    expect(tails.at(-1)).toBe('  @renamed')
  })
})
