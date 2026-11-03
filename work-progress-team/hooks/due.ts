// 기한 글자를 읽고, 지금 시각과 이 컴퓨터의 시간대로 남은 날을 센다. 모듈 안에서는 Date 를 쓰지 않고 날짜를 직접 계산한다.

const DAY_MS = 24 * 60 * 60_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
// 남은 날이 이 안이면 서두를 일로 친다.
const SOON_DAYS = 3
export const NO_DUE = '없음'
const NO_DUE_WORDS = [NO_DUE, 'none', '기한 없음']
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const DUE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/

export const DUE_FORMAT_ERROR = "기한은 '2026-10-30' 이나 '2026-10-30 18:00' 처럼 적어 주세요. 기한이 없다고 들었으면 '없음'으로 적어요."

// over: 기한 지남, soon: 사흘 안, later: 그 뒤, none: 기한이 없다고 들음, missing: 기한을 모름
export type DueTone = 'over' | 'soon' | 'later' | 'none' | 'missing'
// text 는 넓은 화면, short 는 아주 좁은 화면에 쓴다. days 는 기한 날까지 남은 날 수이고, 기한을 모르면 없다.
export type DueView = { text: string; short: string; tone: DueTone; days?: number }

// day 는 1970-01-01 부터 센 날 수, minutes 는 그날 몇 분에 끝나는지다. 시각이 없으면 그날이 끝날 때까지다.
type Parsed = { day: number; month: number; date: number; minutes?: number }

// 그레고리력 날짜를 1970-01-01 부터 센 날 수로 바꾼다.
function dayNumber(year: number, month: number, date: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const dayOfYear = Math.floor((153 * ((month + 9) % 12) + 2) / 5) + date - 1
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function parse(due: string): Parsed | undefined {
  const match = DUE_PATTERN.exec(due)
  if (!match) return undefined
  const [year, month, date] = [match[1], match[2], match[3]].map(Number) as [number, number, number]
  if (month < 1 || month > 12 || date < 1 || date > daysInMonth(year, month)) return undefined
  const day = dayNumber(year, month, date)
  if (match[4] === undefined || match[5] === undefined) return { day, month, date }
  const [hour, minute] = [Number(match[4]), Number(match[5])]
  if (hour > 23 || minute > 59) return undefined
  return { day, month, date, minutes: hour * 60 + minute }
}

const pad = (value: number) => String(value).padStart(2, '0')

function normalized(parsed: Parsed, year: string): string {
  const date = `${year}-${pad(parsed.month)}-${pad(parsed.date)}`
  return parsed.minutes === undefined ? date : `${date} ${pad(Math.floor(parsed.minutes / 60))}:${pad(parsed.minutes % 60)}`
}

// 모델이 보낸 기한. 빈 값이면 기한을 지우고, 형식이 틀리면 이유를 돌려준다.
export function readDue(value: unknown): { due: string | undefined } | { error: string } {
  if (value === undefined || value === null) return { due: undefined }
  if (typeof value !== 'string') return { error: DUE_FORMAT_ERROR }
  const raw = value.trim()
  if (raw === '') return { due: undefined }
  if (NO_DUE_WORDS.includes(raw.toLowerCase())) return { due: NO_DUE }
  const parsed = parse(raw)
  return parsed ? { due: normalized(parsed, raw.slice(0, 4)) } : { error: DUE_FORMAT_ERROR }
}

// 파일에 남은 기한. 읽지 못하면 기한을 모르는 것으로 본다.
export function toDue(value: unknown): string | undefined {
  const read = readDue(value)
  return 'due' in read ? read.due : undefined
}

function hm(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

function hoursText(ms: number): string {
  return ms < HOUR_MS ? `${Math.max(1, Math.floor(ms / MINUTE_MS))}분` : `${Math.floor(ms / HOUR_MS)}시간`
}

// 기한을 "기한 10/30(금) · 4일 남음" 처럼 보인다. offsetMin 은 UTC 와의 차이(분)다.
export function dueView(due: string | undefined, now: number, offsetMin: number): DueView {
  if (due === undefined) return { text: '기한 모름', short: '기한 모름', tone: 'missing' }
  if (due === NO_DUE) return { text: '기한 없음', short: '기한 없음', tone: 'none' }
  const parsed = parse(due)
  if (!parsed) return { text: '기한 모름', short: '기한 모름', tone: 'missing' }

  const shift = (Number.isFinite(offsetMin) ? offsetMin : 0) * MINUTE_MS
  const today = Math.floor((now + shift) / DAY_MS)
  const days = parsed.day - today
  const time = parsed.minutes === undefined ? '' : ` ${hm(parsed.minutes)}`
  const weekday = WEEKDAY[(((parsed.day + 4) % 7) + 7) % 7] ?? ''
  const date = `${parsed.month}/${parsed.date}(${weekday})${time}`

  if (days === 0 && parsed.minutes !== undefined) {
    const left = parsed.day * DAY_MS + parsed.minutes * MINUTE_MS - shift - now
    return left > 0
      ? { text: `기한 오늘${time} · ${hoursText(left)} 남음`, short: `${hoursText(left)} 남음`, tone: 'soon', days }
      : { text: `기한 오늘${time} · ${hoursText(-left)} 지남`, short: `${hoursText(-left)} 지남`, tone: 'over', days }
  }
  if (days < 0) return { text: `기한 ${date} · ${-days}일 지남`, short: `${-days}일 지남`, tone: 'over', days }
  if (days === 0) return { text: '기한 오늘', short: '오늘', tone: 'soon', days }
  if (days === 1) return { text: `기한 내일${time}`, short: '내일', tone: 'soon', days }
  return { text: `기한 ${date} · ${days}일 남음`, short: `${days}일 남음`, tone: days <= SOON_DAYS ? 'soon' : 'later', days }
}
