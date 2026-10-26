# 포크 변경 내역 (FORK_CHANGES)

## 출처

| 항목 | 내용 |
|---|---|
| 원본 저장소 | https://github.com/youngsooco/k-mail-mcp |
| 원본 라이선스 | MIT License |
| 기준 커밋 | [`5af081888fd323c7f9127acf71471fbd91a907fe`](https://github.com/youngsooco/k-mail-mcp/commit/5af081888fd323c7f9127acf71471fbd91a907fe) — "feat: Dockerfile 추가 — Docker 컨테이너 배포 지원 (RTM-2026-027)" (2026-04-16) |
| 원본 버전 | package.json 기준 1.4.5 |
| 이 포크 | https://github.com/porketta-beam/k-mail-mcp (1.0.0) |

## 포크한 이유

원본은 6개 메일 서비스, 원격 HTTP/OAuth 모드, Claude Haiku API 스팸 판단, 자동 카테고리 생성까지 갖춘 범용 서버입니다.
이 포크는 **"집 Windows PC에서, 네이버·다음 메일의 최근 24시간치를 Claude 예약 작업이 읽어 분류한다"** 는 한 가지 용도에 맞춰
필요 없는 기능과 외부 통신을 걷어내고, 코드 검토에서 발견한 문제를 고쳤습니다.

## 변경 사항 요약

### 1. 제거한 기능

| 제거 대상 | 원본 위치 | 이유 |
|---|---|---|
| 원격 HTTP + OAuth 2.0 모드 | `index.js` 하단, `oauth.js` | 로컬(stdio)로만 사용. 원본은 `MCP_API_KEY` 미설정 시 인증 없이 `0.0.0.0` 에 열려 누구나 메일을 읽을 수 있었음 |
| Claude Haiku API 스팸 판단 | `index.js` `claudeHaikuJudge()` | 분류는 예약 작업의 Claude가 수행. 메일 발신자·제목·미리보기를 외부 API로 보내지 않기 위함 |
| `generate_categories` 도구 | `index.js` | Anthropic API 키가 필요한 기능 |
| Spamhaus DNSBL 조회 | `index.js` `checkDNSBL()` | 발신자 도메인이 DNS 질의로 외부에 노출되지 않도록 |
| `reset_last_run` 도구 · `last_run.json` | `index.js` | "마지막 확인 이후" 방식을 "최근 N시간" 방식으로 대체 (아래 2번) |
| Gmail · 네이트 · 야후 · iCloud 설정 | `index.js` `PRESETS` | Gmail은 공식 커넥터 사용. 나머지는 미사용 |
| API 키 설정 메뉴 | `setup.ps1`, `setup-worker.js` | 위 Haiku 기능 제거에 따름 |
| macOS/Linux 스크립트 | `install.sh`, `setup.sh` | Windows 전용. 원본 `setup.sh` 는 `install.sh` 의 복사본이라 계정 등록이 불가능했고, 정의 전 변수를 내보내 Claude 설정에 잘못된 경로를 기록하는 문제가 있었음 |
| `Dockerfile` | — | HTTP 모드 전용 |
| GitHub Actions 3종 | `.github/` | 원본 저장소의 Anthropic API 키(secrets)를 쓰는 PR 리뷰·이슈 응답·릴리스 노트 자동화. 포크에서는 불필요 |
| 원본 문서 | `INSTALL_GUIDE.md`, `PHILOSOPHY.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `.env.example` | 제거된 기능을 설명하는 내용이 많아 혼동 방지. 원본 저장소에서 볼 수 있음 |

### 2. 바뀐 동작

| 항목 | 원본 | 이 포크 |
|---|---|---|
| 조회 범위 | 마지막 실행 이후 + **안 읽은 메일만**. 호출할 때마다 기준 시각이 갱신됨 | **최근 N시간**(기본 24, 최대 168). 읽은 메일 포함 여부 선택(`include_read`, 기본 true). 호출해도 상태가 바뀌지 않아 결과가 재현됨 |
| TLS 인증서 검증 | 모든 서비스에서 **꺼짐** (`rejectUnauthorized: false`, Gmail CA 호환 목적) | **켜짐**. 필요 시 `KMAIL_TLS_INSECURE=1` 로만 끌 수 있음 |
| 지원 서비스 | 6개 | 네이버, 다음(daum/hanmail), **카카오메일(kakao.com) 추가** |
| 하위 폴더 | 최상위 폴더만 | 하위 폴더까지 `상위/하위` 형태로 탐색 (선택 불가 폴더 제외) |
| 메일 식별 | 결과의 `uid` 와 폴더 정보가 흩어져 있어 다른 폴더 메일 본문 조회가 번거로움 | 각 메일에 `account`, `mailbox`, `uid` 를 함께 반환해 `read_email` 에 그대로 사용 |
| 반환 필드 | — | `to`, `cc`, `isRead`, `isFlagged`, `hasAttachments` 추가. 본문 조회 시 첨부파일 목록 포함 |
| 프롬프트 인젝션 완화 | 외부 API로 보낼 때만 필터 적용 | 발신자·제목·미리보기·본문 모두 필터 적용, 본문은 "데이터" 표시로 감쌈 |
| 메일 미리보기·본문 | HTML 태그를 단순 정규식으로 제거 (500자 넘는 태그·HTML 주석이 그대로 남음) | HTML 주석·`<style>`·`<script>` 를 먼저 지우고 태그·주요 엔티티 정리 |
| 스팸 패턴 | `you.*won` 처럼 단어 경계가 없어 "dowon", "You are receiving…" 등이 오탐 | 단어 경계(`\b`)를 넣어 실제 문구만 감지 |
| Reply-To 불일치 | 도메인 문자열이 조금만 달라도 불일치 (`reply.github.com` ≠ `github.com`) | 기본 도메인(`github.com`, `*.co.kr` 고려)으로 비교, Zendesk 등 고객지원 대행 서비스는 정상 처리 |
| 기본 제외 폴더 | — | `보낸편지함`, `스팸메일함` 추가 |
| 오류 처리 | 일부 도구에서 IMAP 오류가 그대로 예외로 전파 | 모든 도구가 JSON 오류로 응답. 한 계정 로그인 실패가 다른 계정 결과를 막지 않음 |

### 3. 설치/설정 스크립트

| 파일 | 변경 |
|---|---|
| `setup.ps1` | 한국어 전용, 서비스 1~3번만, 잘못된 번호·이메일 형식 거부, 앱 비밀번호 발급 경로 안내 |
| `setup-worker.js` | 잘못된 서비스 번호를 조용히 "daum"으로 바꾸던 동작 → 오류로 거부. 계정 파일을 임시파일 후 교체(atomic) 방식으로 저장 |
| `install.ps1` | 한국어 전용, MSIX(스토어) 설치 경로를 와일드카드로 탐색, **기존 `claude_desktop_config.json` 을 `.bak` 으로 백업** 후 수정, `npm install --omit=dev` |
| `.gitattributes` | `*.ps1` CRLF 규칙 추가 |
| `.gitignore` | 개인정보 파일(`.master.key`, `accounts.enc.json`, `watched_mailboxes.json`) 목록 정리 |

### 4. 패키지 · 라이선스

- `package.json`: 이름 `k-mail-mcp-naver-daum`, 버전 1.0.0, `express` 직접 의존성 제거, 원본 주소(`upstream`) 명시. `package-lock.json` 재생성
  (참고: `express` 는 MCP SDK 내부 의존성으로 lock 파일에 남아 있지만 이 포크 코드에서는 사용하지 않음)
- `LICENSE`: 원본에 남아 있던 병합 충돌 표시(`<<<<<<<` / `>>>>>>>`)를 정리하고, 원본에 표기된 저작권자(youngsooco, dadfkim)를 모두 유지한 채 포크 수정자 표기를 추가

## 파싱/분류 수정 (2026-10-26)

- 코드 구조: 루트 `index.js` 는 MCP 도구 등록만 하고 나머지는 `app/` 로 분리 (설정 `app/config.js`, 프롬프트 `app/prompts.js`). 실행 경로는 그대로라 재설치 불필요
- 키워드 카테고리 분류(`category`, `categories.json`) 제거 — 오분류가 잦았고, 분류는 Claude 가 from·subject·snippet·mailbox 로 직접 하는 편이 정확함
- `isNewsletter`·`spamScore`·`isSpam`·`spamSuspected` 제거 — 내용 기반 판단이라 Claude 가 직접 하는 편이 정확함 (기존 `isNewsletter` 는 mailparser 가 `List-*` 헤더를 `headers.get("list")` 로 옮기는 탓에 항상 false 였음)
- `auth`: 같은 이름의 헤더를 모두 읽고 `ARC-Authentication-Results`·`Received-SPF`(다음) 도 사용. 수신 서버(naver.com·daum.net)가 단 헤더만 신뢰. "인증헤더없음" / "인증헤더 해석실패" 구분
- `replyToDiffers`: 고객지원 서비스(zendesk 등) 화이트리스트가 결과를 false 로 덮어쓰던 것을 분리 → `replyToKnownService` 필드. 도메인 비교는 `tldts`(Public Suffix List)
- 프롬프트 인젝션 방어: read_email 전 헤더 필드 필터, 호출마다 바뀌는 무작위 경계로 본문·snippet 래핑(본문 속 가짜 경계 제거), 응답에 boundary·notice. HTML 숨김 요소(display:none 등)는 내용까지 제거
- 재현 테스트: `tests/analyze.test.js`·`tests/sanitize.test.js`·`tests/html.test.js` (`npm test`, 가짜 픽스처)

## 원본에서 그대로 유지한 부분

- 계정 정보 AES-256-GCM 암호화 저장 방식과 파일 형식 (`accounts.enc.json`, `.master.key`) — 원본에서 등록한 계정 파일도 그대로 읽힘 (네이버/다음 계정만 사용)
- 감시 폴더 자동 탐색·제외 관리 (`watched_mailboxes.json`, `list_mailboxes` / `get_watched_mailboxes` / `set_watched_mailboxes`)
- 의존성: `@modelcontextprotocol/sdk`, `imap`, `mailparser`, `zod` (+ 포크에서 `tldts` 추가 — 등록 도메인 비교용)

## 검증

로컬 테스트 IMAP 서버로 다음 21개 항목을 확인했습니다: 계정 등록·암호화 저장·잘못된 입력 거부, 도구 6개 노출(발송/삭제 도구 없음),
TLS 검증 기본값, 24시간 범위 필터(3일 전 메일 제외), 읽은 메일 포함/제외, 하위 폴더 포함·보낸메일함 제외, 반복 호출 시 동일 결과,
본문 읽기 후에도 읽음 처리 안 됨, 피싱 신호 감지, 로그인 실패 계정 격리. PowerShell 스크립트는 문법 검사와 설정 파일 병합(기존 항목 보존·백업) 테스트를 거쳤습니다.
실제 네이버/다음 서버 접속은 사용자 PC에서 확인합니다.
