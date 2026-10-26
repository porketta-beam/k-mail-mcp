// 설정 값 모음 — 동작을 바꾸고 싶으면 이 파일만 고치면 됩니다.
import path from "path";
import { fileURLToPath } from "url";

export const VERSION = "1.0.0-fork (based on k-mail-mcp 1.4.5)";

// ══════════════════════════════════════════════════════
// 파일 경로 (런타임 파일은 프로젝트 루트에 둡니다 — setup-worker.js 와 공유)
// ══════════════════════════════════════════════════════
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ACCOUNTS_FILE          = path.join(ROOT, "accounts.enc.json");
export const KEY_FILE               = path.join(ROOT, ".master.key");
export const WATCHED_MAILBOXES_FILE = path.join(ROOT, "watched_mailboxes.json");

// ══════════════════════════════════════════════════════
// IMAP 접속 정보
// ══════════════════════════════════════════════════════
// authDomains: 인증 헤더(Authentication-Results 등)를 믿을 수신 서버의 등록 도메인.
//   naver = mx.naver.com, daum = mx.daum.net (실제 헤더로 확인). kakao 는 다음 인프라로 추정 — 미확인.
export const PRESETS = {
  naver: { host: "imap.naver.com", port: 993, tls: true, web: "https://mail.naver.com/", authDomains: ["naver.com"] },
  daum:  { host: "imap.daum.net",  port: 993, tls: true, web: "https://mail.daum.net/",  authDomains: ["daum.net"] },
  kakao: { host: "imap.kakao.com", port: 993, tls: true, web: "https://mail.kakao.com/", authDomains: ["daum.net", "kakao.com"] },
};

// TLS 인증서 검증은 기본으로 켜 둡니다.
// 정말로 끄고 싶을 때만 환경변수 KMAIL_TLS_INSECURE=1 을 설정하세요.
export const TLS_INSECURE = process.env.KMAIL_TLS_INSECURE === "1";

// ══════════════════════════════════════════════════════
// 감시 폴더
// ══════════════════════════════════════════════════════
export const MAX_DISCOVERED_SIZE = 100;
export const DEFAULT_EXCLUDED_FOLDERS = [
  "Sent Messages", "Sent",        "보낸메일함",   "보낸편지함",
  "Drafts",        "임시보관함",   "초안",
  "Deleted Messages", "Trash",    "휴지통",
  "Junk",          "Spam",        "스팸편지함",   "스팸메일함",
  "Notes",
  "내게쓴메일함",  "내게쓴편지함",
  "예약편지함",
];

// ══════════════════════════════════════════════════════
// Reply-To 신호
// ══════════════════════════════════════════════════════
// 고객지원/마케팅 답장 서비스 — Reply-To 가 달라도 흔한 정상 패턴이라 replyToKnownService 로 따로 표시
export const KNOWN_REPLY_SERVICES = ["zendesk.com", "freshdesk.com", "intercom-mail.com", "helpscout.net", "hubspot.com", "salesforce.com"];

// ══════════════════════════════════════════════════════
// 프롬프트 인젝션 완화 패턴
// ══════════════════════════════════════════════════════
export const INJECTION_PATTERNS = [
  /\[SYSTEM\]/gi, /\[INST\]/gi, /\[\/INST\]/gi,
  /<\/?system>/gi, /<\/?instruction>/gi,
  /ignore\s+(all\s+)?previous\s+instructions?/gi,
  /you\s+are\s+now\s+(a\s+)?/gi,
  /new\s+(system\s+)?instructions?:/gi,
  /###\s*instruction/gi, /\[OVERRIDE\]/gi, /\[JAILBREAK\]/gi,
  /assistant:\s*i\s+will/gi,
  /disregard\s+(all\s+)?(prior|previous|above)/gi,
];
