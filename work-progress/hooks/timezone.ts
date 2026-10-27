import type { EngineInterface } from 'claude-code'

// 모듈에는 시간대 API 가 없어 date 명령으로 이 컴퓨터의 UTC 차이를 읽는다. 예: '+0900' → 540
export function parseOffset(text: string): number | undefined {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  if (!match) return undefined
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

// 읽지 못하면 UTC 로 본다. 그때는 날짜가 바뀌는 시각이 이 컴퓨터의 자정과 다를 수 있다.
export async function readOffsetMin($: EngineInterface): Promise<number> {
  const ran = await $.process.run(['date', '+%z'], { timeoutMs: 5_000 }).catch(() => null)
  return (ran && ran.exitCode === 0 ? parseOffset(ran.stdout) : undefined) ?? 0
}
