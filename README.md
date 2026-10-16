# wj-mods

English · [한국어](README.ko.md)

A set of Claude Code mods that change the terminal UI and notifications. They are plugins with hook modules, installable one by one from this marketplace.

The UI text, notifications and summaries are written in Korean.

| Mod | What it does |
|---|---|
| `work-progress` | Collects multi-step work from every open session into a line above the prompt and a `/progress` pane: progress bar per task, running subagents, and the last tool each session used. |
| `usage-band` | Shows 5-hour and weekly usage and the Claude status page state in one line above the prompt. |
| `long-turn-notify` | Sends a macOS notification and plays a voice line when a turn ran longer than 2 minutes, or when a question or permission prompt is waiting. macOS only. |
| `session-nickname` | Gives each new session a random name so other sessions can address it with SendMessage. |
| `turn-divider` | Draws a divider above each of your prompts to separate questions from answers. |
| `plain-summary` | Adds a two-sentence plain-language summary under long, report-style answers, written by a small model. |
| `compact-tool-rows` | Shortens long Bash commands in tool rows to the start of the first line. |

`work-progress` pane:

```
업무 4개 · ● 작업 중 2 · ○ 멈춤 1 · ✓ 오늘 완료 1
● 작업 중 Theme builder spec
    ━━━━──────── 2/8 · 5분 전 · @quiet-otter
    최근: Bash Run the mod's tests · 방금
    └ ● Benchmark AI app builders 1/8 · 최근: WebSearch Lovable docs
    └ ✓ 서브에이전트 5개 끝남
── 오늘 완료 1 ──────────────────────
✓ Release notes draft · 2시간 전
```

## Install

From the marketplace:

```sh
claude plugin marketplace add wonjangcloud9/wj-mods
claude plugin install work-progress@wj-mods
```

Install other mods the same way with `<mod>@wj-mods`. They load in sessions started after installing.

From a local clone, list the mod folders in `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, separated by `:`:

```sh
git clone https://github.com/wonjangcloud9/wj-mods.git ~/wj-mods
```

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/me/wj-mods/work-progress:/Users/me/wj-mods/usage-band"
  }
}
```

## Notes

- Tested with Claude Code 2.1.301.
- `long-turn-notify` records its voice lines with the macOS `say` Yuna voice on first use and keeps them in `~/.claude/long-turn-notify/sounds/`. Without that voice it shows the notification silently.
- `plain-summary` calls a small model once per long answer, which counts toward your usage.
- `work-progress` keeps its records in `~/.claude/work-progress/` on your machine.
- Run a mod's tests with `claude plugin test <mod folder>`.

## License

MIT
