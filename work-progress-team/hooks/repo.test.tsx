import { describe, expect, test } from 'claude-code/testing'

import type { LaterItem, LiveSession } from '../types'
import { toBoard, toReport } from './model'
import { onlyRepo, repoSections } from './repo'
import { HOUR, ME, NOW, SESSIONS, START, WORKS, live, mountPane, work, world } from './testkit'

const SHOP = '/r/shop'
const OTHER = '/r/other'
const at = (session: LiveSession, repo: string): LiveSession => ({ ...session, repo })
const later = (id: string, repo: string): LaterItem => ({
  id,
  text: '나중',
  status: 'open',
  sessionName: 'x',
  repo,
  createdAt: NOW - HOUR,
  updatedAt: NOW - HOUR,
})

function boardOf(repo: string | undefined) {
  const board = toBoard(
    [
      work('mine', { sessionId: 'a', repo: SHOP }),
      work('theirs', { sessionId: 'b', repo: OTHER }),
      work('theirs-2', { sessionId: 'b', repo: OTHER, updatedAt: NOW - 2 * HOUR }),
      work('legacy', { sessionId: 'c' }),
    ],
    [at(live('a', 'a', true), SHOP), at(live('b', 'b', true), OTHER), at(live('d', 'd', false), OTHER)],
    NOW,
    new Map(),
    0,
    [later('l1', OTHER), later('l2', SHOP)],
  )
  return repo ? { ...board, repo } : board
}

describe('레포 섹션', () => {
  test('모든 레포를 섹션으로 나누고, 이 세션의 레포를 업무가 적어도 맨 위에 둔다', () => {
    const sections = repoSections(boardOf(SHOP))
    expect(sections.map(section => section.repo)).toEqual([SHOP, OTHER])
    const [here, other] = sections
    if (!here || !other) throw new Error('sections missing')
    expect(here.board.rows.map(row => row.work.id).sort()).toEqual(['legacy', 'mine'])
    expect(here.board.later.map(item => item.id)).toEqual(['l2'])
    expect(other.board.rows.map(row => row.work.id).sort()).toEqual(['theirs', 'theirs-2'])
    expect(other.board.untracked.map(session => session.sessionId)).toEqual(['d'])
  })

  test('세션 시작 안내에는 이 세션 레포의 업무만 싣고, 레포를 모르면 모두 싣는다', () => {
    expect(onlyRepo(boardOf(SHOP))?.rows.map(row => row.work.id).sort()).toEqual(['legacy', 'mine'])
    expect(onlyRepo(boardOf(undefined))?.rows).toHaveLength(4)
  })

  test('기록할 때 세션의 레포를 남기고, 레포를 모르면 이전 레포를 지킨다', () => {
    const input = { work_id: 'w', title: 't', steps: [{ title: 'a', done: false }] }
    const moved = toReport(input, work('w', { repo: OTHER }), { sessionId: ME, sessionName: 'm', repo: SHOP, at: NOW })
    const kept = toReport(input, work('w', { repo: OTHER }), { sessionId: ME, sessionName: 'm', at: NOW })
    if ('error' in moved || 'error' in kept) throw new Error('report failed')
    expect(moved.work.repo).toBe(SHOP)
    expect(kept.work.repo).toBe(OTHER)
  })
})

test('패널은 레포가 둘 이상이면 레포마다 굵은 선 아래에 칸을 나눠 보인다', async ($, on) => {
  world(on, {
    [`${WORKS}/a.json`]: work('a', { title: '가게 일', repo: SHOP }),
    [`${WORKS}/b.json`]: work('b', { title: '다른 일', repo: OTHER }),
    [`${SESSIONS}/1.json`]: { sessionId: 'session-me', name: 'crispy-mandu', status: 'busy' },
  })
  await $.session.start(START)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^━━ shop · 업무 1 / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^━━ other · 업무 1 / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /가게 일/})).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /다른 일/ })).toBeDefined()
})
