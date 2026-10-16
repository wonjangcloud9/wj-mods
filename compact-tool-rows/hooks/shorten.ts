const MAX_CHARS = 60

// 사용자는 명령 본문을 읽지 않으므로 첫 줄 앞부분만 남기고 잘린 표시를 붙인다.
export function shortCommand(command: string): string {
  const trimmed = command.trim()
  const first = trimmed.split('\n')[0] ?? ''
  const head = first.length > MAX_CHARS ? first.slice(0, MAX_CHARS) : first
  return head === trimmed ? trimmed : `${head.trimEnd()} …`
}
