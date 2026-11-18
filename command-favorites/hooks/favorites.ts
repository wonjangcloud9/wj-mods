// 즐겨찾기 목록 다루기와 버튼 자리 계산. 엔진을 부르지 않는 순수 함수만 둔다.

export const MAX_FAVS = 12

/** "/merge --squash" 나 "merge" 를 저장할 모양 "merge --squash" 로 맞춘다. 빈 값이면 null. */
export function normalize(raw: string): string | null {
  const text = raw.trim().replace(/^\/+/, '').replace(/\s+/g, ' ')
  return text.length > 0 ? text : null
}

export function addFav(list: readonly string[], raw: string): { list: string[]; note: string } {
  const fav = normalize(raw)
  if (!fav) return { list: [...list], note: '넣을 명령을 적어 주세요. 예: /fav add merge' }
  if (list.includes(fav)) return { list: [...list], note: `/${fav} 는 이미 즐겨찾기에 있어요.` }
  if (list.length >= MAX_FAVS) return { list: [...list], note: `즐겨찾기는 ${MAX_FAVS}개까지예요. 하나 뺀 뒤 넣어 주세요.` }
  return { list: [...list, fav], note: `/${fav} 를 즐겨찾기에 넣었어요.` }
}

export function removeFav(list: readonly string[], raw: string): { list: string[]; note: string } {
  const fav = normalize(raw)
  if (!fav) return { list: [...list], note: '뺄 명령을 적어 주세요. 예: /fav rm merge' }
  const index = /^\d+$/.test(fav) ? Number(fav) - 1 : list.indexOf(fav)
  const target = list[index]
  if (target === undefined) return { list: [...list], note: `/${fav} 는 즐겨찾기에 없어요.` }
  return { list: list.filter((_, i) => i !== index), note: `/${target} 를 즐겨찾기에서 뺐어요.` }
}

export function describe(list: readonly string[], repo: string): string {
  const where = repo.split('/').filter(Boolean).pop() ?? repo
  if (list.length === 0) return `${where} 에 즐겨찾기가 없어요. /fav add <명령> 으로 넣어 주세요.`
  return [`${where} 즐겨찾기`, ...list.map((fav, i) => `${i + 1}. /${fav}`)].join('\n')
}

/** 터미널 칸 수. 한글·CJK·전각 글자는 두 칸으로 센다. */
export function width(text: string): number {
  let cells = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    cells += code >= 0x1100 && (code <= 0x115f || code >= 0x2e80) ? 2 : 1
  }
  return cells
}

export const label = (fav: string): string => `/${fav}`

const GAP = 1
export const MORE = '…'

/** 남은 칸에 들어가는 만큼 앞에서부터 고르고, 다 못 넣으면 펼침 버튼 자리를 남긴다. */
export function fit(list: readonly string[], room: number): { shown: string[]; hasMore: boolean } {
  const total = list.reduce((sum, fav) => sum + width(label(fav)) + GAP, 0)
  if (total <= room) return { shown: [...list], hasMore: false }

  const budget = room - width(MORE)
  const shown: string[] = []
  let used = 0
  for (const fav of list) {
    const cells = width(label(fav)) + GAP
    if (used + cells > budget) break
    shown.push(fav)
    used += cells
  }
  return { shown, hasMore: true }
}
