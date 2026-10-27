import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { describeCall, guideText, toBoard, toReport } from './model'
import { COMPOSE, HOUR, LIVE, ME, NOW, SESSIONS, START, TOOL, WORKS, agent, live, work, world } from './testkit'
import { divider, fit, widthOf } from './view'

function mountBand($: Engine, surface: 'terminal' | 'desktop') {
  return $.ui.mount({
    plugin: 'work-progress',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} },
  })
}

describe('기록', () => {
  const by = { sessionId: ME, sessionName: 'crispy-mandu', at: NOW }

  test('처음 기록하면 시작 시각과 세션을 남기고, 근거 없는 완료 단계를 알려 준다', () => {
    const report = toReport(
      { work_id: 'Model Select', title: '모델 선택 구현', steps: [{ title: 'a', done: true }, { title: 'b', done: false }] },
      null,
      by,
    )
    if ('error' in report) throw new Error(report.error)
    expect(report.work).toMatchObject({ id: 'model-select', status: 'active', sessionName: 'crispy-mandu', createdAt: NOW })
    expect(report.notes[0]).toBe('근거 없이 완료로 표시한 단계: a')
    expect(report.notes[1]).toContain('이 업무의 기한을 몰라요.')
  })

  test('이어 쓰면 처음 시각을 지키고, 끝낸 시각은 처음 끝냈을 때만 정한다', () => {
    const previous = work('w', { status: 'done', doneAt: NOW - 2 * HOUR })
    const report = toReport({ work_id: 'w', title: 't', steps: [{ title: 'a', done: true, evidence: 'ok' }], status: 'done' }, previous, by)
    if ('error' in report) throw new Error(report.error)
    expect(report.work.createdAt).toBe(previous.createdAt)
    expect(report.work.doneAt).toBe(NOW - 2 * HOUR)
  })

  test('단계 목록이나 id 가 없으면 거절한다', () => {
    expect(toReport({ work_id: 'w', title: 't', steps: [] }, null, by)).toHaveProperty('error')
    expect(toReport({ work_id: '한글', title: 't', steps: [{ title: 'a', done: false }] }, null, by)).toHaveProperty('error')
  })
})

