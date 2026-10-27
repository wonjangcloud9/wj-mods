import { describe, expect, test } from 'claude-code/testing'

import type { LaterItem } from '../types'
import { laterFromArgs, readLaterInput } from './later'
import { countDue, guideText, toBoard } from './model'
import { COMPOSE, HOUR, LATER, NOW, SESSIONS, START, WORKS, mountPane, work, world } from './testkit'

const LATER_TOOL = 'mcp__work-progress__later'
const by = { sessionName: 'crispy-mandu', at: NOW }

function item(id: string, patch: Partial<LaterItem> = {}): LaterItem {
  return { id, text: `할 일 ${id}`, status: 'open', sessionName: 'shy-quokka', createdAt: NOW - 2 * HOUR, updatedAt: NOW - 2 * HOUR, ...patch }
}

function context(open: LaterItem[] = []) {
  let next = 0
  return {
    works: new Map([['deploy-check', '운영 배포 점검']]),
    open: new Map(open.map(entry => [entry.id, entry])),
    by,
    newId: () => `later-${next++}`,
  }
}

describe('나중에 할 일 읽기', () => {
  test('새 일은 나온 업무의 제목과 기한을 붙여 남기고, 열린 일만 닫는다', () => {
    const change = readLaterInput(
      {
        add: [{ text: '씨앗 Node 버전 올리기', work_id: 'Deploy-Check' }, { text: 'api Node 18 정하기', due: '2026-10-30' }],
        done: ['old'],
      },
      context([item('old')]),
    )
    if ('error' in change) throw new Error(change.error)
    expect(change.add).toEqual([
      { id: 'later-0', text: '씨앗 Node 버전 올리기', workId: 'deploy-check', workTitle: '운영 배포 점검', status: 'open', sessionName: 'crispy-mandu', createdAt: NOW, updatedAt: NOW },
      { id: 'later-1', text: 'api Node 18 정하기', due: '2026-10-30', status: 'open', sessionName: 'crispy-mandu', createdAt: NOW, updatedAt: NOW },
    ])
    expect(change.close).toEqual([{ ...item('old'), status: 'done', updatedAt: NOW }])
    expect(change.notes).toEqual(['남김: later-0 · 씨앗 Node 버전 올리기', '남김: later-1 · api Node 18 정하기', '끝냄: old · 할 일 old'])
  })

  test('틀린 기한, 없는 업무, 없는 id, 빈 요청은 이유를 돌려준다', () => {
    const errorOf = (input: Record<string, unknown>) => {
      const change = readLaterInput(input, context([item('old')]))
      return 'error' in change ? change.error : ''
    }
    expect(errorOf({ add: [{ text: 'a', due: '다음 주' }] })).toContain("'2026-10-30'")
    expect(errorOf({ add: [{ text: 'a', work_id: 'nope' }] })).toContain('work_id nope 업무를 찾지 못했어요')
    expect(errorOf({ drop: ['missing'] })).toBe('열린 나중에 할 일 중에 없는 id: missing')
    expect(errorOf({})).toBe('add, done, drop 중 하나 이상을 보내 주세요.')
  })

  test('/progress 나중 뒤에 적은 글만 할 일로 읽는다', () => {
    expect(laterFromArgs('나중 씨앗 Node 버전 올리기')).toBe('씨앗 Node 버전 올리기')
    expect(laterFromArgs('later bump node')).toBe('bump node')
    expect(laterFromArgs('나중')).toBeUndefined()
    expect(laterFromArgs('요약')).toBeUndefined()
  })
})

describe('진행판의 나중에 할 일', () => {
  test('열린 일만 먼저 남긴 순서로 싣고, 기한을 적은 일만 기한 개수에 센다', () => {
    const board = toBoard([], [], NOW, new Map(), 540, [
      item('b', { createdAt: NOW - HOUR }),
      item('a', { due: '2026-10-15' }),
      item('closed', { status: 'done' }),
      item('none', { due: '없음' }),
    ])
    expect(board.later.map(entry => entry.id)).toEqual(['a', 'none', 'b'])
    expect(countDue(board)).toEqual({ over: 1, today: 0 })
  })

  test('시스템 안내에 열린 일을 id 와 출처와 함께 넣는다', () => {
    const board = toBoard([], [], NOW, new Map(), 540, [item('a', { workTitle: '운영 배포 점검' })])
    expect(guideText(board)).toContain('나중에 할 일:\n- a · 할 일 a · 출처: 운영 배포 점검')
    expect(guideText(board)).toContain('mcp__work-progress__later')
  })
})

test('도구로 남긴 나중에 할 일은 패널에 보이고, 끝냄을 누르면 닫힌다', async ($, on) => {
  const { raw } = world(on, {
    [`${WORKS}/deploy-check.json`]: work('deploy-check', { title: '운영 배포 점검', status: 'done', doneAt: NOW - 10 * 60_000 }),
    [`${SESSIONS}/1.json`]: { sessionId: 'session-me', name: 'crispy-mandu', status: 'busy' },
  })
  await $.session.start(START)
  const ran = await $.tool.call({ tool: LATER_TOOL, add: [{ text: '씨앗 Node 버전 올리기', work_id: 'deploy-check' }] } as never)
  const id = /남김: (later-[0-9a-f]{8})/.exec(String(ran.result ?? ''))?.[1] ?? ''
  expect(id).not.toBe('')
  expect(raw(`${LATER}/${id}.json`)).toMatchObject({ text: '씨앗 Node 버전 올리기', workTitle: '운영 배포 점검', status: 'open' })

  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^업무 1개 · ✓ 오늘 완료 1 · ◇ 나중에 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ ◇ 씨앗 Node 버전 올리기 · 운영 배포 점검 · 방금' })).toBeDefined()
  await ui.press({ key: `toggle-later:${id}` })
  expect(await ui.find({ type: 'Text', text: '나온 업무: 운영 배포 점검' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '남긴 세션: @crispy-mandu' })).toBeDefined()
  await ui.press({ key: `later-done-${id}` })
  expect(raw(`${LATER}/${id}.json`)).toMatchObject({ status: 'done' })
  expect(await ui.find({ type: 'Text', text: /씨앗 Node/ })).toBeUndefined()
  await ui.unmount()
})

test('/progress 나중 으로 사용자가 직접 남기고, 요약과 시스템 안내에도 실린다', async ($, on) => {
  world(on, {
    [`${LATER}/later-old.json`]: item('later-old', { text: 'api Node 18 정하기', due: '2026-10-30', workTitle: '운영 배포 점검' }),
  })
  await $.session.start(START)
  const guide = (await $.prompt.compose(COMPOSE)).sections.find(section => section.id === 'work-progress:guide')?.text
  expect(guide).toContain('- later-old · api Node 18 정하기 [기한 10/30(금) · 14일 남음] · 출처: 운영 배포 점검')

  const run = (args: string) =>
    $.command.run({ command: 'progress', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((await run('나중 씨앗 Node 버전 올리기')).text).toBe('나중에 할 일로 남겼어요: 씨앗 Node 버전 올리기')
  expect((await run('요약')).text).toBe(
    [
      '업무 요약 · 최근 24시간',
      '나중에 2\n- api Node 18 정하기(기한 10/30(금) · 14일 남음) · 운영 배포 점검\n- 씨앗 Node 버전 올리기',
    ].join('\n\n'),
  )
})
