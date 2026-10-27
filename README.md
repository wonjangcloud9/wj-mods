# wj-mods

English · [한국어](README.ko.md)

A set of Claude Code mods that change the terminal UI and notifications. They are plugins with hook modules, installable one by one from this marketplace.

The UI text, notifications and summaries are written in Korean.

| Mod | What it does |
|---|---|
| `work-progress` | Collects multi-step work from every open session into a line above the prompt and a `/progress` pane. Each task's steps are drawn as a chain of nodes that opens into a vertical flow. It also keeps follow-ups left after a task is done, what a paused task is waiting for, and subagent records that ended without being closed. Each open task shows the time likely left, judged from how long its own steps and your recent tasks' steps took. Tasks and follow-ups show the days left until their due date, colored when overdue or close. The "done today" section clears at 9 AM every day. `/progress 요약` writes a summary of the last 24 hours. |
| `plain-korean` | A Korean readability bundle. An output style for short, plain Korean answers (conclusion first, no made-up abbreviations, nothing referred to by number alone), a guard that flags answers that slip into English and corrects the next one, a nudge to re-explain when you type "뭔 말" or "짧게", and the `claude-warm` theme. Installing it also installs `plain-summary`, `turn-divider` and `compact-tool-rows`. |
| `usage-band` | Shows 5-hour and weekly usage and the Claude status page state in one line above the prompt. |
| `long-turn-notify` | Sends a macOS notification and plays a voice line when a turn ran longer than 2 minutes, or when a question or permission prompt is waiting. macOS only. |
| `session-nickname` | Gives each new session a random name so other sessions can address it with SendMessage. The name reaches the session list with the first prompt. |
| `turn-divider` | Draws a divider above each of your prompts to separate questions from answers. |
| `plain-summary` | Adds a two-sentence plain-language summary under long, report-style answers, written by a small model. |
| `compact-tool-rows` | Shortens long Bash commands in tool rows to the start of the first line. |

`work-progress` pane:

```
업무 3개 · ● 작업 중 1 · □ 남은 일 1 · ✓ 오늘 완료 1

── ● 작업 중 1 ─────────────────────────────────────────────
▸ Theme builder spec
  ●━●━◉─○─○─○ 2/6 · 약 2시간 남음 · 이 단계 1시간째 · 5분 전 · @quiet-otter
  지금: Write the requirements
  최근: Bash Run the mod's tests · 방금
  └ ● Benchmark AI app builders 1/8 · 최근: WebSearch Lovable docs
  └ ‖ Seed starter audit 3/4 · 보류로 끝남 · only saving the file is left
  └ ✓ 서브에이전트 5개 끝남

── □ 남은 일 1 ─────────────────────────────────────────────
▸ Fix lost attachments · 1일 전
  □ push
── ✓ 오늘 완료 1 ───────────────────────────────────────────
▸ Release notes draft · 2시간 전
```

Click a task to open its steps as a flow, with the time each step took and its evidence:

```
▾ Theme builder spec
  ● Read the brief · 40분 — notes in brief.md
  ┃
  ● Benchmark · 1시간 20분 — 3 reports
  ┃
  ◉ Write the requirements  ← 지금
  │
  ○ Design
```

## Install

From the marketplace:

```sh
claude plugin marketplace add wonjangcloud9/wj-mods
claude plugin install work-progress@wj-mods
```

Install other mods the same way with `<mod>@wj-mods`. They load in sessions started after installing.

The Korean readability bundle installs `plain-summary`, `turn-divider` and `compact-tool-rows` with it:

```sh
claude plugin install plain-korean@wj-mods
```

The output style and the theme are not switched on for you. Choose `plain-korean` as the output style in `/config`, and `claude-warm` in `/theme` if you want the colors too.

From a local clone, list the mod folders in `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, separated by `:`. Folders listed this way do not pull in dependencies, so list the bundle's three mods as well:

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