describe('진행판', () => {
  test('세션 상태로 작업 중, 내 차례, 멈춤을 나누고 내 차례를 맨 위에 둔다', () => {
    const board = toBoard(
      [
        work('busy', { sessionId: 'a' }),
        work('idle', { sessionId: 'b' }),
        work('gone', { sessionId: 'c' }),
        work('older', { sessionId: 'b', updatedAt: NOW - 3 * HOUR }),
      ],
      [live('a', 'a', true), live('b', 'b', false), live('d', 'd', true)],
      NOW,
    )
    expect(board.rows.map(row => [row.work.id, row.phase])).toEqual([
      ['idle', 'yourTurn'],
      ['busy', 'running'],
      ['gone', 'stalled'],
      ['older', 'stalled'],
    ])
    expect(board.untracked.map(s => s.sessionId)).toEqual(['d'])
  })

  // NOW 는 서울 시각으로 2026-10-16(금) 12:00 이다.
  test('오늘 오전 9시 전에 끝낸 완료 업무와 보관한 업무는 숨긴다', () => {
    const board = toBoard(
      [
        work('today', { status: 'done', doneAt: NOW - 2 * HOUR }),
        work('before-nine', { status: 'done', doneAt: NOW - 4 * HOUR }),
        work('kept', { status: 'archived' }),
      ],
      [],
      NOW,
      new Map(),
      540,
    )
    expect(board.rows.map(row => [row.work.id, row.phase])).toEqual([['today', 'done']])
  })

  test('오전 9시 전에는 전날 오전 9시 뒤에 끝낸 업무를 오늘 완료로 본다', () => {
    const early = NOW - 4 * HOUR
    const board = toBoard(
      [
        work('last-night', { status: 'done', doneAt: early - 2 * HOUR }),
        work('yesterday-morning', { status: 'done', doneAt: early - 22 * HOUR }),
        work('day-before', { status: 'done', doneAt: early - 24 * HOUR }),
      ],
      [],
      early,
      new Map(),
      540,
    )
    expect(board.rows.map(row => row.work.id)).toEqual(['last-night', 'yesterday-morning'])
  })

  test('서브에이전트 기록은 부모 업무 아래 붙고, 서브에이전트가 도는 동안 부모는 작업 중이다', () => {
    const board = toBoard(
      [
        work('parent', { sessionId: 'a', updatedAt: NOW - 2 * HOUR }),
        work('sub-x', { sessionId: 'a', agentId: 'x', title: '문서 조사' }),
        work('sub-ended', { sessionId: 'a', agentId: 'z', updatedAt: NOW - 10 * 60_000 }),
      ],
      [live('a', 'a', false)],
      NOW,
      new Map([['a', { agents: [agent('x', '벤치마크'), agent('y', '코드 현황')] }]]),
    )
    expect(board.rows.map(row => [row.work.id, row.phase])).toEqual([['parent', 'running']])
    expect(board.rows[0]?.children).toEqual([
      { id: 'x', title: '문서 조사', done: 1, total: 2 },
      { id: 'y', title: '코드 현황' },
    ])
  })

  test('끝난 서브에이전트 기록은 따로 줄을 만들지 않고 부모 업무 아래에 묶인다', () => {
    const board = toBoard(
      [
        work('parent', { sessionId: 'a' }),
        work('sub-old', { sessionId: 'a', parentId: 'parent', status: 'done', doneAt: NOW - HOUR, createdAt: NOW - 3 * HOUR }),
        work('sub-done', { sessionId: 'a', agentId: 'z', parentId: 'parent', status: 'done', doneAt: NOW - HOUR, createdAt: NOW - 2 * HOUR }),
        work('sub-now', { sessionId: 'a', agentId: 'x', parentId: 'parent', title: '도는 중' }),
      ],
      [live('a', 'a', true)],
      NOW,
      new Map([['a', { agents: [agent('x', '조사')] }]]),
    )
    expect(board.rows.map(row => row.work.id)).toEqual(['parent'])
    expect(board.rows[0]?.children.map(child => child.title)).toEqual(['도는 중'])
    expect(board.rows[0]?.finished.map(child => child.id)).toEqual(['sub-old', 'sub-done'])
  })

  test('진행 중인 업무가 없으면 가장 최근에 보류한 업무에 서브에이전트를 붙인다', () => {
    const board = toBoard(
      [
        work('older', { sessionId: 'a', status: 'paused', updatedAt: NOW - 3 * HOUR }),
        work('recent', { sessionId: 'a', status: 'paused' }),
        work('finished', { sessionId: 'a', status: 'done', doneAt: NOW - 10 * 60_000, updatedAt: NOW - 10 * 60_000 }),
      ],
      [live('a', 'a', true)],
      NOW,
      new Map([['a', { agents: [agent('x', '도메인 조사')] }]]),
    )
    expect(board.rows.map(row => [row.work.id, row.phase, row.children.length])).toEqual([
      ['recent', 'running', 1],
      ['older', 'paused', 0],
      ['finished', 'done', 0],
    ])
  })

  test('부모 업무가 없으면 도는 서브에이전트의 기록만 따로 보이고, 끝난 세션의 서브에이전트는 믿지 않는다', () => {
    const works = [
      work('sub-x', { sessionId: 'a', agentId: 'x' }),
      work('sub-z', { sessionId: 'a', agentId: 'z' }),
      work('gone', { sessionId: 'b' }),
    ]
    const agents = new Map([
      ['a', { agents: [agent('x', '조사')] }],
      ['b', { agents: [agent('q', '남은 목록')] }],
    ])
    const board = toBoard(works, [live('a', 'a', true)], NOW, agents)
    expect(board.rows.map(row => [row.work.id, row.phase, row.children.length])).toEqual([
      ['sub-x', 'running', 0],
      ['gone', 'stalled', 0],
    ])
  })

  test('시스템 안내에는 끝나지 않은 업무만 id 와 함께 넣는다', () => {
    const board = toBoard([work('e2e18', { sessionId: 'a' }), work('fin', { status: 'done', doneAt: NOW })], [live('a', 'a', true)], NOW)
    const text = guideText(board)
    expect(text).toContain('- e2e18 · 업무 e2e18 · 1/2 단계 · 기한 모름 · @shy-quokka · 1시간 전')
    expect(text).not.toContain('fin')
    expect(guideText(null)).toContain('진행 중인 업무: 없음')
  })
})

