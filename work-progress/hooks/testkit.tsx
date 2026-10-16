import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentStatus, On } from 'claude-code'

import type { LiveAgent, LiveSession, Work } from '../types'

// 테스트 파일들이 함께 쓰는 준비물. 파일·세션·서브에이전트를 가짜로 꾸민다.
export const NOW = Date.parse('2026-10-16T03:00:00Z')
export const HOUR = 60 * 60_000
export const HOME = '/home/t'
export const WORKS = `${HOME}/.claude/work-progress/works`
export const SESSIONS = `${HOME}/.claude/sessions`
export const LIVE = `${HOME}/.claude/work-progress/live`
export const ME = 'session-me'
export const TOOL = 'mcp__work-progress__report'
export const START = { cwd: '/tmp', surface: 'terminal' as const, isInteractive: true }
export const COMPOSE = { model: 'm', promptModel: 'm', surfaces: ['terminal' as const], tools: [], outputStyle: null, traits: [] }

export function work(id: string, patch: Partial<Work> = {}): Work {
  return {
    id,
    title: `업무 ${id}`,
    steps: [
      { title: '하나', isDone: true, evidence: 'abc123' },
      { title: '둘', isDone: false },
    ],
    status: 'active',
    sessionId: 'session-a',
    sessionName: 'shy-quokka',
    createdAt: NOW - 5 * HOUR,
    updatedAt: NOW - HOUR,
    ...patch,
  }
}

export const live = (sessionId: string, name: string, isBusy: boolean): LiveSession => ({ sessionId, name, isBusy })
export const agent = (id: string, description: string): LiveAgent => ({ id, description })

export type Spawned = { id: string; description: string; status: AgentStatus }

export function world(on: On, seed: Record<string, unknown> = {}, spawned: Spawned[] = []) {
  const files = new Map(Object.entries(seed).map(([path, value]) => [path, JSON.stringify(value)]))
  mock.clock(on, { now: NOW })
  mock.env(on, { HOME })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: ME }))
  on('agent.list', () => ({ value: spawned.map(agent => ({ ...agent, type: 'general-purpose' })) }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__work-progress__${e.name}` } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' as const }] }))
  on('fs.list', (_, e) => {
    const prefix = `${e.path}/`
    const names = [...files.keys()].filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length))
    return {
      value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: NOW, isLink: false })),
    }
  })
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    return text === undefined ? { deny: 'missing' } : { value: text }
  })
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return {
    read: (path: string) => JSON.parse(files.get(path) ?? 'null') as Work | null,
    raw: (path: string) => JSON.parse(files.get(path) ?? 'null') as unknown,
  }
}


export function mountPane($: Engine, bodyColumns = 100, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({
    plugin: 'work-progress',
    surface,
    component: 'Pane',
    requestId: 'work-progress',
    props: { title: '업무 진행도', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
}
