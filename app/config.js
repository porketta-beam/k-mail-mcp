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
export const CATEGORIES_FILE        = path.join(ROOT, "categories.json");
export const WATCHED_MAILBOXES_FILE = path.join(ROOT, "watched_mailboxes.json");

// ══════════════════════════════════════════════════════
// IMAP 접속 정보
// ══════════════════════════════════════════════════════
export const PRESETS = {
  naver: { host: "imap.naver.com", port: 993, tls: true, web: "https://mail.naver.com/" },
  daum:  { host: "imap.daum.net",  port: 993, tls: true, web: "https://mail.daum.net/" },
  kakao: { host: "imap.kakao.com", port: 993, tls: true, web: "https://mail.kakao.com/" },
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
// 분류 / 스팸 신호
// ══════════════════════════════════════════════════════
export const DEFAULT_CATEGORY_RULES = [
  { name:"💼 업무/비즈니스", keywords:["invoice","견적","계약","미팅","회의","프로젝트","업무","협업","slack","notion","jira","zoom","meet"] },
  { name:"🔐 보안/인증",     keywords:["인증","로그인","비밀번호","보안","otp","verify","password","security","alert"] },
  { name:"💰 금융/결제",     keywords:["입금","출금","결제","거래","카드","계좌","은행","증권","환급","세금","보험"] },
  { name:"🛒 쇼핑/배송",     keywords:["주문","배송","도착","쿠팡","네이버쇼핑","11번가","order","shipped","tracking"] },
  { name:"📣 광고/프로모션", keywords:["할인","쿠폰","이벤트","특가","혜택","포인트","적립","sale","promotion"] },
  { name:"📰 뉴스레터",      keywords:["뉴스","news","daily","weekly","digest","newsletter","브리핑"], newsletterOnly:true },
];

export const SPAM_PATTERNS = [
  { re:/당첨|무료\s*증정|사은품|경품\s*당첨/i, score:40 },
  { re:/대출|신용\s*대출|급전|당일\s*대출/i,   score:50 },
  { re:/\byou(\s+have)?\s+won\b|\bclaim\s+(your\s+)?prize\b|\bfree\s+gift\b/i, score:45 },
  { re:/계정.*정지|계정.*차단|비밀번호.*재설정.*요청/i, score:55 },
  { re:/account.*suspended.*verify|password.*reset.*required/i, score:55 },
  { re:/카드.*정보.*유출|개인정보.*유출.*확인/i, score:60 },
];
export const SPAM_THRESHOLD = 70;

// 메일 발송 대행/고객지원 서비스 (Reply-To 가 달라도 흔한 정상 패턴)
export const TRUSTED_REPLY_HOSTS = ["zendesk.com", "freshdesk.com", "intercom-mail.com", "helpscout.net", "hubspot.com", "salesforce.com"];

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
