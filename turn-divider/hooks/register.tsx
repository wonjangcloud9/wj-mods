import type { PromptOrigin, Register } from 'claude-code'

// 사람이 직접 보낸 프롬프트와 mod 가 사람 대신 보낸 답장만 나눈다.
// 작업 알림이나 다른 세션의 메시지에는 긋지 않는다.
const OWN_PROMPT = new Set(['composer', 'bridge'])

function isOwnPrompt(origin: PromptOrigin): boolean {
  return OWN_PROMPT.has(origin.kind) || (origin.kind === 'plugin' && origin.asUser === true)
}

const FALLBACK_COLUMNS = 80
// 선이 화면 폭과 같으면 터미널이 다음 줄로 넘길 수 있어 조금 짧게 긋는다.
const EDGE_CELLS = 2
// 테마 이름으로 칠해 테마를 바꾸면 같이 따라간다.
const ACCENT = 'claude'
// 터미널의 엔진 질문 줄은 위에 빈 줄 하나를 품고 있어, 막대를 그만큼 내려야 글자 줄에 붙는다.
const ENGINE_ROW_TOP_GAP = 1

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const row = await next(e)
    if (!isOwnPrompt(e.props.origin)) return row

    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(1, (e.viewport?.columns ?? FALLBACK_COLUMNS) - EDGE_CELLS)

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor wrap="truncate-end">{'─'.repeat(width)}</Text>
        <Box flexDirection="row">
          <Box key="bar" marginTop={e.surface === 'terminal' ? ENGINE_ROW_TOP_GAP : 0}>
            <Text color={ACCENT} bold>{'▌ '}</Text>
          </Box>
          <Box flexGrow={1}>{row}</Box>
        </Box>
      </Box>
    )
  })
}
