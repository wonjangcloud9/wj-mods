import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PREFIX, isReportLike, summaryLine, summaryPrompt } from './summary'

const REPORT = `1·2번은 코드·테스트까지 끝냈습니다.\n\n## 1번 — 합류 단계 지목\n\n${'- `retarget_end_modify` 가 첫 갈래로 옮깁니다.\n'.repeat(20)}`
const SHORT = '네, 커밋했습니다. push 는 하지 않았습니다.'

function finish(answer: string, agentId?: string) {
  return { answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' as const, agentId }
}

function world(on: On, reply = '합류 단계를 고르면 이제 갈래 전체가 바뀝니다. 따로 할 일은 없습니다.') {
  const asked: string[] = []
  const logs: string[] = []
  const clock = mock.clock(on, { now: 0 })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true, text: reply, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return { asked, logs, clock }
}

describe('summary', () => {
  test('제목·표가 있거나 긴 답변만 보고서로 본다', () => {
    expect(isReportLike(REPORT)).toBe(true)
    expect(isReportLike(`${'설명 문장입니다. '.repeat(70)}\n\n| a | b |\n|---|---|\n| 1 | 2 |`)).toBe(true)
    expect(isReportLike(SHORT)).toBe(false)
    expect(isReportLike('## 제목\n짧음')).toBe(false)
  })

  test('요약 문장을 한 줄로 만들고 빈 답은 버린다', () => {
    expect(summaryLine('  첫 문장.\n두 번째 문장.  ')).toBe(`${PREFIX}첫 문장. 두 번째 문장.`)
    expect(summaryLine('  \n ')).toBeUndefined()
  })

  test('아주 긴 답변은 앞부분만 보낸다', () => {
    expect(summaryPrompt('가'.repeat(20_000)).length).toBeLessThan(12_200)
  })
})

test('보고서형 답변이 끝나면 쉬운 요약 한 줄을 남긴다', async ($, on) => {
  const { asked, logs, clock } = world(on)

  const done = await $.turn.complete(finish(REPORT))
  expect(done.text).toBe(REPORT)

  await clock.advance(1)
  await clock.settle()
  expect(asked).toHaveLength(1)
  expect(logs).toEqual([`${PREFIX}합류 단계를 고르면 이제 갈래 전체가 바뀝니다. 따로 할 일은 없습니다.`])
})

test('짧은 답변과 subagent 답변은 요약하지 않는다', async ($, on) => {
  const { asked, logs, clock } = world(on)

  await $.turn.complete(finish(SHORT))
  await $.turn.complete(finish(REPORT, 'agent-1'))
  await clock.advance(1)
  await clock.settle()

  expect(asked).toEqual([])
  expect(logs).toEqual([])
})
