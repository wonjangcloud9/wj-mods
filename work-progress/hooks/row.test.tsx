import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { laterRow, reportRow } from './row'
import { TOOL } from './testkit'

const LATER = 'mcp__work-progress__later'
const INPUT = {
  work_id: 'login-polish',
  title: '로그인 화면 다듬기',
  status: 'active',
  steps: [
    { title: '정리', done: true },
    { title: '옮기기', done: false },
  ],
}

// 엔진이 원래 그리는 줄. 기록 도구가 아니거나 펼친 화면이면 이 줄이 보여야 한다.
function engineRows(on: On) {
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`엔진 줄 ${e.props.tool}`}</Text>
  })
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`엔진 결과 ${String(e.props.output)}`}</Text>
  })
}

function use(tool: string, input: unknown, patch: { isExpanded?: boolean; isErrored?: boolean; isRunning?: boolean } = {}) {
  return { tool_use_id: 't1', tool, input, isRunning: false, isErrored: false, isInterrupted: false, ...patch }
}

function result(tool: string, patch: { isExpanded?: boolean; isErrored?: boolean } = {}) {
  return { tool_use_id: 't1', tool, output: '기록함: 로그인 화면 다듬기 1/2 (active)', isErrored: false, ...patch }
}

describe('기록 줄 문구', () => {
  test('진행 기록은 완료한 단계 수와 제목을 한 줄로 쓴다', () => {
    expect(reportRow(INPUT)).toBe('진행도 기록 1/2 · 로그인 화면 다듬기')
    expect(reportRow({ ...INPUT, status: 'paused' })).toBe('진행도 기록 1/2 · 로그인 화면 다듬기 · 보류')
    expect(reportRow({ work_id: 'only-id' })).toBe('진행도 기록 0/0 · only-id')
  })

  test('나중에 할 일은 남기고 닫은 개수만 쓴다', () => {
    expect(laterRow({ add: [{ text: 'a' }, { text: 'b' }], done: ['later-1'] })).toBe('나중에 할 일 · 2개 남김, 1개 끝냄')
    expect(laterRow({ drop: ['later-2'] })).toBe('나중에 할 일 · 1개 안 하기로 함')
    expect(laterRow({})).toBe('나중에 할 일 · 바뀐 것 없음')
  })
})

test('기록 도구 호출은 한 줄로 그리고 결과 글은 숨긴다', async ($, on) => {
  engineRows(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolUse', props: use(TOOL, INPUT) })
    expect(await row.find({ type: 'Text', text: /진행도 기록 1\/2 · 로그인 화면 다듬기$/ })).toBeDefined()
    expect(await row.find({ type: 'Text', text: /엔진 줄/ })).toBeUndefined()

    const running = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolUse', props: use(TOOL, INPUT, { isRunning: true }) })
    expect(await running.find({ type: 'Text', text: /진행도 기록 1\/2/ })).toBeDefined()

    const later = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolUse', props: use(LATER, { done: ['later-1'] }) })
    expect(await later.find({ type: 'Text', text: /나중에 할 일 · 1개 끝냄$/ })).toBeDefined()

    const hidden = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolResult', props: result(TOOL) })
    expect(await hidden.find({ type: 'Text', text: /기록함/ })).toBeUndefined()
  }
})

test('펼친 화면과 실패한 결과, 다른 도구는 엔진 줄을 그대로 둔다', async ($, on) => {
  engineRows(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const open = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolUse', props: use(TOOL, INPUT, { isExpanded: true }) })
    expect(await open.find({ type: 'Text', text: `엔진 줄 ${TOOL}` })).toBeDefined()

    const other = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolUse', props: use('Grep', { pattern: 'x' }) })
    expect(await other.find({ type: 'Text', text: '엔진 줄 Grep' })).toBeDefined()

    const failed = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolResult', props: result(TOOL, { isErrored: true }) })
    expect(await failed.find({ type: 'Text', text: /엔진 결과 기록함/ })).toBeDefined()

    const full = await $.ui.mount({ plugin: 'work-progress', surface, component: 'ToolResult', props: result(TOOL, { isExpanded: true }) })
    expect(await full.find({ type: 'Text', text: /엔진 결과 기록함/ })).toBeDefined()
  }
})
