# wj-mods

[English](README.md) · 한국어

Claude Code 화면과 알림을 바꾸는 mod 모음이에요. 필요한 것만 골라 설치하면 돼요.

| mod | 하는 일 |
|---|---|
| `work-progress` | 여러 세션의 업무 진행도를 입력창 위 한 줄과 `/progress` 패널로 모아 보여 줘요. 단계를 노드로 이어 그리고, 누르면 세로 흐름으로 펼쳐져요. 완료 뒤 남은 일, 보류한 업무가 기다리는 것, 닫히지 않고 끝난 서브에이전트 기록도 챙겨요. `/progress 요약` 은 최근 24시간 업무를 글로 정리해요. |
| `plain-korean` | 한국어 가독성 묶음이에요. 결론부터, 지어낸 줄임말과 번호만 부르기 없이 짧게 답하는 답변 스타일, 답변이 영어로 새면 경고하고 다음 답을 바로잡는 규칙, "뭔 말"·"짧게"라고 하면 쉽게 다시 설명하게 하는 규칙, `claude-warm` 테마가 들어 있어요. 설치하면 `plain-summary`, `turn-divider`, `compact-tool-rows` 도 함께 깔려요. |
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

한국어 가독성 묶음은 `plain-summary`, `turn-divider`, `compact-tool-rows` 까지 한 번에 설치해요.

```sh
claude plugin install plain-korean@wj-mods
```

답변 스타일과 테마는 저절로 바뀌지 않아요. `/config` 의 출력 스타일에서 `plain-korean` 을 고르고, 색도 바꾸고 싶으면 `/theme` 에서 `claude-warm` 을 골라요.

업데이트는 아래처럼 해요.

```sh
claude plugin marketplace update wj-mods
claude plugin update work-progress@wj-mods
```

### 폴더로 직접 불러오기

저장소를 내려받은 뒤, 쓸 mod 폴더를 `~/.claude/settings.json` 의 `CLAUDE_CODE_PLUGIN_DIRS` 에 `:` 로 이어 적어요. 이 방식은 함께 깔리는 mod 를 챙기지 않으니, 묶음을 쓰려면 세 mod 폴더도 같이 적어요.

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
