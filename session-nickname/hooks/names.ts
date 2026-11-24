// @ 뒤에 바로 칠 수 있게 영문 소문자와 - 만 쓴다.
const ADJECTIVES = [
  'sleepy', 'grumpy', 'sneaky', 'turbo', 'fluffy', 'spicy', 'crispy', 'jolly',
  'dizzy', 'brave', 'lazy', 'sassy', 'wobbly', 'cosmic', 'chunky', 'zippy',
  'salty', 'bouncy', 'cheeky', 'mighty', 'nerdy', 'shy', 'rusty', 'fancy',
  'hungry', 'lucky', 'noisy', 'quirky', 'smug', 'sparkly', 'tiny', 'wild',
  'bubbly', 'cozy', 'crunchy', 'curly', 'dapper', 'derpy', 'dreamy', 'fuzzy',
  'giddy', 'goofy', 'gooey', 'groovy', 'hasty', 'hyper', 'jazzy', 'jumpy',
  'kooky', 'loopy', 'mellow', 'merry', 'misty', 'moody', 'nifty', 'nimble',
  'peppy', 'perky', 'plucky', 'puffy', 'quiet', 'rowdy', 'silly', 'snappy',
  'snazzy', 'soggy', 'sporty', 'squishy', 'stealthy', 'stormy', 'sunny', 'swift',
  'tangy', 'toasty', 'tubby', 'wacky', 'wiggly', 'witty', 'zesty', 'zany',
  'breezy', 'chilly', 'clumsy', 'cranky', 'dusty', 'fiery', 'frosty', 'gentle',
  'glossy', 'humble', 'jumbo', 'lumpy', 'minty', 'nutty', 'plump', 'velvety',
] as const

const NOUNS = [
  'otter', 'panda', 'capybara', 'hamster', 'penguin', 'raccoon', 'corgi', 'alpaca',
  'quokka', 'axolotl', 'narwhal', 'wombat', 'sloth', 'gecko', 'puffin', 'mole',
  'beaver', 'badger', 'bunny', 'koala', 'lemur', 'llama', 'meerkat', 'ferret',
  'hedgehog', 'chinchilla', 'pangolin', 'platypus', 'seal', 'walrus', 'marmot', 'tapir',
  'okapi', 'manatee', 'dolphin', 'orca', 'owl', 'parrot', 'toucan', 'flamingo',
  'pelican', 'duckling', 'kitten', 'fox', 'lynx', 'moose', 'bison', 'turtle',
  'mandu', 'kimbap', 'hotteok', 'ramyeon', 'dalgona', 'japchae', 'injeolmi', 'odeng',
  'goguma', 'gamja', 'twigim', 'sikhye', 'bibimbap', 'yakgwa', 'jjajang', 'tteok',
  'bungeoppang', 'hoppang', 'tteokbokki', 'sundae', 'galbi', 'bulgogi', 'naengmyeon', 'kalguksu',
  'sujebi', 'pajeon', 'kimchi', 'dakgalbi', 'jjamppong', 'tangsuyuk', 'gyeranppang', 'songpyeon',
  'bingsu', 'yugwa', 'gukbap', 'bossam', 'jokbal', 'sundubu', 'nurungji', 'misutgaru',
  'sujeonggwa', 'yakbap', 'garaetteok', 'kkwabaegi', 'gyeranmari', 'sotteok', 'hodugwaja', 'dasik',
  'comet', 'nebula', 'quasar', 'pulsar', 'meteor', 'galaxy', 'rocket', 'saturn',
  'jupiter', 'pluto', 'nova', 'moon', 'orbit', 'asteroid', 'eclipse', 'stardust',
  'supernova', 'satellite', 'planet', 'zenith', 'blackhole', 'starship', 'ufo', 'alien',
  'martian', 'mercury', 'venus', 'neptune', 'astronaut', 'wormhole', 'telescope', 'meteorite',
  'cloud', 'thunder', 'drizzle', 'blizzard', 'typhoon', 'tornado', 'rainbow', 'breeze',
  'hail', 'fog', 'mist', 'snowflake', 'sleet', 'monsoon', 'cyclone', 'rain',
  'sunshine', 'lightning', 'frost', 'dew', 'puddle', 'gust', 'squall', 'hurricane',
  'haze', 'icicle', 'avalanche', 'sunbeam', 'downpour', 'whirlwind', 'snowman', 'aurora',
] as const

// 동시에 열린 세션끼리 이름이 겹치면 SendMessage 가 받는 사람을 고르지 못한다.
export const RECENT_LIMIT = 64
// 같은 단어가 자주 보이면 매번 같은 이름처럼 느껴져서, 최근 이름에 쓴 단어는 통째로 피한다.
export const WORD_WINDOW = 24

export type Random = (size: number) => number

export const cryptoRandom: Random = size => {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1))
  return value % size
}

function recentWords(recent: readonly string[]): Set<string> {
  return new Set(recent.slice(0, WORD_WINDOW).flatMap(name => name.split('-')))
}

export function pickName(recent: readonly string[], random: Random = cryptoRandom): string {
  const words = recentWords(recent)
  const adjectives = ADJECTIVES.filter(word => !words.has(word))
  const nouns = NOUNS.filter(word => !words.has(word))
  if (adjectives.length > 0 && nouns.length > 0) {
    return `${adjectives[random(adjectives.length)]}-${nouns[random(nouns.length)]}`
  }
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
