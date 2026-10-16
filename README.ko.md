# wj-mods

[English](README.md) · 한국어

Claude Code 화면과 알림을 바꾸는 mod 모음이에요. 필요한 것만 골라 설치하면 돼요.

| mod | 하는 일 |
|---|---|
| `work-progress` | 여러 세션의 업무 진행도를 입력창 위 한 줄과 `/progress` 패널로 모아 보여 줘요. 서브에이전트와 최근 활동도 함께 보여요. |
| `usage-band` | 입력창 위 오른쪽에 5시간·주간 사용량과 Claude status 를 한 줄로 보여 줘요. |
| `long-turn-notify` | 2분 넘게 걸린 작업이 끝나거나 선택 창·권한 확인 창이 뜨면 맥 알림과 음성으로 알려 줘요. macOS 전용이에요. |
| `session-nickname` | 새 세션에 랜덤 이름을 붙여 `@이름` 으로 SendMessage 할 수 있게 해요. |
| `turn-divider` | 내가 보낸 질문 위에 구분선을 그어 질문과 답의 경계를 보이게 해요. |
| `plain-summary` | 보고서처럼 긴 답변 아래에 작은 모델이 쓴 두 줄 요약을 붙여요. |
| `compact-tool-rows` | Bash 실행 줄의 긴 명령을 첫 줄 앞부분만 보이게 줄여요. |

## 설치

### 마켓플레이스로 설치

```sh
claude plugin marketplace add wonjangcloud9/wj-mods
claude plugin install work-progress@wj-mods
```

다른 mod 도 `<mod 이름>@wj-mods` 로 설치해요. 설치한 뒤 새로 여는 세션부터 적용돼요.

업데이트는 아래처럼 해요.

```sh
claude plugin marketplace update wj-mods
claude plugin update work-progress@wj-mods
```

### 폴더로 직접 불러오기

저장소를 내려받은 뒤, 쓸 mod 폴더를 `~/.claude/settings.json` 의 `CLAUDE_CODE_PLUGIN_DIRS` 에 `:` 로 이어 적어요.

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

이 방식은 `git pull` 로 받은 변경이 바로 반영되고, 열려 있는 세션에서도 hot reload 를 켜면 다시 불러와요.

## 참고

- `long-turn-notify` 는 처음 알릴 때 맥 `say` 의 Yuna 음성으로 알림 문장을 녹음해 `~/.claude/long-turn-notify/sounds/` 에 둬요. Yuna 음성이 없으면 소리 없이 알림만 떠요.
- `work-progress` 는 업무 기록을 `~/.claude/work-progress/` 에 남겨요. 이 기록은 내 컴퓨터 안에서만 쓰고 밖으로 보내지 않아요.
- `plain-summary` 는 긴 답변마다 작은 모델을 한 번 불러요. 그만큼 사용량에 들어가요.
- Claude Code 2.1.301 에서 확인했어요.
- 테스트는 `claude plugin test <mod 폴더>` 로 돌려요.

## 라이선스

MIT
