import type { EngineInterface, Register } from 'claude-code'

import { SYSTEM, isReportLike, summaryLine, summaryPrompt } from './summary'

const MODEL = 'haiku'
const MAX_TOKENS = 300
const TIMEOUT_MS = 20_000

async function summarize($: EngineInterface, answer: string): Promise<void> {
  const reply = await $.model.complete({
    model: MODEL,
    system: SYSTEM,
    prompt: summaryPrompt(answer),
    maxTokens: MAX_TOKENS,
    effort: 'low',
    timeoutMs: TIMEOUT_MS,
  })
  const line = reply.isAnswered ? summaryLine(reply.text) : undefined
  if (line) $.ui.log(line)
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || !isReportLike(e.answer)) return result

    // 턴 마무리를 늦추지 않도록 요약은 턴이 끝난 뒤 timer 에서 만든다.
    $.clock.after(0, () => void summarize($, e.answer))
    return result
  })
}
