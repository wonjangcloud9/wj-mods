import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { MORE, addFav, describe, fit, label, removeFav } from './favorites'

const repo = atom({ plugin: 'command-favorites', key: 'repo' } as const, '')
const favs = atom({ plugin: 'command-favorites', key: 'favs' } as const, [])
const expanded = atom({ plugin: 'command-favorites', key: 'expanded' } as const, false)

const USAGE = '쓰는 법: /fav (목록) · /fav add <명령> · /fav rm <명령 또는 번호>'

const storeKey = (path: string) => `repo:${path}`

/** worktree 도 같은 레포로 묶이게 git 공용 폴더의 상위를 레포 경로로 쓴다. git 이 아니면 작업 폴더. */
async function repoOf($: EngineInterface, cwd: string): Promise<string> {
  const found = await $.process
    .run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, timeoutMs: 5_000 })
    .catch(() => null)
  const dir = found?.exitCode === 0 ? found.stdout.trim() : ''
  if (!dir) return cwd
  return dir.endsWith('/.git') ? dir.slice(0, -'/.git'.length) : dir
}

async function load($: EngineInterface, cwd: string): Promise<void> {
  const path = await repoOf($, cwd)
  const stored = await $.store.get(storeKey(path))
  const list = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : []
  await update($, repo, () => path)
  await update($, favs, () => list)
}

async function save($: EngineInterface, list: string[]): Promise<void> {
  await $.store.set(storeKey(await read($, repo)), list)
  await update($, favs, () => list)
}

/** 누르면 바로 실행하지 않고 쓰던 글 끝에 한 칸 띄워 붙인다. 인자를 붙이거나 Enter 로 보낸다. */
async function put($: EngineInterface, command: string): Promise<void> {
  const { text } = await $.prompt.read()
  const head = text.trimEnd()
  await $.prompt.fill({ text: head ? `${head} ${command} ` : `${command} ` })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'fav', description: '이 레포의 명령 즐겨찾기 보기·넣기·빼기' })
    await load($, e.cwd)
    return started
  })

  on('command.run', { command: 'fav' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    const list = await read($, favs)

    if (verb === '') return { text: `${describe(list, await read($, repo))}\n${USAGE}` }
    if (verb === 'add' || verb === 'rm' || verb === 'remove') {
      const done = verb === 'add' ? addFav(list, arg) : removeFav(list, arg)
      if (done.list.length !== list.length) await save($, done.list)
      return { text: done.note }
    }
    return { text: USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const [list, isOpen] = await Promise.all([read($, favs), read($, expanded)])
    const columns = e.props.bodyColumns

    const fav = (name: string) => (
      <Button key={`fav:${name}`} plain onPress={() => put($, label(name))}>
        <Text color="claude">{label(name)}</Text>
      </Button>
    )
    const toggle = (open: boolean) => (
      <Button key={open ? 'fav:more' : 'fav:fold'} plain dimColor onPress={() => update($, expanded, () => open)}>
        {open ? MORE : '접기'}
      </Button>
    )

    if (isOpen && list.length > 0) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" flexWrap="wrap" columnGap={2} width={columns}>
            {list.map(name => (
              <Box key={`row:${name}`} flexDirection="row" columnGap={1}>
                {fav(name)}
                <Button key={`rm:${name}`} plain dimColor onPress={() => save($, list.filter(x => x !== name))}>
                  ✕
                </Button>
              </Box>
            ))}
            {toggle(false)}
          </Box>
          {below}
        </Box>
      )
    }

    // 엔진마다 입력창 위 배치가 달라 겹쳐 그리지 않고 자기 줄을 따로 둔다.
    if (list.length === 0) return below
    const own = fit(list, columns)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          {own.shown.map(fav)}
          {own.hasMore ? toggle(true) : ''}
        </Box>
        {below}
      </Box>
    )
  })
}
