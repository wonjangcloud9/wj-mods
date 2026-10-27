// 나중에 할 일을 읽고, 도구 입력을 새로 남길 일과 닫을 일로 나눈다. 파일과 화면은 다른 모듈이 맡는다.
import type { LaterItem, LaterStatus } from '../types'
import { readDue, toDue } from './due'

export const LATER_TOOL_NAME = 'later'
// /progress 뒤에 이 말과 할 일을 적으면 사용자가 직접 나중에 할 일을 남긴다. 예: /progress 나중 씨앗 Node 버전 올리기
export const LATER_ARGS = ['나중', 'later']

const STATUSES: LaterStatus[] = ['open', 'done', 'dropped']

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function toLater(value: unknown): LaterItem | null {
  const v = (value ?? {}) as Record<string, unknown>
  const id = text(v.id)
  const said = text(v.text)
  const status = v.status as LaterStatus
  if (!id || !said || typeof v.createdAt !== 'number' || !STATUSES.includes(status)) return null
  return {
    id,
    text: said,
    due: toDue(v.due),
    workId: text(v.workId),
    workTitle: text(v.workTitle),
    status,
    sessionName: text(v.sessionName) ?? '',
    createdAt: v.createdAt,
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : v.createdAt,
  }
}

// 아직 하지 않은 일만 먼저 남긴 순서로 보인다.
export function openLater(items: LaterItem[]): LaterItem[] {
  return items.filter(item => item.status === 'open').sort((a, b) => a.createdAt - b.createdAt)
}

// 사용자가 /progress 나중 뒤에 적은 할 일. 없으면 undefined 다.
export function laterFromArgs(args: string): string | undefined {
  const [word, ...rest] = args.trim().split(/\s+/)
  if (!word || !LATER_ARGS.includes(word.toLowerCase())) return undefined
  return text(rest.join(' '))
}

export type LaterBy = { sessionName: string; at: number }

export function newLater(said: string, by: LaterBy, id: string, extra: Pick<LaterItem, 'due' | 'workId' | 'workTitle'> = {}): LaterItem {
  return { id, text: said, ...extra, status: 'open', sessionName: by.sessionName, createdAt: by.at, updatedAt: by.at }
}

// works 는 업무 id 와 제목, open 은 아직 열린 나중에 할 일이다. newId 는 겹치지 않는 id 를 만든다.
export type LaterContext = { works: Map<string, string>; open: Map<string, LaterItem>; by: LaterBy; newId: () => string }
export type LaterChange = { add: LaterItem[]; close: LaterItem[]; notes: string[] } | { error: string }

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => text(item) ?? []) : []
}

function readAdds(value: unknown, ctx: LaterContext): { items: LaterItem[] } | { error: string } {
  if (!Array.isArray(value)) return { items: [] }
  const items: LaterItem[] = []
  for (const entry of value) {
    const fields = (typeof entry === 'object' && entry !== null ? entry : { text: entry }) as Record<string, unknown>
    const said = text(fields.text)
    if (!said) continue
    const due = readDue(fields.due)
    if ('error' in due) return { error: `"${said}": ${due.error}` }
    const workId = text(fields.work_id)?.toLowerCase()
    const workTitle = workId ? ctx.works.get(workId) : undefined
    if (workId && !workTitle) return { error: `"${said}": work_id ${workId} 업무를 찾지 못했어요. 업무 없이 나온 일이면 work_id 를 빼 주세요.` }
    const extra = { ...(due.due ? { due: due.due } : {}), ...(workId ? { workId, workTitle } : {}) }
    items.push(newLater(said, ctx.by, ctx.newId(), extra))
  }
  return { items }
}

export function readLaterInput(input: Record<string, unknown>, ctx: LaterContext): LaterChange {
  const added = readAdds(input.add, ctx)
  if ('error' in added) return { error: added.error }
  const asked = [
    ...ids(input.done).map(id => ({ id, status: 'done' as const })),
    ...ids(input.drop).map(id => ({ id, status: 'dropped' as const })),
  ]
  const unknown = asked.filter(({ id }) => !ctx.open.has(id)).map(({ id }) => id)
  if (unknown.length > 0) return { error: `열린 나중에 할 일 중에 없는 id: ${unknown.join(', ')}` }
  if (added.items.length + asked.length === 0) return { error: 'add, done, drop 중 하나 이상을 보내 주세요.' }

  const close = asked.flatMap(({ id, status }) => {
    const item = ctx.open.get(id)
    return item ? [{ ...item, status, updatedAt: ctx.by.at }] : []
  })
  const notes = [
    ...added.items.map(item => `남김: ${item.id} · ${item.text}`),
    ...close.map(item => `${item.status === 'done' ? '끝냄' : '안 하기로 함'}: ${item.id} · ${item.text}`),
  ]
  return { add: added.items, close, notes }
}

export const LATER_TOOL_DESCRIPTION =
  '나중에 할 일을 남기거나 닫는다. 이번에는 하지 않고 다른 날이나 다른 브랜치에서 할 일을 사용자가 잊지 않게 진행도 패널에 남긴다.'

export const LATER_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    add: {
      type: 'array',
      description: '새로 남길 나중에 할 일',
      items: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '할 일 한 줄. 어디서 무엇을 하는지 적는다. 예: develop 에서 씨앗 Dockerfile 의 node:20 을 22 로 올리기',
          },
          due: { type: 'string', description: '기한. 형식은 report 의 due 와 같다. 정해진 기한이 없으면 생략한다.' },
          work_id: { type: 'string', description: '이 일이 나온 업무의 work_id. 업무 없이 나온 일이면 생략한다.' },
        },
        required: ['text'],
      },
    },
    done: { type: 'array', items: { type: 'string' }, description: '끝낸 나중에 할 일의 id' },
    drop: { type: 'array', items: { type: 'string' }, description: '하지 않기로 한 나중에 할 일의 id' },
  },
}
