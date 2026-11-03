// @ 뒤에 바로 칠 수 있게 영문 소문자와 - 만 쓴다.
const ADJECTIVES = [
  'sleepy', 'grumpy', 'sneaky', 'turbo', 'fluffy', 'spicy', 'crispy', 'jolly',
  'dizzy', 'brave', 'lazy', 'sassy', 'wobbly', 'cosmic', 'chunky', 'zippy',
  'salty', 'bouncy', 'cheeky', 'mighty', 'nerdy', 'shy', 'rusty', 'fancy',
  'hungry', 'lucky', 'noisy', 'quirky', 'smug', 'sparkly', 'tiny', 'wild',
] as const

const NOUNS = [
  'otter', 'panda', 'capybara', 'hamster', 'penguin', 'raccoon', 'corgi', 'alpaca',
  'quokka', 'axolotl', 'narwhal', 'wombat', 'sloth', 'gecko', 'puffin', 'mole',
  'mandu', 'kimbap', 'hotteok', 'ramyeon', 'dalgona', 'japchae', 'injeolmi', 'odeng',
  'goguma', 'gamja', 'twigim', 'sikhye', 'bibimbap', 'yakgwa', 'jjajang', 'tteok',
] as const

// 동시에 열린 세션끼리 이름이 겹치면 SendMessage 가 받는 사람을 고르지 못한다.
export const RECENT_LIMIT = 64

export type Random = (size: number) => number

export const cryptoRandom: Random = size => {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1))
  return value % size
}

export function pickName(recent: readonly string[], random: Random = cryptoRandom): string {
  const used = new Set(recent)
  const total = ADJECTIVES.length * NOUNS.length
  const start = random(total)
  for (let offset = 0; offset < total; offset++) {
    const index = (start + offset) % total
    const name = `${ADJECTIVES[Math.floor(index / NOUNS.length)]}-${NOUNS[index % NOUNS.length]}`
    if (!used.has(name)) return name
  }
  return `${ADJECTIVES[0]}-${NOUNS[0]}-${random(1000)}`
}

export function remember(recent: readonly string[], name: string): string[] {
  return [name, ...recent.filter(item => item !== name)].slice(0, RECENT_LIMIT)
}

export function readRecent(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function hintTail(name: string): string {
  return `  @${name}`
}
