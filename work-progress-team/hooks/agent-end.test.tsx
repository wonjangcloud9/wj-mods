import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NOW, START, WORKS, work, world } from './testkit'

function setup(on: On, seed: Record<string, unknown>) {
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return world(on, seed)
}

function end($: Engine, reason: 'answer' | 'aborted' | 'error', agentId: string | undefined = 'agent-1') {
  const answer = '## web 정리 끝\n7개 파일을 지웠어요.'
  return $.turn.complete({ answer, durationMs: 1000, isAborted: reason === 'aborted', turnId: 't1', reason, ...(agentId ? { agentId } : {}) })
}

const sub = (id: string, patch = {}) => work(id, { agentId: 'agent-1', parentId: 'parent', ...patch })

describe('서브에이전트가 기록을 닫지 않고 끝날 때', () => {
  test('답하고 끝나면 완료로 닫고 보고 첫 줄과 자동 닫음 표시를 남긴다', async ($, on) => {
    const files = setup(on, { [`${WORKS}/web.json`]: sub('web') })
    await $.session.start(START)
    await end($, 'answer')
    expect(files.read(`${WORKS}/web.json`)).toMatchObject({
      status: 'done',
      doneAt: NOW,
      endedBy: 'agent-end',
      now: '끝난 보고: web 정리 끝',
    })
  })

  test('중단되거나 오류로 끝나면 보류로 두고 이유를 적는다', async ($, on) => {
    const files = setup(on, { [`${WORKS}/web.json`]: sub('web') })
    await $.session.start(START)
    await end($, 'aborted')
    expect(files.read(`${WORKS}/web.json`)).toMatchObject({ status: 'paused', waitingFor: '서브에이전트가 중단됨' })
  })

  test('이미 닫은 기록, 질문이 남은 기록, 다른 에이전트와 메인 대화의 기록은 건드리지 않는다', async ($, on) => {
    const seed = {
      [`${WORKS}/closed.json`]: sub('closed', { status: 'done', doneAt: NOW - 1 }),
      [`${WORKS}/ask.json`]: sub('ask', { question: '지워도 될까요?' }),
      [`${WORKS}/other.json`]: sub('other', { agentId: 'agent-2' }),
      [`${WORKS}/main.json`]: work('main'),
    }
    const files = setup(on, seed)
    await $.session.start(START)
    await end($, 'answer')
    await end($, 'answer', undefined)
    expect(files.read(`${WORKS}/closed.json`)?.doneAt).toBe(NOW - 1)
    expect(files.read(`${WORKS}/ask.json`)?.status).toBe('active')
    expect(files.read(`${WORKS}/other.json`)?.status).toBe('active')
    expect(files.read(`${WORKS}/main.json`)?.status).toBe('active')
  })
})
