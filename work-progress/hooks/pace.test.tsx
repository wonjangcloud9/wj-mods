import { describe, expect, test } from 'claude-code/testing'

import type { Work } from '../types'
import { toBoard } from './model'
import { paceOf, remainingMs } from './pace'
import { HOUR, NOW, SESSIONS, START, WORKS, mountPane, work, world } from './testkit'

const MINUTE = 60_000
const BEGIN = NOW - 10 * HOUR

// BEGIN 부터 차례로 minutes 씩 걸려 끝낸 단계들 뒤에 남은 단계 left 개를 붙인다.
function timed(id: string, minutes: number[], left: number, patch: Partial<Work> = {}): Work {
  let at = BEGIN
  const done = minutes.map((took, index) => {
    at += took * MINUTE
    return { title: `끝 ${index}`, isDone: true, evidence: 'x', doneAt: at }
  })
  const rest = Array.from({ length: left }, (_, index) => ({ title: `남음 ${index}`, isDone: false }))
  return work(id, { createdAt: BEGIN, updatedAt: at, steps: [...done, ...rest], ...patch })
}

describe('단계 속도', () => {
  test('이 업무를 두 단계 이상 쟀으면 지난 기록 없이 이 업무의 중앙값을 쓴다', () => {
    expect(paceOf(timed('w', [10, 30, 20], 2), [timed('o', [300, 300, 300], 0)])).toBe(20 * MINUTE)
  })

  test('덜 쟀으면 같은 종류의 지난 업무 기록과 섞고, 섞어도 모자라면 예상하지 않는다', () => {
    const others = [timed('a', [20, 40], 0), timed('b', [60], 0)]
    expect(paceOf(timed('w', [10], 2), others)).toBe(30 * MINUTE)
    expect(paceOf(timed('w', [10], 2), [timed('a', [20], 0)])).toBeUndefined()
  })

  test('일하는 중이면 지금 단계에 쓴 시간을 빼고, 예상을 넘긴 마지막 단계는 예상하지 않는다', () => {
    const flow = timed('w', [20, 20], 3)
    const lastDone = BEGIN + 40 * MINUTE
    expect(remainingMs(flow, 20 * MINUTE, 'running', lastDone + 15 * MINUTE)).toBe(45 * MINUTE)
    expect(remainingMs(flow, 20 * MINUTE, 'paused', lastDone + 15 * MINUTE)).toBe(60 * MINUTE)
    expect(remainingMs(timed('w', [20, 20], 1), 20 * MINUTE, 'running', lastDone + 30 * MINUTE)).toBeUndefined()
  })

  test('진행판은 서브에이전트 기록을 메인 업무 속도에 섞지 않고, 끝난 업무에는 예상을 붙이지 않는다', () => {
    const board = toBoard(
      [
        timed('main', [10], 2),
        timed('sub', [100, 100, 100], 0, { agentId: 'x', parentId: 'main' }),
        timed('closed', [20, 30], 0, { status: 'done', doneAt: NOW }),
      ],
      [],
      NOW,
    )
    const paces = Object.fromEntries(board.rows.map(row => [row.work.id, row.paceMs]))
    expect(paces).toEqual({ main: 20 * MINUTE, closed: undefined })
  })
})

test('업무 줄에 남은 단계로 본 예상 시간을 보인다', async ($, on) => {
  world(on, {
    [`${WORKS}/eta.json`]: work('eta', {
      sessionId: 'a',
      title: '예상 시간',
      createdAt: NOW - 70 * MINUTE,
      updatedAt: NOW - 10 * MINUTE,
      steps: [
        { title: '조사', isDone: true, evidence: '원문', doneAt: NOW - 50 * MINUTE },
        { title: '작성', isDone: true, evidence: '초안', doneAt: NOW - 10 * MINUTE },
        { title: '검토', isDone: false },
        { title: '보고', isDone: false },
      ],
    }),
    [`${SESSIONS}/1.json`]: { sessionId: 'a', name: 'shy-quokka', status: 'busy' },
  })
  await $.session.start(START)
  const ui = await mountPane($)
  // 단계 하나에 30분, 남은 두 단계에서 지금 단계에 쓴 10분을 뺀다.
  expect(await ui.find({ type: 'Text', text: / 2\/4 · 약 50분 남음 · 10분 전 · @shy-quokka$/ })).toBeDefined()
  await ui.unmount()
})
