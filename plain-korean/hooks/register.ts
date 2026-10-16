import type { Register } from 'claude-code'

import { clarityAsk, type ClarityAsk } from './clarity'
import { isEnglishAnswer } from './language'

const NOTICE = '답변 규칙: 답변이 영어로 쓰였습니다. 다음 턴에 한글로 쓰도록 알려 둡니다.'

const REMINDER =
  '직전 답변을 영어로 썼다. 사용자는 답변, 중간 보고, 완료 요약을 모두 한글로 받기를 원한다. ' +
  '이번 답변은 한글로 쓰고, 직전 답변 내용이 아직 필요하면 한글로 다시 정리한다. 코드 식별자, 경로, 명령, 오류 원문은 원래 표기로 둔다.'

const CLARITY: Record<ClarityAsk, string> = {
  confused:
    '사용자가 직전 설명을 이해하지 못했다. 첫 문장에 결론을 쓴다. 직전 답에 나온 낯선 말, 줄임말, 번호를 그대로 반복하지 말고 무슨 뜻인지 풀어 쓴다. ' +
    '구체적인 예를 하나 든다. 제목과 표 없이 5줄 안으로 쓴다. 사용자가 정해야 할 것이 있으면 선택지마다 고르면 무엇이 달라지는지 한 줄로 쓴다.',
  shorter: '사용자가 짧은 답을 원한다. 결론부터 3줄 안으로 쓴다. 제목, 표, 근거 목록, 커밋 해시는 빼고 꼭 필요한 것만 남긴다.',
}

// 영어로 쓴 답변 아래에 경고를 붙이고, 다음 프롬프트에 한 번만 교정 지시를 넣는다.
// "뭔 말", "짧게" 같은 짧은 프롬프트에는 쉽게 다시 쓰라는 지시를 붙인다.
export const register: Register = on => {
  let isPending = false

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer') return result
    if (!isEnglishAnswer(e.answer)) return result

    isPending = true
    return { ...result, text: NOTICE }
  })

  on('prompt.submit', ($, e, next) => {
    const ask = clarityAsk(e.text)
    const added = [...(isPending ? [REMINDER] : []), ...(ask ? [CLARITY[ask]] : [])]
    if (added.length === 0) return next(e)

    isPending = false
    return next({ ...e, context: [...(e.context ?? []), ...added] })
  })
}
