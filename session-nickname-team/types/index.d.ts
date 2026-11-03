export type Nickname = string

declare module 'claude-code' {
  interface PluginState {
    'session-nickname-team': { name: Nickname }
  }
}
