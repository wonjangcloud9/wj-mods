export const MIN_DURATION_MS = 2 * 60_000

const SNIPPET_CHARS = 80

export type Ending = 'answer' | 'error' | 'refusal'

export type Notice = { title: string; subtitle: string; body: string }

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`
}

// 알림 한 줄에 마크다운 기호가 그대로 보이지 않게 첫 문장만 꺼낸다.
export function firstLine(answer: string): string {
  const line = answer
    .split('\n')
    .map(l => l.replace(/^[#>\-*\s|]+/, '').replace(/[*`|]/g, '').trim())
    .find(l => l.length > 0)
  if (!line) return ''
  return line.length > SNIPPET_CHARS ? `${line.slice(0, SNIPPET_CHARS - 1)}…` : line
}

export function buildNotice(project: string, ending: Ending, durationMs: number, answer: string): Notice {
  const took = formatDuration(durationMs)
  const body = ending === 'answer' ? `${took} 걸린 작업이 끝났습니다` : `${took} 만에 오류로 멈췄습니다`
  return { title: `Claude Code · ${project}`, subtitle: body, body: firstLine(answer) || body }
}

// 작업 도중 선택 창이나 권한 확인 창이 떠서 사용자의 답을 기다리는 경우다.
export type Waiting = 'question' | 'permission'

export function waitingNotice(project: string, waiting: Waiting, detail: string): Notice {
  const subtitle = waiting === 'question' ? '선택을 기다리고 있습니다' : '권한 확인을 기다리고 있습니다'
  return { title: `Claude Code · ${project}`, subtitle, body: firstLine(detail) || subtitle }
}

function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function appleScript(notice: Notice): string {
  return `display notification ${quote(notice.body)} with title ${quote(notice.title)} subtitle ${quote(notice.subtitle)}`
}

// 알림 소리는 시스템 알림 음량을 따라 크기를 못 바꾸므로, 녹음한 음성을 따로 원하는 크기로 재생한다.
// 녹음 파일은 배포하지 않고 처음 쓸 때 맥 say 로 만들어 ~/.claude/long-turn-notify/sounds 에 둔다.
export type Sound = { file: string; text: string }
export const DONE_SOUND: Sound = { file: 'commander.aiff', text: '명령을 내려주십시오 사령관님' }
export const WAITING_SOUND: Sound = { file: 'choice.aiff', text: '선택이 필요합니다 사령관님' }
export const SOUND_VOLUME = 3

export function soundDir(home: string): string {
  return `${home}/.claude/long-turn-notify/sounds`
}

export function playCommand(file: string): string[] {
  return ['afplay', '-v', String(SOUND_VOLUME), file]
}

// 세션이 여럿 열려 있어도 어느 세션이 부르는지 알 수 있게, 녹음 음성 앞에 세션 이름을 같은 목소리로 읽는다.
export const VOICE = 'Yuna'
export const SPOKEN_NAME_FILE = 'name.aiff'

export function spokenName(sessionTitle: string): string {
  return `${sessionTitle.replace(/[-_]+/g, ' ').trim()} 세션`
}

export function speakCommand(outputFile: string, text: string): string[] {
  return ['say', '-v', VOICE, '-o', outputFile, '--', text]
}

export function projectName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() ?? cwd
}
