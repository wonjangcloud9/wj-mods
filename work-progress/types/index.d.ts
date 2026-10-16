export type Step = { title: string; isDone: boolean; evidence?: string }

export type WorkStatus = 'active' | 'paused' | 'done' | 'archived'

// 업무 하나가 파일 하나다. 여러 세션이 이어 쓰므로 마지막으로 기록한 세션만 남긴다.
export type Work = {
  id: string
  title: string
  steps: Step[]
  now?: string
  question?: string
  status: WorkStatus
  sessionId: string
  sessionName: string
  // 서브에이전트가 기록했으면 그 서브에이전트 id. 메인 대화의 기록에는 없다.
  agentId?: string
  // 서브에이전트의 기록이면, 기록할 때 그 세션이 하던 메인 업무의 id. 끝난 뒤에도 부모 아래에 묶는다.
  parentId?: string
  createdAt: number
  updatedAt: number
  doneAt?: number
}

export type LiveSession = { sessionId: string; name: string; isBusy: boolean }

// 마지막으로 쓴 도구를 사람이 읽는 한 줄로 바꾼 것
export type Activity = { text: string; at: number }

export type LiveAgent = { id: string; description: string; activity?: Activity }

// 세션이 10초마다 ~/.claude/work-progress/live 에 남기는 상태. 다른 세션은 이 파일로만 안다.
export type SessionLive = { activity?: Activity; agents: LiveAgent[] }

// 부모 업무 아래 한 줄. 서브에이전트가 기록을 남겼으면 그 진행도를 붙인다.
export type ChildRow = { id: string; title: string; done?: number; total?: number; activity?: Activity }

// running: 세션이 일하는 중, yourTurn: 세션이 사용자 입력을 기다림, stalled: 세션이 없거나 다른 업무로 넘어감
export type Phase = 'yourTurn' | 'running' | 'stalled' | 'paused' | 'done'

// children 은 도는 서브에이전트, finished 는 이 업무 아래 끝난 서브에이전트 기록
export type WorkRow = { work: Work; phase: Phase; children: ChildRow[]; finished: ChildRow[]; activity?: Activity }

export type Board = { rows: WorkRow[]; untracked: LiveSession[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'work-progress': {
      board: Board | null
      expanded: string | null
      snapshot: string | null
      live: string | null
      activity: Record<string, Activity> | null
    }
  }
}
