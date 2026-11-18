declare module 'claude-code' {
  interface PluginState {
    'command-favorites': { repo: string; favs: string[]; expanded: boolean }
  }
}
