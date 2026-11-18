import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { addFav, fit, normalize, removeFav, width } from './favorites'

const REPO = '/Users/me/my-project'

function world(on: On, stored: Record<string, unknown> = {}, gitDir = `${REPO}/.git`) {
  const filled: string[] = []
  const box = { text: '' }
  const saved: Record<string, unknown> = { ...stored }
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('process.run', () => ({ value: { exitCode: gitDir ? 0 : 128, stdout: `${gitDir}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.read', () => ({ value: { text: box.text, cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>5시간 19%</Text>
      </Box>
    )
  })
  return { filled, box, saved }
}

function mount($: Engine, bodyColumns: number, hasSurvey = false) {
  return $.ui.mount({
    plugin: 'command-favorites',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows: 12, bodyColumns, scroll: { offset: 0, bodyRows: 11 }, view: {} },
  })
}

const start = ($: Engine, cwd = `${REPO}/api`) => $.session.start({ cwd, surface: 'terminal', isInteractive: true })
const fav = ($: Engine, args: string) => $.command.run({ command: 'fav', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

describe('목록 다루기', () => {
  test('앞 슬래시와 겹친 공백을 지워 같은 명령으로 본다', () => {
    expect(normalize(' //merge   --squash ')).toBe('merge --squash')
    expect(normalize('  ')).toBe(null)
    expect(addFav(['merge'], '/merge').note).toContain('이미')
  })

  test('번호나 이름으로 뺀다', () => {
    expect(removeFav(['a', 'b', 'c'], '2').list).toEqual(['a', 'c'])
    expect(removeFav(['a', 'b'], '/a').list).toEqual(['b'])
    expect(removeFav(['a'], 'z').note).toContain('없어요')
  })

  test('한글은 두 칸으로 세고, 다 못 넣으면 펼침 자리를 남긴다', () => {
    expect(width('/배포')).toBe(5)
    expect(fit(['merge', 'pr'], 20)).toEqual({ shown: ['merge', 'pr'], hasMore: false })
    expect(fit(['merge', 'pr', 'release'], 10)).toEqual({ shown: ['merge'], hasMore: true })
  })
})

describe('/fav 명령', () => {
  test('넣은 즐겨찾기는 레포 경로로 저장되고 같은 레포의 다른 폴더에서도 보인다', async ($, on) => {
    const { saved } = world(on)
    await start($)
    expect((await fav($, 'add /merge')).text).toContain('넣었어요')
    expect(saved[`repo:${REPO}`]).toEqual(['merge'])
    expect((await fav($, '')).text).toContain('1. /merge')
  })

  test('worktree 는 공용 git 폴더 기준이라 본 레포 즐겨찾기를 같이 쓴다', async ($, on) => {
    world(on, { [`repo:${REPO}`]: ['pr'] })
    await start($, '/Users/me/my-project-wt')
    expect((await fav($, '')).text).toContain('/pr')
  })

  test('git 이 아닌 폴더는 그 폴더 기준이다', async ($, on) => {
    world(on, { '/tmp/x': ['nope'] }, '')
    await start($, '/tmp/plain')
    expect((await fav($, '')).text).toContain('즐겨찾기가 없어요')
  })

  test('빼면 저장에서도 빠지고, 모르는 말엔 쓰는 법을 알려 준다', async ($, on) => {
    const { saved } = world(on, { [`repo:${REPO}`]: ['merge', 'pr'] })
    await start($)
    expect((await fav($, 'rm 1')).text).toContain('/merge 를 즐겨찾기에서 뺐어요')
    expect(saved[`repo:${REPO}`]).toEqual(['pr'])
    expect((await fav($, 'zzz')).text).toContain('쓰는 법')
  })
})

describe('입력창 위 버튼', () => {
  test('누르면 실행하지 않고 쓰던 글 끝에 한 칸 띄워 명령을 붙인다', async ($, on) => {
    const { filled, box } = world(on, { [`repo:${REPO}`]: ['merge'] })
    await start($)
    const ui = await mount($, 80)
    await ui.press({ key: 'fav:merge' })
    box.text = 'MR 123 '
    await ui.press({ key: 'fav:merge' })
    expect(filled).toEqual(['/merge ', 'MR 123 /merge '])
    await ui.unmount()
  })

  test('사용률 줄 옆에 다 못 넣으면 펼침 버튼을 두고, 펼치면 전부와 빼기 버튼이 보인다', async ($, on) => {
    const { saved } = world(on, { [`repo:${REPO}`]: ['merge', 'deploy-preview', 'release'] })
    await start($)
    const ui = await mount($, 30)
    expect(await ui.find({ key: 'fav:merge' })).toBeTruthy()
    expect(await ui.find({ key: 'fav:release' })).toBeFalsy()
    await ui.press({ key: 'fav:more' })
    expect(await ui.find({ key: 'fav:release' })).toBeTruthy()
    await ui.press({ key: 'rm:release' })
    expect(saved[`repo:${REPO}`]).toEqual(['merge', 'deploy-preview'])
    await ui.press({ key: 'fav:fold' })
    expect(await ui.find({ key: 'rm:merge' })).toBeFalsy()
    await ui.unmount()
  })

  test('즐겨찾기가 없거나 설문이 떠 있으면 버튼을 그리지 않는다', async ($, on) => {
    world(on)
    await start($)
    const empty = await mount($, 80)
    expect(await empty.find({ key: 'fav:more' })).toBeFalsy()
    await empty.unmount()
  })

  test('설문이 떠 있으면 즐겨찾기가 있어도 버튼을 그리지 않는다', async ($, on) => {
    world(on, { [`repo:${REPO}`]: ['merge'] })
    await start($)
    const survey = await mount($, 80, true)
    expect(await survey.find({ key: 'fav:merge' })).toBeFalsy()
    await survey.unmount()
  })
})
