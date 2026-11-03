import type { EngineInterface } from 'claude-code'

// 엔진이 살아 있는 세션마다 ~/.claude/sessions/<pid>.json 에 남기는 기록에서 이 세션의 이름을 꺼낸다.
// 이 이름이 ListAgents 에 보이고 SendMessage 가 받는 @주소다.
// 폴더 이름에서 엔진이 만든 이름(nameSource derived)은 아직 이름이 없다는 뜻이라 읽지 않는다.
export function nameFromRecord(record: unknown, sessionId: string): string | undefined {
  if (record === null || typeof record !== 'object') return undefined
  const { sessionId: id, name, nameSource } = record as Record<string, unknown>
  if (id !== sessionId || nameSource === 'derived') return undefined
  return typeof name === 'string' && name.trim() ? name : undefined
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function readRegisteredName($: EngineInterface): Promise<string | undefined> {
  const home = await $.env.get('HOME')
  if (!home) return undefined
  const dir = `${home}/.claude/sessions`
  const sessionId = await $.session.id()
  const entries = await $.fs.list(dir).catch(() => [])
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    const raw = await $.fs.read(`${dir}/${entry.name}`).catch(() => undefined)
    const name = typeof raw === 'string' ? nameFromRecord(parse(raw), sessionId) : undefined
    if (name) return name
  }
  return undefined
}
