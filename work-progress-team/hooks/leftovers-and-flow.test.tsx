import { describe, expect, test } from 'claude-code/testing'

import { guideText, stepSpans, toBoard, toReport } from './model'
import { dailySummary } from './summary'
import { HOUR, ME, NOW, SESSIONS, START, TOOL, WORKS, mountPane, work, world } from './testkit'

const MINUTE = 60_000
const by = { sessionId: ME, sessionName: 'crispy-mandu', at: NOW }

function reported(input: Record<string, unknown>, previous: Parameters<typeof toReport>[1], at = NOW) {
  const report = toReport(input, previous, { ...by, at })
  if ('error' in report) throw new Error(report.error)
  return report.work
}

describe('기록', () => {
  test('단계를 처음 완료로 표시한 시각을 남기고, 이어 쓰면 그 시각을 지킨다', () => {
    const first = reported(
      { work_id: 'w', title: 't', steps: [{ title: 'a', done: true, evidence: 'x' }, { title: 'b', done: false }] },
      null,
      NOW - HOUR,
    )
    const second = reported(
      { work_id: 'w', title: 't', steps: [{ title: 'a', done: true, evidence: 'x' }, { title: 'b', done: true, evidence: 'y' }] },
      first,
    )
    expect(second.steps.map(step => step.doneAt)).toEqual([NOW - HOUR, NOW])

    // 시각 없이 완료돼 있던 예전 기록의 단계는 지금 끝낸 것으로 치지 않는다.
    const legacy = reported({ work_id: 'w', title: 't', steps: [{ title: '하나', done: true, evidence: 'abc123' }] }, work('w'))
    expect(legacy.steps[0]?.doneAt).toBeUndefined()
  })

  test('단계마다 걸린 시간은 앞 단계를 끝낸 시각부터 잰다', () => {
    const flow = work('w', {
      createdAt: NOW - 3 * HOUR,
      steps: [
        { title: 'a', isDone: true, doneAt: NOW - 2 * HOUR },
        { title: 'b', isDone: true, doneAt: NOW - 30 * MINUTE },
        { title: 'c', isDone: false },
      ],
    })
    expect(stepSpans(flow)).toEqual([HOUR, 90 * MINUTE, undefined])
  })

  test('남은 일은 보내지 않으면 그대로 두고, 빈 목록을 보내면 지운다', () => {
    const steps = [{ title: 'a', done: true, evidence: 'x' }]
    const closed = reported({ work_id: 'w', title: 't', steps, status: 'done', followups: ['push', ' '] }, null)
    expect(closed.followups).toEqual([{ text: 'push' }])
    expect(reported({ work_id: 'w', title: 't', steps, status: 'done' }, closed).followups).toEqual([{ text: 'push' }])
    expect(reported({ work_id: 'w', title: 't', steps, status: 'done', followups: [] }, closed).followups).toBeUndefined()
  })

  test('기다리는 이유는 보낼 때만 남는다', () => {
    const steps = [{ title: 'a', done: false }]
    const paused = reported({ work_id: 'w', title: 't', steps, status: 'paused', waiting_for: '디자인 확정' }, null)
    expect(paused.waitingFor).toBe('디자인 확정')
    expect(reported({ work_id: 'w', title: 't', steps }, paused).waitingFor).toBeUndefined()
  })
})

describe('진행판', () => {
  test('남은 일이 있는 완료 업무는 하루가 지나도 남고, 하루 넘게 기록 없는 멈춤과 보류는 오래 멈춤으로 접는다', () => {
    const board = toBoard(
      [
        work('left', { status: 'done', doneAt: NOW - 30 * HOUR, followups: [{ text: 'push' }] }),
        work('gone', { status: 'done', doneAt: NOW - 30 * HOUR }),
        work('old-pause', { status: 'paused', updatedAt: NOW - 30 * HOUR }),
        work('old-stall', { sessionId: 'z', updatedAt: NOW - 30 * HOUR }),
        work('pause', { status: 'paused', updatedAt: NOW - HOUR }),
      ],
      [],
      NOW,
    )
    expect(board.rows.map(row => [row.work.id, row.phase])).toEqual([
      ['pause', 'paused'],
      ['left', 'followUp'],
      ['old-pause', 'dormant'],
      ['old-stall', 'dormant'],
    ])
  })

  test('시스템 안내에 남은 일이 있는 완료 업무를 따로 적는다', () => {
    const board = toBoard([work('left', { status: 'done', doneAt: NOW, followups: [{ text: 'push' }, { text: '배포 확인' }] })], [], NOW)
    expect(guideText(board)).toContain('남은 일이 있는 완료 업무:\n- left · 업무 left · 남은 일: push [기한 모름], 배포 확인 [기한 모름]')
  })
})

