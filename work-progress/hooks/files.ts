import type { EngineInterface } from 'claude-code'

import type { LaterItem, LiveSession, SessionLive, Work } from '../types'
import { toLater } from './later'
import { toLiveSession, toSessionLive, toWork } from './model'

type Dirs = { works: string; sessions: string; live: string; later: string }

// 업무 기록은 세션마다 다른 mod 인스턴스가 함께 쓰므로 $.store 대신 업무별 파일로 나눈다.
async function dirs($: EngineInterface): Promise<Dirs> {
  const home = (await $.env.get('HOME')) ?? ''
  return {
    works: `${home}/.claude/work-progress/works`,
    sessions: `${home}/.claude/sessions`,
    live: `${home}/.claude/work-progress/live`,
    later: `${home}/.claude/work-progress/later`,
  }
}

async function readJsonFiles($: EngineInterface, dir: string): Promise<unknown[]> {
  const entries = await $.fs.list(dir).catch(() => [])
  const files = entries.filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
  const values = await Promise.all(
    files.map(entry =>
      $.fs
        .read(`${dir}/${entry.name}`)
        .then(raw => JSON.parse(raw) as unknown)
        .catch(() => null),
    ),
  )
  return values
}

export async function readWorks($: EngineInterface): Promise<Work[]> {
  const values = await readJsonFiles($, (await dirs($)).works)
  return values.flatMap(value => toWork(value) ?? [])
}

export async function readWork($: EngineInterface, id: string): Promise<Work | null> {
  const raw = await $.fs.read(`${(await dirs($)).works}/${id}.json`).catch(() => null)
  if (raw === null) return null
  try {
    return toWork(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function writeWork($: EngineInterface, work: Work): Promise<void> {
  await $.fs.write(`${(await dirs($)).works}/${work.id}.json`, `${JSON.stringify(work, null, 2)}\n`)
}

export async function readSessions($: EngineInterface): Promise<LiveSession[]> {
  const values = await readJsonFiles($, (await dirs($)).sessions)
  return values.flatMap(value => toLiveSession(value) ?? [])
}

export async function readLive($: EngineInterface): Promise<Map<string, SessionLive>> {
  const values = await readJsonFiles($, (await dirs($)).live)
  return new Map(values.flatMap(value => toSessionLive(value) ?? []).map(({ sessionId, live }) => [sessionId, live]))
}

export async function writeLive($: EngineInterface, sessionId: string, live: SessionLive): Promise<void> {
  await $.fs.write(`${(await dirs($)).live}/${sessionId}.json`, `${JSON.stringify({ sessionId, ...live }, null, 2)}\n`)
}

// 나중에 할 일도 여러 세션이 함께 쓰므로 일마다 파일 하나로 나눈다.
export async function readLater($: EngineInterface): Promise<LaterItem[]> {
  const values = await readJsonFiles($, (await dirs($)).later)
  return values.flatMap(value => toLater(value) ?? [])
}

export async function writeLater($: EngineInterface, item: LaterItem): Promise<void> {
  await $.fs.write(`${(await dirs($)).later}/${item.id}.json`, `${JSON.stringify(item, null, 2)}\n`)
}
