import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { shortCommand } from './shorten'

const LONG = `S=/tmp/claude/scratchpad\ncat > "$S/a.py" <<'PY'\nprint(1)\nPY`

function engineRow(on: On) {
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`$ ${String((e.props.input as { command?: unknown }).command)}`}</Text>
  })
}

function row(tool: string, command: string) {
  return { tool_use_id: 't1', tool, input: { command, description: '반복 작업 세기' }, isRunning: false, isErrored: false, isInterrupted: false }
}

describe('shortCommand', () => {
  test('여러 줄이거나 긴 명령은 첫 줄 앞 60자만 남긴다', () => {
    expect(shortCommand(LONG)).toBe(`${LONG.split('\n')[0]?.slice(0, 60)} …`)
    expect(shortCommand('ls -la\npwd')).toBe('ls -la …')
  })

  test('짧은 한 줄 명령은 그대로 둔다', () => {
    expect(shortCommand('git status')).toBe('git status')
  })
})

test('Bash 줄은 짧게, 다른 도구 줄은 그대로 그린다', async ($, on) => {
  engineRow(on)

  const bash = await $.ui.mount({ plugin: 'compact-tool-rows', surface: 'terminal', component: 'ToolUse', props: row('Bash', LONG) })
  expect(await bash.find({ type: 'Text', text: /^\$ S=\/tmp\/claude.* …$/ })).toBeDefined()

  const other = await $.ui.mount({ plugin: 'compact-tool-rows', surface: 'terminal', component: 'ToolUse', props: row('Grep', LONG) })
  expect(await other.find({ type: 'Text', text: /print\(1\)/ })).toBeDefined()
})
