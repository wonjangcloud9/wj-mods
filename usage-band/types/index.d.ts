export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type ClaudeStatusLevel = 'pending' | 'ok' | 'minor' | 'major' | 'maintenance' | 'unknown'

export type ClaudeStatus = { level: ClaudeStatusLevel; detail?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { limits: Limit[]; claude: ClaudeStatus; now: number }
  }
}
