import { describe, expect, test } from 'claude-code/testing'

import { clarityAsk } from './clarity'
import { isEnglishAnswer } from './language'

const ENGLISH =
  'I updated the cache layer so stale entries are dropped before they reach the client. ' +
  'The retry test now covers the timeout path, and the remaining work is the settings page.'

const KOREAN =
  '`cache.ts` 에서 오래된 항목을 client 에 넘기기 전에 걸러 내도록 고쳤습니다. ' +
  'retry test 는 timeout 경로까지 확인하고, 남은 작업은 settings page 입니다.'

function submit(text: string) {
  return { text, wait: false, origin: { kind: 'composer' as const } }
}

function finish(answer: string, agentId?: string) {
  return { answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' as const, agentId }
}

describe('isEnglishAnswer', () => {
  test('기술 용어가 섞인 한글 답변은 통과한다', () => {
    expect(isEnglishAnswer(KOREAN)).toBe(false)
  })

  test('영어 답변을 잡는다', () => {
    expect(isEnglishAnswer(ENGLISH)).toBe(true)
  })

  test('코드 블록과 경로만 영어인 한글 답변은 통과한다', () => {
    const answer = `수정했습니다.\n\n\`\`\`ts\n${ENGLISH}\n\`\`\`\n\nsrc/app/(menu)/builder/_hooks/use-builder-execute/types.ts`
    expect(isEnglishAnswer(answer)).toBe(false)
  })

  test('짧은 영어 한 줄은 통과한다', () => {
    expect(isEnglishAnswer('Done. All tests passed.')).toBe(false)
  })
})

test('영어 답변 아래에 경고를 붙이고 다음 프롬프트에 한 번만 교정 지시를 넣는다', async ($, on) => {
  let context: readonly string[] = []
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })

  const done = await $.turn.complete(finish(ENGLISH))
  expect(done.text).toContain('영어로 쓰였습니다')

  await $.prompt.submit(submit('다음 작업 진행해줘'))
  expect(context.some(c => c.includes('한글로 쓰고'))).toBe(true)

  await $.prompt.submit(submit('그다음도'))
  expect(context).toEqual([])
})

test('한글 답변이면 답변과 다음 프롬프트를 그대로 둔다', async ($, on) => {
  let context: readonly string[] = []
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })

  const done = await $.turn.complete(finish(KOREAN))
  expect(done.text).toBe(KOREAN)

  await $.prompt.submit(submit('다음'))
  expect(context).toEqual([])
})

test('subagent 턴은 검사하지 않는다', async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))

  const done = await $.turn.complete(finish(ENGLISH, 'agent-1'))
  expect(done.text).toBe(ENGLISH)
})

describe('clarityAsk', () => {
  test('이해하지 못했다는 말을 잡는다', () => {
    expect(clarityAsk('롤백 순서가 뭔말이야.. 하나도 안그려지는데')).toBe('confused')
    expect(clarityAsk('이해가 안되는데 뭐 어쩌란거냐 둘 중에 뭘 고르라는거임')).toBe('confused')
    expect(clarityAsk('배포 먼저 하고 마이그레이션은 계속 뭔말이지..')).toBe('confused')
  })

  test('짧게 해 달라는 말을 잡는다', () => {
    expect(clarityAsk('결론만 더 짧게 말해줘')).toBe('shorter')
    expect(clarityAsk('요약본으로 다시 줘')).toBe('shorter')
    expect(clarityAsk('요약해줘 캐시가 비워지면 다시 채우는 데 몇 분 걸리는거야?')).toBe('shorter')
  })

  test('일반 작업 지시와 긴 프롬프트는 건드리지 않는다', () => {
    expect(clarityAsk('빌드 실패 원인 찾아줘')).toBeUndefined()
    expect(clarityAsk('주간 요약 메일 기능부터 봐줘')).toBeUndefined()
    expect(clarityAsk(`${'긴 로그를 붙여넣으면 오류만 골라 주는 도구 '.repeat(15)}짧게 만들어줘`)).toBeUndefined()
  })
})

test('이해 못 했다는 프롬프트에는 쉽게 다시 설명하라는 지시를 붙인다', async ($, on) => {
  let context: readonly string[] = []
  on('prompt.submit', (_, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })

  await $.prompt.submit(submit('뭔 말인지 하나도 모르겠어'))
  expect(context.some(c => c.includes('이해하지 못했다'))).toBe(true)

  await $.prompt.submit(submit('다음 작업 진행해줘'))
  expect(context).toEqual([])
})
