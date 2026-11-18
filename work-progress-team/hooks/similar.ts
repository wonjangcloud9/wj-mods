import type { Work } from '../types'

import { ago, isSubWork, progressOf } from './model'

// 같은 일을 다른 work_id 로 다시 기록하면 옛 기록이 닫히지 않고 남는다.
// 새 업무를 처음 기록할 때 제목이 비슷한 진행 중 업무를 찾아 한 번 되묻는다.

const MIN_SHARED_WORDS = 2
const MIN_OVERLAP = 0.5

// 한 글자 낱말은 뜻이 약해서 뺀다.
function words(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(word => word.length > 1),
  )
}

// 두 제목의 낱말이 두 개 이상, 그리고 절반 이상 겹치면 같은 일일 수 있다고 본다.
export function isSimilarTitle(a: string, b: string): boolean {
  const [left, right] = [words(a), words(b)]
  const shared = [...left].filter(word => right.has(word)).length
  const all = new Set([...left, ...right]).size
  return shared >= MIN_SHARED_WORDS && shared / all >= MIN_OVERLAP
}

// 같은 레포에서 아직 열려 있는 메인 대화의 업무만 본다. 레포를 모르는 기록은 어느 레포와도 견준다.
export function similarOpenWorks(title: string, repo: string | undefined, works: Work[]): Work[] {
  return works.filter(
    work =>
      !isSubWork(work) &&
      (work.status === 'active' || work.status === 'paused') &&
      (!repo || !work.repo || work.repo === repo) &&
      isSimilarTitle(title, work.title),
  )
}

export function similarNote(similar: Work[], now: number): string {
  const lines = similar.map(work => {
    const { done, total } = progressOf(work)
    return `- ${work.id} · ${work.title} · ${done}/${total} 단계 · @${work.sessionName} · ${ago(work.updatedAt, now)}`
  })
  return [
    '제목이 비슷한 진행 중 업무가 있어서 기록하지 않았어요. 같은 일이면 새로 만들지 말고 그 work_id 로 기록해 주세요. 다른 일이면 같은 내용을 한 번 더 보내면 새 업무로 기록해요.',
    ...lines,
  ].join('\n')
}