test('메인 대화가 기록하면 서브에이전트가 닫지 않고 끝난 기록을 알려 주고, 대신 닫아도 부모 아래에 남는다', async ($, on) => {
  const { read } = world(
    on,
    {
      [`${WORKS}/parent.json`]: work('parent', { sessionId: ME, title: '검색 기능 명세' }),
      [`${WORKS}/sub-left.json`]: work('sub-left', {
        sessionId: ME,
        agentId: 'z',
        parentId: 'parent',
        title: '캐시 구조 조사',
        status: 'paused',
        now: '결과 파일 저장만 남음',
      }),
      [`${WORKS}/sub-running.json`]: work('sub-running', { sessionId: ME, agentId: 'x', parentId: 'parent', title: '도는 조사' }),
      [`${WORKS}/sub-done.json`]: work('sub-done', { sessionId: ME, agentId: 'y', parentId: 'parent', status: 'done', doneAt: NOW }),
    },
    [{ id: 'x', description: '도는 조사', status: 'running' }],
  )
  await $.session.start(START)

  const steps = [{ title: 'a', done: false }]
  const ran = await $.tool.call({ tool: TOOL, work_id: 'parent', title: '검색 기능 명세', steps })
  expect(ran.result).toContain('서브에이전트가 닫지 않고 끝난 기록 1개')
  expect(ran.result).toContain('- sub-left · 캐시 구조 조사 · 보류 1/2 · 결과 파일 저장만 남음')
  expect(ran.result).not.toContain('sub-running')

  const closed = await $.tool.call({
    tool: TOOL,
    work_id: 'sub-left',
    title: '캐시 구조 조사',
    steps: [{ title: 'a', done: true, evidence: '대상 경로에 있음' }],
    status: 'done',
  })
  expect(closed.result).not.toContain('닫지 않고')
  expect(read(`${WORKS}/sub-left.json`)).toMatchObject({ status: 'done', agentId: 'z', parentId: 'parent' })
  const again = await $.tool.call({ tool: TOOL, work_id: 'parent', title: '검색 기능 명세', steps })
  expect(again.result).not.toContain('닫지 않고')
})

test('업무 줄에 단계를 노드로 잇고, 펼치면 위에서 아래로 흐르는 그림과 걸린 시간을 보인다', async ($, on) => {
  world(on, {
    [`${WORKS}/flow.json`]: work('flow', {
      sessionId: 'a',
      title: '캐시 구조 조사',
      createdAt: NOW - 3 * HOUR,
      updatedAt: NOW - 10 * MINUTE,
      now: '문서 작성 중',
      steps: [
        { title: '조사', isDone: true, evidence: '원문', doneAt: NOW - 2 * HOUR },
        { title: '작성', isDone: false },
        { title: '보고', isDone: false },
      ],
    }),
    [`${SESSIONS}/1.json`]: { sessionId: 'a', name: 'shy-quokka', status: 'busy' },
  })
  await $.session.start(START)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^── ● 작업 중 1 ─+$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ 캐시 구조 조사' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '●━◉─○ 1/3 · 이 단계 2시간째 · 10분 전 · @shy-quokka' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '지금: 문서 작성 중' })).toBeDefined()

  await ui.press({ key: 'toggle-flow' })
  expect(await ui.find({ type: 'Text', text: '▾ 캐시 구조 조사' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● 조사 · 1시간 — 원문' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '┃' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '◉ 작성  ← 지금' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '│' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '○ 보고' })).toBeDefined()
  await ui.unmount()
})

test('보류 업무는 기다리는 이유를 보이고, 지금 할 일이 없으면 다음 단계를 보인다', async ($, on) => {
  world(on, {
    [`${WORKS}/wait.json`]: work('wait', { status: 'paused', waitingFor: '디자인 확정 뒤 구현', now: '명세 끝' }),
    [`${WORKS}/next.json`]: work('next', { status: 'paused', updatedAt: NOW - 2 * HOUR }),
  })
  await $.session.start(START)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: '기다림: 디자인 확정 뒤 구현' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '지금: 명세 끝' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '다음 단계: 둘' })).toBeDefined()
  await ui.unmount()
})

