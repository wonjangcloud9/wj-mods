import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

function engineRow(on: On) {
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`❯ ${e.props.text}`}</Text>
  })
}

function prompt(kind: 'composer' | 'task-notification') {
  return { text: '구분선 넣어줘', origin: { kind }, isExpanded: true }
}

function pluginPrompt(asUser: boolean) {
  const origin = asUser ? { kind: 'plugin' as const, name: 'quick-reply', asUser: true as const } : { kind: 'plugin' as const, name: 'quick-reply' }
  return { text: '2번으로 진행해', origin, isExpanded: true }
}

test('내가 보낸 질문 위에 구분선을 긋고 왼쪽에 강조 막대를 세운다', async ($, on) => {
  engineRow(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'turn-divider',
      surface,
      component: 'UserMessage',
      props: prompt('composer'),
      viewport: { columns: 40, rows: 20 },
    })
    expect((await ui.find({ type: 'Text', text: /^─+$/ }))?.text).toBe('─'.repeat(38))
    expect(await ui.find({ type: 'Text', text: '❯ 구분선 넣어줘' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▌ ' })).toBeDefined()
    await ui.unmount()
  }
})

test('터미널에서는 엔진 질문 줄의 위 빈 줄만큼 막대를 내려 글자 줄에 맞춘다', async ($, on) => {
  engineRow(on)

  const terminal = await $.ui.mount({ plugin: 'turn-divider', surface: 'terminal', component: 'UserMessage', props: prompt('composer') })
  expect((await terminal.find({ type: 'Box', key: 'bar' }))?.props.marginTop).toBe(1)
  await terminal.unmount()

  const desktop = await $.ui.mount({ plugin: 'turn-divider', surface: 'desktop', component: 'UserMessage', props: prompt('composer') })
  expect((await desktop.find({ type: 'Box', key: 'bar' }))?.props.marginTop).toBe(0)
})

test('작업 알림에는 구분선을 긋지 않는다', async ($, on) => {
  engineRow(on)

  const ui = await $.ui.mount({ plugin: 'turn-divider', surface: 'terminal', component: 'UserMessage', props: prompt('task-notification') })
  expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '▌ ' })).toBeUndefined()
})

test('빠른 답장처럼 사람 대신 보낸 답장에는 긋고, 플러그인이 따로 보낸 메시지에는 긋지 않는다', async ($, on) => {
  engineRow(on)

  const reply = await $.ui.mount({ plugin: 'turn-divider', surface: 'terminal', component: 'UserMessage', props: pluginPrompt(true) })
  expect(await reply.find({ type: 'Text', text: '▌ ' })).toBeDefined()

  const framed = await $.ui.mount({ plugin: 'turn-divider', surface: 'terminal', component: 'UserMessage', props: pluginPrompt(false) })
  expect(await framed.find({ type: 'Text', text: '▌ ' })).toBeUndefined()
})