test('도구로 기록하면 업무 파일이 생기고 입력창 위 한 줄에 반영된다', async ($, on) => {
  const { read } = world(on, { [`${SESSIONS}/1.json`]: { sessionId: ME, name: 'crispy-mandu', status: 'busy' } })
  await $.session.start(START)

  const ran = await $.tool.call({
    tool: TOOL,
    work_id: 'e2e18',
    title: 'E2E 18개',
    steps: [
      { title: '#01', done: true, evidence: '통과' },
      { title: '#02', done: false },
    ],
    now: '#02 확인 중',
  })
  expect(ran.result).toContain('기록함: E2E 18개 1/2 (active)\n이 업무의 기한을 몰라요.')
  expect(read(`${WORKS}/e2e18.json`)).toMatchObject({ sessionName: 'crispy-mandu', now: '#02 확인 중' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface)
    expect(await ui.find({ type: 'Text', text: /업무 1개/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /작업 중 1/ })).toBeDefined()
    await ui.unmount()
  }
})

test('서브에이전트의 기록은 부모 업무 아래 한 줄로 보이고, 도는 서브에이전트 목록을 파일로 알린다', async ($, on) => {
  const { read, raw } = world(
    on,
    {
      [`${WORKS}/parent.json`]: work('parent', { sessionId: ME, title: '테마 빌더 명세' }),
      [`${SESSIONS}/1.json`]: { sessionId: ME, name: 'turbo-dalgona', status: 'idle' },
    },
    [
      { id: 'x', description: 'AI 빌더 벤치마크', status: 'running' },
      { id: 'y', description: '코드 현황 조사', status: 'running' },
      { id: 'done', description: '끝난 조사', status: 'completed' },
    ],
  )
  await $.session.start(START)
  expect(raw(`${LIVE}/${ME}.json`)).toEqual({
    sessionId: ME,
    agents: [
      { id: 'x', description: 'AI 빌더 벤치마크' },
      { id: 'y', description: '코드 현황 조사' },
    ],
  })

  await $.tool.call({
    tool: TOOL,
    agentId: 'x',
    work_id: 'bench-ai',
    title: 'Lovable 공식 문서 조사',
    steps: [
      { title: 'a', done: true, evidence: '원문' },
      { title: 'b', done: false },
    ],
  })
  expect(read(`${WORKS}/bench-ai.json`)).toMatchObject({ agentId: 'x', parentId: 'parent' })

  const ui = await $.ui.mount({
    plugin: 'work-progress',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'work-progress',
    props: { title: '업무 진행도', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: '업무 1개 · ● 작업 중 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└ ● Lovable 공식 문서 조사 1/2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└ ● 코드 현황 조사' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /끝난 조사/ })).toBeUndefined()
  await ui.unmount()
})

