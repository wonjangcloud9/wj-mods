import type { EngineInterface } from 'claude-code'

import type { Board, LiveSession } from '../types'

// 작업 폴더가 속한 레포 경로. 같은 레포의 worktree 는 본 레포 경로로 묶고, git 이 아니면 작업 폴더를 그대로 쓴다.
// 세션 목록을 10초마다 다시 읽으므로 폴더마다 한 번만 git 을 부른다.
const cache = new Map<string, Promise<string>>()

export function repoOf($: EngineInterface, cwd: string): Promise<string> {
  const hit = cache.get(cwd)
  if (hit) return hit
  const found = commonDir($, cwd).then(dir => (dir ? rootOf(dir) : cwd))
  cache.set(cwd, found)
  return found
}

async function commonDir($: EngineInterface, cwd: string): Promise<string | undefined> {
  const result = await $.process
    .run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, timeoutMs: 5_000 })
    .catch(() => null)
  const dir = result?.exitCode === 0 ? result.stdout.trim() : ''
  return dir.startsWith('/') ? dir : undefined
}

function rootOf(gitDir: string): string {
  return gitDir.endsWith('/.git') ? gitDir.slice(0, -'/.git'.length) : gitDir
}

export function repoName(repo: string): string {
  return repo.split('/').filter(Boolean).pop() ?? repo
}

export async function withRepos($: EngineInterface, sessions: LiveSession[]): Promise<LiveSession[]> {
  return Promise.all(
    sessions.map(async session => (session.cwd ? { ...session, repo: await repoOf($, session.cwd) } : session)),
  )
}

// 레포를 모르는 예전 기록은 이 세션의 레포에 넣는다.
function repoKey(item: { repo?: string }, board: Board): string {
  return item.repo ?? board.repo ?? ''
}

function pick(board: Board, repo: string): Board {
  return {
    ...board,
    rows: board.rows.filter(row => repoKey(row.work, board) === repo),
    later: board.later.filter(item => repoKey(item, board) === repo),
    untracked: board.untracked.filter(session => repoKey(session, board) === repo),
  }
}

// 세션 시작 안내에는 이 세션 레포의 업무만 싣는다. 레포를 모르면 모두 싣는다.
export function onlyRepo(board: Board | null): Board | null {
  return board?.repo ? pick(board, board.repo) : board
}

export type RepoSection = { repo: string; board: Board }

// 패널은 모든 레포를 보이되 레포마다 섹션으로 나눈다. 이 세션의 레포를 맨 위에, 나머지는 업무가 많은 순서로 둔다.
export function repoSections(board: Board): RepoSection[] {
  const repos = new Set([
    ...board.rows.map(row => repoKey(row.work, board)),
    ...board.later.map(item => repoKey(item, board)),
    ...board.untracked.map(session => repoKey(session, board)),
  ])
  const size = (section: RepoSection) => section.board.rows.length + section.board.later.length
  return [...repos]
    .map(repo => ({ repo, board: pick(board, repo) }))
    .sort((a, b) => Number(b.repo === board.repo) - Number(a.repo === board.repo) || size(b) - size(a))
}
