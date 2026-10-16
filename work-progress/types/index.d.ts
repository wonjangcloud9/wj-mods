// doneAt 은 그 단계를 처음 완료로 기록한 시각이다. 단계마다 걸린 시간을 여기서 계산한다.
export type Step = { title: string; isDone: boolean; evidence?: string; doneAt?: number }

export type WorkStatus = 'active' | 'paused' | 'done' | 'archived'

// 업무 하나가 파일 하나다. 여러 세션이 이어 쓰므로 마지막으로 기록한 세션만 남긴다.
export type Work = {
  id: string
  title: string
  steps: Step[]
  now?: string
  question?: string
  // 보류한 이유나 기다리는 조건. 예: 디자인 확정 뒤 구현
  waitingFor?: string
  // 완료한 뒤에도 이 업무 밖에서 해야 할 일. 예: push, 배포 확인
  followups?: string[]
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
// 끝난 서브에이전트의 줄에는 그 기록의 상태를 붙인다. done 이 아니면 기록을 닫지 않고 끝난 것이다.
export type ChildRow = {
  id: string
  title: string
  done?: number
  total?: number
  activity?: Activity
  status?: WorkStatus
  now?: string
}

// running: 세션이 일하는 중, yourTurn: 세션이 사용자 입력을 기다림, stalled: 세션이 없거나 다른 업무로 넘어감
// followUp: 완료했지만 남은 일이 있음, dormant: 멈춤이나 보류인 채 하루 넘게 기록이 없음
export type Phase = 'yourTurn' | 'running' | 'stalled' | 'paused' | 'followUp' | 'done' | 'dormant'

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
