import { describe, expect, test } from 'claude-code/testing'

import { dueView, readDue } from './due'
import { toReport, toWork } from './model'
import { HOUR, ME, NOW, SESSIONS, START, WORKS, mountPane, work, world } from './testkit'
import { parseOffset } from './timezone'

// NOW 는 서울 시각으로 2026-10-16(금) 12:00 이다.
const SEOUL = 540
const by = { sessionId: ME, sessionName: 'crispy-mandu', at: NOW }
const steps = [{ title: 'a', done: false }]

function reported(input: Record<string, unknown>, previous: Parameters<typeof toReport>[1] = null) {
  const report = toReport({ work_id: 'w', title: 't', steps, ...input }, previous, by)
  if ('error' in report) throw new Error(report.error)
  return report
}

describe('기한 읽기', () => {
  test('날짜와 시각을 같은 모양으로 맞추고, 틀린 날짜는 이유를 돌려준다', () => {
    expect(readDue(' 2026-1-5 ')).toEqual({ due: '2026-01-05' })
    expect(readDue('2026-10-30T18:00')).toEqual({ due: '2026-10-30 18:00' })
    expect(readDue('none')).toEqual({ due: '없음' })
    expect(readDue('')).toEqual({ due: undefined })
    expect(readDue('2026-02-30')).toHaveProperty('error')
    expect(readDue('10/30')).toHaveProperty('error')
  })

  test('date 명령이 알려 준 UTC 차이를 분으로 읽는다', () => {
    expect(parseOffset('+0900\n')).toBe(540)
    expect(parseOffset('-0330')).toBe(-210)
    expect(parseOffset('KST')).toBeUndefined()
  })
})

describe('남은 일정', () => {
  test('남은 날을 세고, 사흘 안이면 서두를 일로, 지났으면 지난 날을 센다', () => {
    const view = (due: string | undefined) => dueView(due, NOW, SEOUL)
    expect(view('2026-10-20')).toMatchObject({ text: '기한 10/20(화) · 4일 남음', short: '4일 남음', tone: 'later' })
    expect(view('2026-10-18')).toMatchObject({ text: '기한 10/18(일) · 2일 남음', tone: 'soon' })
    expect(view('2026-10-17')).toMatchObject({ text: '기한 내일', tone: 'soon' })
    expect(view('2026-10-16')).toMatchObject({ text: '기한 오늘', tone: 'soon', days: 0 })
    expect(view('2026-10-14')).toMatchObject({ text: '기한 10/14(수) · 2일 지남', short: '2일 지남', tone: 'over' })
    expect(view(undefined)).toMatchObject({ text: '기한 모름', tone: 'missing' })
    expect(view('없음')).toMatchObject({ text: '기한 없음', tone: 'none' })
  })

  test('오늘 기한에 시각이 있으면 남거나 지난 시간을 센다', () => {
    expect(dueView('2026-10-16 18:00', NOW, SEOUL)).toMatchObject({ text: '기한 오늘 18:00 · 6시간 남음', tone: 'soon' })
    expect(dueView('2026-10-16 09:00', NOW, SEOUL)).toMatchObject({ text: '기한 오늘 09:00 · 3시간 지남', tone: 'over' })
    expect(dueView('2026-10-20 18:00', NOW, SEOUL).text).toBe('기한 10/20(화) 18:00 · 4일 남음')
  })

  test('날짜는 이 컴퓨터의 시간대로 바뀐다', () => {
    // UTC 16:00 은 서울로 다음 날 01:00 이다.
    const lateNight = NOW + 13 * HOUR
    expect(dueView('2026-10-17', lateNight, SEOUL).text).toBe('기한 오늘')
    expect(dueView('2026-10-17', lateNight, 0).text).toBe('기한 내일')
  })
})

