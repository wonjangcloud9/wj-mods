import { describe, expect, test } from 'claude-code/testing'

import { LATER_TOOL_DESCRIPTION } from './later'
import { guideText, toReport } from './model'
import { isSimilarTitle, similarOpenWorks } from './similar'
import { HOUR, ME, NOW, SESSIONS, START, TOOL, WORKS, work, world } from './testkit'

const by = { sessionId: ME, sessionName: 'crispy-mandu', at: NOW }
const allDone = [
  { title: '구현', done: true, evidence: 'abc123' },
  { title: '테스트', done: true, evidence: '12 통과' },
]

function report(input: Record<string, unknown>, previous: Parameters<typeof toReport>[1] = null) {
  const result = toReport({ work_id: 'w', title: '검색 속도 개선', ...input }, previous, by)
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('단계를 다 끝낸 기록', () => {
  test('상태를 보내지 않거나 active 로 보내도 완료로 닫고, 닫았다고 알려 준다', () => {
    for (const status of [undefined, 'active']) {
      const { work: closed, notes } = report({ steps: allDone, ...(status ? { status } : {}) })
      expect(closed).toMatchObject({ status: 'done', doneAt: NOW })
      expect(notes).toEqual([expect.stringContaining('완료로 닫았어요')])
    }
  })

  test('사용자 답이나 조건을 기다리면 닫지 않는다', () => {
    expect(report({ steps: allDone, question: '배포해도 될까요?' }).work.status).toBe('active')
    expect(report({ steps: allDone, waiting_for: '디자인 확정' }).work.status).toBe('active')
  })

  test('보류로 보낸 기록은 보류로 둔다', () => {
    const { work: paused, notes } = report({ steps: allDone, status: 'paused' })
    expect(paused.status).toBe('paused')
    expect(notes).toEqual([])
  })

  test('끝나지 않은 단계가 있으면 진행 중으로 두고, 직접 완료로 보낸 기록에는 알림을 붙이지 않는다', () => {
    const open = [...allDone, { title: '배포', done: false }]
    expect(report({ steps: open })).toMatchObject({ work: { status: 'active' }, notes: [] })
    expect(report({ steps: open, status: 'done' })).toMatchObject({ work: { status: 'done' }, notes: [] })
  })

  test('닫힌 뒤 끝나지 않은 단계를 넣어 다시 기록하면 진행 중으로 돌아간다', () => {
    const closed = report({ steps: allDone }).work
    const reopened = report({ steps: [...allDone, { title: '배포', done: false }] }, closed).work
    expect(reopened.status).toBe('active')
    expect(reopened.doneAt).toBeUndefined()
  })

  test('이미 닫힌 업무를 같은 단계로 다시 기록해도 처음 끝낸 시각을 지킨다', () => {
    const closed = { ...report({ steps: allDone }).work, doneAt: NOW - 2 * HOUR }
    expect(report({ steps: allDone }, closed).work.doneAt).toBe(NOW - 2 * HOUR)
  })
})

describe('비슷한 제목', () => {
  test('낱말이 두 개 이상, 절반 이상 겹치면 비슷하다고 본다', () => {
    expect(isSimilarTitle('검색 속도 개선', '검색 속도 개선')).toBe(true)
    expect(isSimilarTitle('주간 점검 (10-12, 로그 확인·정리)', '주간 점검 (10-19, 로그 확인·정리)')).toBe(true)
    expect(isSimilarTitle('TICKET-12 결제 오류 재현', 'TICKET-12 결제 오류 수정')).toBe(true)
    expect(isSimilarTitle('검색 속도 개선', '로그인 화면 속도 측정')).toBe(false)
    expect(isSimilarTitle('검색 속도 개선', '알림 설정 구현')).toBe(false)
  })

  test('같은 레포에서 열려 있는 메인 대화의 업무만 고른다', () => {
    const title = '검색 속도 개선'
    const works = [
      work('open', { title, repo: '/repo/a' }),
      work('paused', { title, repo: '/repo/a', status: 'paused' }),
      work('no-repo', { title }),
      work('done', { title, repo: '/repo/a', status: 'done' }),
      work('archived', { title, repo: '/repo/a', status: 'archived' }),
      work('other-repo', { title, repo: '/repo/b' }),
      work('sub', { title, repo: '/repo/a', agentId: 'x' }),
    ]
    expect(similarOpenWorks(title, '/repo/a', works).map(item => item.id)).toEqual(['open', 'paused', 'no-repo'])
  })
})

describe('새 업무를 처음 기록할 때', () => {
  const steps = [{ title: '원인 찾기', done: false }]
  const seed = {
    [`${WORKS}/old.json`]: work('old', { title: '검색 속도 개선 1차' }),
    [`${SESSIONS}/1.json`]: { sessionId: ME, name: 'crispy-mandu', status: 'busy' },
  }

  test('비슷한 진행 중 업무가 있으면 한 번 거절하며 그 목록을 주고, 같은 내용을 다시 보내면 받는다', async ($, on) => {
    const { read } = world(on, seed)
    await $.session.start(START)
    const send = () => $.tool.call({ tool: TOOL, work_id: 'new', title: '검색 속도 개선 2차', steps })

    const first = await send()
    expect(first.deny).toContain('- old · 검색 속도 개선 1차 · 1/2 단계 · @shy-quokka')
    expect(read(`${WORKS}/new.json`)).toBeNull()

    const second = await send()
    expect(second.result).toContain('기록함: 검색 속도 개선 2차 0/1 (active)')
    expect(read(`${WORKS}/new.json`)).toMatchObject({ title: '검색 속도 개선 2차' })
  })

  test('그 work_id 로 이어 쓰면 거절하지 않는다', async ($, on) => {
    const { read } = world(on, seed)
    await $.session.start(START)
    const ran = await $.tool.call({ tool: TOOL, work_id: 'old', title: '검색 속도 개선 1차', steps })
    expect(ran.deny).toBeUndefined()
    expect(read(`${WORKS}/old.json`)).toMatchObject({ sessionId: ME })
  })

  test('비슷한 업무가 없거나 이미 끝난 업무뿐이면 바로 받는다', async ($, on) => {
    const { read } = world(on, { [`${WORKS}/old.json`]: work('old', { title: '검색 속도 개선 1차', status: 'done' }) })
    await $.session.start(START)
    const ran = await $.tool.call({ tool: TOOL, work_id: 'new', title: '검색 속도 개선 2차', steps })
    expect(ran.deny).toBeUndefined()
    expect(read(`${WORKS}/new.json`)).not.toBeNull()
  })

  test('서브에이전트의 기록은 견주지 않는다', async ($, on) => {
    const { read } = world(on, seed, [{ id: 'x', description: '검색 속도 조사', status: 'running' }])
    await $.session.start(START)
    const ran = await $.tool.call({ tool: TOOL, agentId: 'x', work_id: 'sub', title: '검색 속도 개선 조사', steps })
    expect(ran.deny).toBeUndefined()
    expect(read(`${WORKS}/sub.json`)).toMatchObject({ agentId: 'x' })
  })
})

describe('남기는 기준', () => {
  const guide = guideText(null)

  test('나중에 할 일과 남은 일은 사용자가 직접 말한 일만 남기라고 안내한다', () => {
    expect(guide).toContain('add 에는 사용자가 나중에 하자고 직접 말한 일만 남긴다')
    expect(guide).toContain('followups 에는 사용자가 남겨 두라고 직접 말한 일만 적는다')
    expect(LATER_TOOL_DESCRIPTION).toContain('사용자가 나중에 하자고 직접 말한 일만')
  })

  test('남는 위험, 다음에 할 일, 배포 뒤 확인을 남기라는 안내는 없다', () => {
    expect(guide).not.toContain('여기에 든다')
    expect(guide).not.toContain('배포 확인은 followups 다')
  })
})