test('접어 둔 칸에서도 남은 일과 닫히지 않은 서브 기록은 보인다', async ($, on) => {
  world(on, {
    [`${WORKS}/left.json`]: work('left', { status: 'done', doneAt: NOW - 30 * HOUR, followups: [{ text: 'push' }, { text: '배포 확인' }] }),
    [`${WORKS}/sleepy.json`]: work('sleepy', { status: 'paused', updatedAt: NOW - 30 * HOUR, waitingFor: '디자인 확정' }),
    [`${WORKS}/parent.json`]: work('parent', { status: 'done', doneAt: NOW - HOUR }),
    [`${WORKS}/sub-paused.json`]: work('sub-paused', { parentId: 'parent', status: 'paused', now: '결과 파일 저장만 남음' }),
    [`${WORKS}/sub-ok.json`]: work('sub-ok', { parentId: 'parent', status: 'done', doneAt: NOW - HOUR }),
  })
  await $.session.start(START)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: '업무 3개 · □ 남은 일 1 · ✓ 오늘 완료 1 · ◌ 오래 멈춤 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '진행 중인 업무가 없어요.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ 업무 left · 1일 전' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '□ push · 기한 모름' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '□ 배포 확인' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ 업무 sleepy · 기한 모름 · 1/2 · 1일 전' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '기다림: 디자인 확정' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ 업무 parent · 서브 2 · 1시간 전' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└ ‖ 업무 sub-paused 1/2 · 보류로 끝남 · 결과 파일 저장만 남음' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /업무 sub-ok/ })).toBeUndefined()

  const text = (await ui.find({ type: 'Box' }))?.text ?? ''
  expect(text.indexOf('□ 남은 일 1 ─')).toBeLessThan(text.indexOf('✓ 오늘 완료 1 ─'))
  expect(text.indexOf('✓ 오늘 완료 1 ─')).toBeLessThan(text.indexOf('◌ 오래 멈춤 1 ─'))

  await ui.press({ key: 'toggle-parent' })
  expect(await ui.find({ type: 'Text', text: '└ ✓ 업무 sub-ok 1/2' })).toBeDefined()
  await ui.unmount()
})

describe('하루 요약', () => {
  test('/progress 요약 은 최근 24시간의 완료, 진행 중, 남은 일을 글로 낸다', async ($, on) => {
    world(on, {
      [`${WORKS}/fin.json`]: work('fin', { status: 'done', doneAt: NOW - 2 * HOUR }),
      [`${WORKS}/fin-sub.json`]: work('fin-sub', { parentId: 'fin', status: 'done', doneAt: NOW - 2 * HOUR }),
      [`${WORKS}/going.json`]: work('going', { now: '작성 중' }),
      [`${WORKS}/wait.json`]: work('wait', { status: 'paused', waitingFor: '디자인 확정' }),
      [`${WORKS}/left.json`]: work('left', { status: 'done', doneAt: NOW - 30 * HOUR, followups: [{ text: 'push' }] }),
      [`${WORKS}/stale.json`]: work('stale', { updatedAt: NOW - 30 * HOUR }),
    })
    await $.session.start(START)
    const out = await $.command.run({
      command: 'progress',
      args: '요약',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
    expect(out.text).toBe(
      [
        '업무 요약 · 최근 24시간',
        '완료 1\n- 업무 fin · 2단계 · 서브 1\n    ✓ 하나 — abc123',
        '진행 중 2\n- 업무 going · 1/2 · 기한 모름 · 지금: 작성 중\n- 업무 wait · 1/2 · 보류 · 기한 모름 · 기다림: 디자인 확정',
        '남은 일 1\n- 업무 left: push(기한 모름)',
      ].join('\n\n'),
    )
  })

  test('기록이 없으면 없다고 말한다', () => {
    expect(dailySummary([work('old', { updatedAt: NOW - 30 * HOUR })], NOW)).toBe('최근 24시간에 기록된 업무가 없어요.')
  })
})

test('단계가 많으면 선을 빼고 노드만, 그래도 모자라면 막대로 그린다', async ($, on) => {
  world(on, {
    [`${WORKS}/many.json`]: work('many', {
      sessionId: 'a',
      steps: Array.from({ length: 30 }, (_, index) => ({ title: `단계 ${index + 1}`, isDone: index < 15 })),
    }),
    [`${SESSIONS}/1.json`]: { sessionId: 'a', name: 'shy-quokka', status: 'busy' },
  })
  await $.session.start(START)
  const wide = await mountPane($, 80)
  expect(await wide.find({ type: 'Text', text: /^●{15}◉○{14} 15\/30 · 1시간 전 · @shy-quokka$/ })).toBeDefined()
  await wide.unmount()
  const tiny = await mountPane($, 30)
  expect(await tiny.find({ type: 'Text', text: '━━── 15/30 · 1시간 전' })).toBeDefined()
  await tiny.unmount()
})
