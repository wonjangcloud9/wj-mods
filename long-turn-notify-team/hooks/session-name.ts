import type { EngineInterface } from 'claude-code'

// 엔진은 살아 있는 세션마다 ~/.claude/sessions/<pid>.json 에 이름과 상태를 남긴다.
// 권한 확인 창이 떠 있으면 status 가 waiting, waitingFor 가 이 값이 된다.
export const PERMISSION_WAIT = 'permission prompt'

type SessionRecord = Record<string, unknown>

// 같은 파일을 자주 읽으므로 찾은 경로를 기억한다. /clear 로 세션 id 가 바뀌면 다시 찾는다.
export type RecordCache = { path?: string }

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function asRecord(value: unknown, sessionId: string): SessionRecord | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as SessionRecord
  return record.sessionId === sessionId ? record : undefined
}

// 폴더 이름에서 엔진이 만든 이름(nameSource derived)은 사람이 붙인 이름이 아니라서 읽지 않는다.
export function nameFromRecord(record: unknown, sessionId: string): string | undefined {
  const own = asRecord(record, sessionId)
  if (!own || own.nameSource === 'derived') return undefined
  const { name } = own
  return typeof name === 'string' && name.trim() ? name : undefined
}

export function isWaitingForPermission(record: unknown, sessionId: string): boolean {
  return asRecord(record, sessionId)?.waitingFor === PERMISSION_WAIT
}

async function readAt($: EngineInterface, path: string): Promise<unknown> {
  const raw = await $.fs.read(path).catch(() => undefined)
  return typeof raw === 'string' ? parse(raw) : null
}

export async function readSessionRecord($: EngineInterface, cache: RecordCache = {}): Promise<unknown> {
  const sessionId = await $.session.id()
  if (cache.path) {
    const cached = await readAt($, cache.path)
    if (asRecord(cached, sessionId)) return cached
  }
  const home = await $.env.get('HOME')
  if (!home) return undefined
  const dir = `${home}/.claude/sessions`
  const entries = await $.fs.list(dir).catch(() => [])
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    const path = `${dir}/${entry.name}`
    const record = await readAt($, path)
    if (!asRecord(record, sessionId)) continue
    cache.path = path
    return record
  }
  return undefined
}

// 조직 계정에서는 기본 보안 플러그인이 classic 훅을 넘겨 주지 않아 프롬프트 때 세션 이름을 받을 수 없다.
export async function readSessionName($: EngineInterface): Promise<string | undefined> {
  return nameFromRecord(await readSessionRecord($), await $.session.id())
}