test('도구를 쓰면 최근 활동이 파일로 알려지고 업무 줄과 서브에이전트 줄에 보인다', async ($, on) => {
  const { raw } = world(
    on,
    {
      [`${WORKS}/parent.json`]: work('parent', { sessionId: ME, title: '테마 빌더 명세' }),
      [`${SESSIONS}/1.json`]: { sessionId: ME, name: 'turbo-dalgona', status: 'busy' },
    },
    [{ id: 'x', description: '코드 현황 조사', status: 'running' }],
  )
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok' }))
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ok' }))
  await $.session.start(START)

  await $.tool.call({ tool: 'Bash', command: 'curl -H "Authorization: Bearer secret"', description: '빌드 끝날 때까지 대기' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/hooks/view.tsx', agentId: 'x' })
  await $.tool.call({ tool: TOOL, work_id: 'parent', title: '테마 빌더 명세', steps: [{ title: 'a', done: false }] })

  expect(raw(`${LIVE}/${ME}.json`)).toEqual({
    sessionId: ME,
    activity: { text: 'Bash 빌드 끝날 때까지 대기', at: NOW },
    agents: [{ id: 'x', description: '코드 현황 조사', activity: { text: 'Read view.tsx', at: NOW } }],
  })
  const ui = await $.ui.mount({
    plugin: 'work-progress',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'work-progress',
    props: { title: '업무 진행도', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: '최근: Bash 빌드 끝날 때까지 대기 · 방금' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└ ● 코드 현황 조사 · 최근: Read view.tsx' })).toBeDefined()
  await ui.unmount()
})

test('잘못된 기록은 저장하지 않고 이유를 돌려준다', async ($, on) => {
  const { read } = world(on)
  await $.session.start(START)
  const ran = await $.tool.call({ tool: TOOL, work_id: 'x', title: 't', steps: [] })
  expect(ran.deny).toContain('steps')
  expect(read(`${WORKS}/x.json`)).toBeNull()
})

test('시스템 안내는 세션 시작 때 만든 그대로 유지한다', async ($, on) => {
  world(on, { [`${WORKS}/w.json`]: work('w') })
  await $.session.start(START)
  const first = await $.prompt.compose(COMPOSE)
  const guide = first.sections.find(section => section.id === 'work-progress:guide')
  expect(guide?.text).toContain('- w · 업무 w')

  await $.tool.call({ tool: TOOL, work_id: 'new-one', title: '새 업무', steps: [{ title: 'a', done: false }] })
  const second = await $.prompt.compose(COMPOSE)
  expect(second.sections.find(section => section.id === 'work-progress:guide')?.text).toBe(guide?.text)
})

test('패널에서 업무를 누르면 단계가 펼쳐지고, 보관하면 목록에서 빠진다', async ($, on) => {
  const { read } = world(on, {
    [`${WORKS}/w.json`]: work('w', { sessionId: 'a', question: '범위를 줄일까요?' }),
    [`${SESSIONS}/1.json`]: { sessionId: 'a', name: 'shy-quokka', status: 'idle' },
  })
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'work-progress',
      surface,
      component: 'Pane',
      requestId: 'work-progress',
      props: { title: '업무 진행도', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: /◆ 내 차례/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '질문: 범위를 줄일까요?' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /abc123/ })).toBeUndefined()

    await ui.press({ key: 'toggle-w' })
    expect(await ui.find({ type: 'Text', text: /abc123/ })).toBeDefined()
    if (surface === 'desktop') {
      await ui.press({ key: 'archive-w' })
      expect(read(`${WORKS}/w.json`)?.status).toBe('archived')
      expect(await ui.find({ type: 'Text', text: /◆ 내 차례/ })).toBeUndefined()
    } else {
      await ui.press({ key: 'toggle-w' })
    }
    await ui.unmount()
  }
})

test('완료 업무는 구분선 아래 맨 끝에 모은다', async ($, on) => {
  world(on, {
    [`${WORKS}/a.json`]: work('a', { sessionId: 'a', title: '끝난 일', status: 'done', doneAt: NOW - HOUR, updatedAt: NOW - HOUR }),
    [`${WORKS}/b.json`]: work('b', { sessionId: 'b', title: '하는 일', updatedAt: NOW - 2 * HOUR }),
    [`${SESSIONS}/1.json`]: { sessionId: 'b', name: 'smug-capybara', status: 'busy' },
  })
  await $.session.start(START)
  const ui = await $.ui.mount({
    plugin: 'work-progress',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'work-progress',
    props: { title: '업무 진행도', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  const frame = await ui.find({ type: 'Box' })
  const text = frame?.text ?? ''
  expect(await ui.find({ type: 'Text', text: divider('✓ 오늘 완료 1', 40) })).toBeDefined()
  expect(text.indexOf('하는 일')).toBeLessThan(text.indexOf('오늘 완료 1 ─'))
  expect(text.indexOf('오늘 완료 1 ─')).toBeLessThan(text.indexOf('끝난 일'))
  await ui.unmount()
})

test('완료 업무는 제목 한 줄로 접혀 있다가, 누른 업무만 단계까지 펼쳐진다', async ($, on) => {
  world(on, {
    [`${WORKS}/a.json`]: work('a', { title: '끝난 일', status: 'done', doneAt: NOW - HOUR, updatedAt: NOW - HOUR }),
    [`${WORKS}/b.json`]: work('b', { title: '또 끝난 일', status: 'done', doneAt: NOW - 2 * HOUR, updatedAt: NOW - 2 * HOUR }),
  })
  await $.session.start(START)
  const ui = await $.ui.mount({
    plugin: 'work-progress',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'work-progress',
    props: { title: '업무 진행도', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: '▸ 끝난 일 · 1시간 전' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ 또 끝난 일 · 2시간 전' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\/2/ })).toBeUndefined()

  await ui.press({ key: 'toggle-a' })
  expect(await ui.find({ type: 'Text', text: /abc123/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^●─○ 1\/2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▸ 또 끝난 일 · 2시간 전' })).toBeDefined()

  await ui.press({ key: 'toggle-a' })
  expect(await ui.find({ type: 'Text', text: /abc123/ })).toBeUndefined()
  await ui.unmount()
})

test('끝난 서브에이전트는 한 줄로 묶였다가 부모 업무를 펼치면 하나씩 보인다', async ($, on) => {
  world(on, {
    [`${WORKS}/parent.json`]: work('parent', { title: '테마 빌더 명세', status: 'done', doneAt: NOW - HOUR }),
    [`${WORKS}/s1.json`]: work('s1', { title: 'AI 빌더 조사', parentId: 'parent', status: 'done', doneAt: NOW - 2 * HOUR }),
    [`${WORKS}/s2.json`]: work('s2', { title: '로우코드 조사', parentId: 'parent', status: 'done', doneAt: NOW - 2 * HOUR }),
  })
  await $.session.start(START)
  const ui = await $.ui.mount({
    plugin: 'work-progress',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'work-progress',
    props: { title: '업무 진행도', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: '▸ 테마 빌더 명세 · 서브 2 · 1시간 전' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /AI 빌더 조사/ })).toBeUndefined()

  await ui.press({ key: 'toggle-parent' })
  expect(await ui.find({ type: 'Text', text: '└ ✓ AI 빌더 조사 1/2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└ ✓ 로우코드 조사 1/2' })).toBeDefined()
  await ui.unmount()
})

describe('최근 활동', () => {
  test('도구 호출을 한 줄로 줄이고, 명령 본문과 진행 기록 도구는 남기지 않는다', () => {
    expect(describeCall({ tool: 'Bash', command: 'pytest -k x', description: '테스트 실행' })).toBe('Bash 테스트 실행')
    expect(describeCall({ tool: 'Bash', command: 'curl -H "Authorization: Bearer secret" x' })).toBe('Bash curl')
    expect(describeCall({ tool: 'Edit', file_path: '/a/b/model.ts' })).toBe('Edit model.ts')
    expect(describeCall({ tool: 'mcp__claude-in-chrome__computer', action: 'click' })).toBe('claude-in-chrome computer')
    expect(describeCall({ tool: TOOL, work_id: 'w' })).toBeUndefined()
  })
})

describe('좁은 화면', () => {
  test('한글은 두 칸으로 세고 넘치면 말줄임표로 자른다', () => {
    expect(widthOf('업무 a')).toBe(6)
    expect(fit('세션 간 업무 진행도', 10)).toBe('세션 간 …')
    expect(fit('짧음', 10)).toBe('짧음')
  })

  test('폭이 줄면 부가 정보부터 빼고 한 줄을 유지한다', async ($, on) => {
    world(on, {
      [`${WORKS}/w.json`]: work('w', { sessionId: 'a', title: '아주 긴 업무 제목이 패널 폭을 넘어가는 경우' }),
      [`${SESSIONS}/1.json`]: { sessionId: 'a', name: 'quiet-otter', status: 'busy' },
      [`${SESSIONS}/2.json`]: { sessionId: 'b', name: 'smug-capybara', status: 'busy' },
    })
    await $.session.start(START)
    const pane = (bodyColumns: number) =>
      $.ui.mount({
        plugin: 'work-progress',
        surface: 'terminal',
        component: 'Pane',
        requestId: 'work-progress',
        props: { title: '업무 진행도', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
      })

    const wide = await pane(100)
    expect(await wide.find({ type: 'Text', text: '업무 1개 · ● 작업 중 1 · 기록 없는 세션 1' })).toBeDefined()
    expect(await wide.find({ type: 'Text', text: '●━◉ 1/2 · 1시간 전 · @shy-quokka' })).toBeDefined()
    await wide.unmount()

    const narrow = await pane(44)
    expect(await narrow.find({ type: 'Text', text: '업무 1 · ● 작업 중 1' })).toBeDefined()
    expect(await narrow.find({ type: 'Text', text: /단계 목록/ })).toBeUndefined()
    expect(await narrow.find({ type: 'Text', text: /…$/ })).toBeDefined()
    await narrow.unmount()

    const tiny = await pane(30)
    expect(await tiny.find({ type: 'Text', text: '업무 1 · ●1' })).toBeDefined()
    expect(await tiny.find({ type: 'Text', text: '●━◉ 1/2 · 1시간 전' })).toBeDefined()
    expect(await tiny.find({ type: 'Text', text: /기록 없는 세션/ })).toBeUndefined()
    await tiny.unmount()
  })
})