describe('기한 기록', () => {
  test('기한은 보내지 않으면 이전 값을 두고, 틀린 형식은 저장하지 않는다', () => {
    const first = reported({ due: '2026-10-30' }).work
    expect(first.due).toBe('2026-10-30')
    expect(reported({}, first).work.due).toBe('2026-10-30')
    expect(reported({ due: '' }, first).work.due).toBeUndefined()
    expect(toReport({ work_id: 'w', title: 't', steps, due: '다음 주' }, null, by)).toHaveProperty('error')
  })

  test('남은 일마다 기한을 받고, 기한을 빼고 다시 보내도 같은 일의 기한을 이어 둔다', () => {
    const first = reported({ status: 'done', followups: [{ text: 'push', due: '2026-10-20' }, { text: '배포 확인' }] }).work
    expect(first.followups).toEqual([{ text: 'push', due: '2026-10-20' }, { text: '배포 확인' }])
    const again = reported({ status: 'done', followups: [{ text: 'push' }, '배포 확인'] }, first).work
    expect(again.followups).toEqual([{ text: 'push', due: '2026-10-20' }, { text: '배포 확인' }])
    const wrong = toReport({ work_id: 'w', title: 't', steps, followups: [{ text: 'push', due: '언젠가' }] }, null, by)
    expect('error' in wrong && wrong.error).toContain('남은 일 "push"')
  })

  test('기한을 모르면 새 업무와 다른 세션에서 이어 받은 업무에서만 묻게 한다', () => {
    const ask = (report: ReturnType<typeof reported>) => report.notes.some(note => note.includes('기한을 몰라요'))
    const first = reported({})
    expect(ask(first)).toBe(true)
    expect(ask(reported({}, first.work))).toBe(false)
    expect(ask(reported({}, { ...first.work, sessionId: 'other' }))).toBe(true)
    expect(ask(reported({ due: '없음' }))).toBe(false)
    const sub = toReport({ work_id: 'w', title: 't', steps }, null, { ...by, agentId: 'x', parentId: 'p' })
    expect('notes' in sub && sub.notes).toEqual([])
  })

  test('기한을 모르는 남은 일을 알려 주고, 업무 기한이 있으면 그 기한을 따른다', () => {
    const left = reported({ status: 'done', followups: [{ text: 'push' }] }).notes
    expect(left).toContain('기한을 모르는 남은 일: push. 사용자에게 기한을 물어 followups 의 due 로 기록하세요.')
    expect(reported({ status: 'done', due: '2026-10-20', followups: [{ text: 'push' }] }).notes).toEqual([])
  })

  test('예전 기록의 글자뿐인 남은 일도 읽는다', () => {
    const old = toWork({ ...work('old'), followups: ['push', { text: '배포', due: '2026-10-20' }, { text: '틀림', due: '언젠가' }] })
    expect(old?.followups).toEqual([{ text: 'push' }, { text: '배포', due: '2026-10-20' }, { text: '틀림' }])
  })
})

test('패널은 업무 제목 옆과 남은 일마다 기한을 보이고, 위 한 줄에 지났거나 오늘인 기한을 센다', async ($, on) => {
  world(on, {
    [`${WORKS}/ship.json`]: work('ship', { sessionId: 'a', title: '출시 준비', due: '2026-10-18' }),
    [`${WORKS}/late.json`]: work('late', { status: 'paused', title: '늦은 일', due: '2026-10-14' }),
    [`${WORKS}/left.json`]: work('left', {
      status: 'done',
      doneAt: NOW - HOUR,
      due: '2026-10-14',
      followups: [{ text: 'push' }, { text: '배포 확인', due: '2026-10-16' }],
    }),
    [`${SESSIONS}/1.json`]: { sessionId: 'a', name: 'shy-quokka', status: 'busy' },
  })
  await $.session.start(START)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^업무 3개 · .* · 기한 지남 2 · 기한 오늘 1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▸ 출시 준비 · 기한 10\/18\(일\) · 2일 남음$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▸ 늦은 일 · 기한 10\/14\(수\) · 2일 지남$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▸ 업무 left · 1시간 전$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^□ push · 기한 10\/14\(수\) · 2일 지남$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^□ 배포 확인 · 기한 오늘$/ })).toBeDefined()
  await ui.unmount()

  const tiny = await mountPane($, 30)
  expect(await tiny.find({ type: 'Text', text: /^▸ 출시 준비 · 2일 남음$/ })).toBeDefined()
  await tiny.unmount()
})

test('date 명령을 못 쓰면 UTC 로 날짜를 센다', async ($, on) => {
  // UTC 2026-10-16 16:00. 서울이면 10/17 이지만 UTC 로는 아직 10/16 이다.
  const seed = { [`${WORKS}/ship.json`]: work('ship', { status: 'paused', title: '출시 준비', due: '2026-10-17' }) }
  world(on, seed, [], { now: NOW + 13 * HOUR, offset: null })
  await $.session.start(START)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^▸ 출시 준비 · 기한 내일$/ })).toBeDefined()
  await ui.unmount()
})
