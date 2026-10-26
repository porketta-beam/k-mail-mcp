# K-Mail-MCP (네이버 · 다음 읽기 전용 포크)

> **출처 안내**
> 이 저장소는 **[youngsooco/k-mail-mcp](https://github.com/youngsooco/k-mail-mcp)** (MIT License)를 포크해 수정한 버전입니다.
> 원본 커밋 [`5af0818`](https://github.com/youngsooco/k-mail-mcp/commit/5af081888fd323c7f9127acf71471fbd91a907fe) (2026-04-16)을 기준으로 했으며,
> 무엇을 왜 바꿨는지는 **[FORK_CHANGES.md](./FORK_CHANGES.md)** 에 모두 적어 두었습니다.
> 원본 기능(Gmail·네이트·야후·iCloud 지원, 원격 HTTP 모드, AI 스팸 판단 등)이 필요하면 원본 저장소를 사용하세요.

네이버 · 다음(한메일) · 카카오메일을 **IMAP 읽기 전용**으로 연결해, Claude가 **최근 24시간 메일**을 모아 분류·요약할 수 있게 해 주는 로컬 MCP 서버입니다.
Gmail은 Claude의 공식 Gmail 커넥터로 처리한다는 전제로 만들었습니다.

## 이 포크가 하는 일 / 하지 않는 일

| 합니다 | 하지 않습니다 |
|---|---|
| 최근 N시간(기본 24시간) 메일 목록 + 미리보기 | 메일 발송, 답장, 초안 저장 |
| 메일 본문 읽기 | 삭제, 이동, 읽음 처리 |
| 받은편지함 외 사용자 폴더까지 스캔 (보낸메일함·스팸함 등 제외) | 외부 API 호출 (Anthropic API, Spamhaus 등) |
| 로컬 규칙으로 카테고리·피싱 신호 표시 | 원격(HTTP) 접속 허용 |

- 메일함을 **읽기 전용(EXAMINE)** 으로 열기 때문에 Claude가 읽어도 메일이 '읽음'으로 바뀌지 않습니다.
- 몇 번을 호출해도 같은 기간이면 같은 결과를 돌려줍니다. (원본의 "마지막 확인 이후" 방식 제거)
- 실행할 때마다 기기 밖으로 나가는 통신은 각 메일사 IMAP 서버(993/TLS)뿐입니다.

## 요구 사항

- Windows 10/11
- [Node.js](https://nodejs.org) 18 이상 (LTS 권장)
- Claude 데스크톱 앱
- 네이버 / 다음·카카오 **앱 비밀번호** (일반 로그인 비밀번호로는 IMAP 접속이 안 됩니다)

## 설치

```powershell
git clone https://github.com/porketta-beam/k-mail-mcp.git
cd k-mail-mcp
.\install.bat      # npm 설치 + Claude 데스크톱 설정 등록 (기존 설정은 .bak 으로 백업)
.\setup.bat        # 계정 등록
```

그다음 Claude 데스크톱 앱을 **완전히 종료**(작업 표시줄 트레이 아이콘까지)한 뒤 다시 실행하세요.

### 1) 메일 서비스에서 IMAP 켜기 + 앱 비밀번호 발급

**네이버**
1. 네이버 메일 → 환경설정 → POP3/IMAP 설정 → **IMAP/SMTP 사용함** 저장
2. [nid.naver.com](https://nid.naver.com) → 보안설정 → 2단계 인증 관리 → **애플리케이션 비밀번호** 생성

**다음(daum.net / hanmail.net) · 카카오메일(kakao.com)**
1. 다음메일 [IMAP/POP3 설정](https://mail.daum.net/setting/POP3IMAP) (카카오메일은 [여기](https://mail.kakao.com/setting/POP3IMAP)) → **IMAP 사용함** 저장
2. [accounts.kakao.com](https://accounts.kakao.com) → 계정 보안 → 2단계 인증 → **앱 비밀번호** 생성
   (2025-01-02부터 다음/카카오 IMAP 로그인은 앱 비밀번호가 필수입니다)

### 2) setup.bat 으로 계정 등록

```
1) 계정 추가 / 수정
   서비스 번호: 1) 네이버  2) 다음(daum/hanmail)  3) 카카오메일
   이메일 주소 / 앱 비밀번호 / 라벨(예: 네이버개인)
```

이메일과 앱 비밀번호는 AES-256-GCM으로 암호화되어 `accounts.enc.json` 에 저장되고, 키는 같은 폴더의 `.master.key` 에 있습니다.
**두 파일은 절대 공유하거나 커밋하지 마세요** (`.gitignore` 에 등록되어 있습니다). 폴더에 접근할 수 있는 사람은 복호화할 수 있다는 점도 기억해 주세요.

## MCP 도구

| 도구 | 설명 |
|---|---|
| `list_accounts` | 등록된 계정 목록 (비밀번호 제외) |
| `check_new_mails` | 최근 N시간 메일 수집. `hours`(기본 24, 최대 168), `include_read`(기본 true), `account_label`(기본 all) |
| `read_email` | 메일 본문 읽기. `check_new_mails` 결과의 `account`, `mailbox`, `uid` 를 그대로 사용 |
| `list_mailboxes` | 계정의 IMAP 폴더와 스캔 대상/제외 현황 |
| `get_watched_mailboxes` | 계정별 스캔 폴더 현황 |
| `set_watched_mailboxes` | 스캔 제외 폴더 추가/해제/초기화 |

사용 예: *"네이버 다음 메일 최근 24시간 확인해서 긴급도별로 묶어줘"*

## 설정 옵션

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `KMAIL_TLS_INSECURE` | (없음) | `1` 이면 TLS 인증서 검증을 끕니다. 회사 프록시 등으로 접속이 안 될 때만 사용하세요. |

`categories.json` 을 수정하면 카테고리 분류 키워드를 바꿀 수 있습니다.

## 라이선스

MIT License — [LICENSE](./LICENSE) 참고. 원작자(youngsooco)의 저작권 표시를 유지합니다.
