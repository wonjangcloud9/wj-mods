import type { Register } from 'claude-code'

import { shortCommand } from './shorten'

export const register: Register = on => {
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (e.props.tool !== 'Bash' || typeof e.props.input !== 'object' || e.props.input === null) return next(e)

    const input = e.props.input as Record<string, unknown>
    if (typeof input.command !== 'string') return next(e)

    const command = shortCommand(input.command)
    if (command === input.command) return next(e)

    // 화면에 그리는 줄만 바뀌고 실제 실행된 명령과 기록은 그대로다.
    return next({ ...e, props: { ...e.props, input: { ...input, command } } })
  })
}
