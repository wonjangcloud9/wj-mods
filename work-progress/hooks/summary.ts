import type { Work } from '../types'
import { isSubWork, progressOf } from './model'

const DAY_MS = 24 * 60 * 60_000

// /progress 뒤에 이 말을 붙이면 패널 대신 하루 요약을 글로 낸다.
export const SUMMARY_ARGS = ['요약', '오늘', 'today', 'summary']

function doneLines(work: Work, works: Work[]): string[] {
  const subs = works.filter(record => record.parentId === work.id).length
  const head = `- ${work.title} · ${work.steps.length}단계${subs > 0 ? ` · 서브 ${subs}` : ''}`
  const proofs = work.steps.filter(step => step.isDone && step.evidence).map(step => `    ✓ ${step.title} — ${step.evidence}`)
  return [head, ...proofs]
}

function openLine(work: Work): string {
  const { done, total } = progressOf(work)
  const state = work.status === 'paused' ? ' · 보류' : ''
  const reason = work.waitingFor ? ` · 기다림: ${work.waitingFor}` : work.now ? ` · 지금: ${work.now}` : ''
  return `- ${work.title} · ${done}/${total}${state}${reason}`
}

// 최근 24시간 동안 메인 대화가 끝낸 업무, 아직 하는 업무, 완료 뒤 남은 일을 글로 묶는다.
// 서브에이전트 기록은 부모 업무의 서브 개수로만 센다.
export function dailySummary(works: Work[], now: number): string {
  const main = works.filter(work => !isSubWork(work))
  const isRecent = (at: number) => now - at < DAY_MS
  const finished = main
    .filter(work => work.doneAt !== undefined && isRecent(work.doneAt) && (work.status === 'done' || work.status === 'archived'))
    .sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0))
  const open = main
    .filter(work => (work.status === 'active' || work.status === 'paused') && isRecent(work.updatedAt))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const left = main.filter(work => work.status === 'done' && work.followups)

  if (finished.length + open.length + left.length === 0) return '최근 24시간에 기록된 업무가 없어요.'
  const sections = [
    finished.length > 0 ? [`완료 ${finished.length}`, ...finished.flatMap(work => doneLines(work, works))] : [],
    open.length > 0 ? [`진행 중 ${open.length}`, ...open.map(openLine)] : [],
    left.length > 0
      ? [`남은 일 ${left.length}`, ...left.map(work => `- ${work.title}: ${(work.followups ?? []).join(', ')}`)]
      : [],
  ].filter(lines => lines.length > 0)
  return ['업무 요약 · 최근 24시간', ...sections.map(lines => lines.join('\n'))].join('\n\n')
}
