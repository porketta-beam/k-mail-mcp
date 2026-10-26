// 메일 1통의 헤더 기반 신호 (네트워크 호출 없음)
// 분류는 하지 않습니다 — from·subject·snippet·mailbox 를 보고 Claude 가 판단합니다.
import { getDomain } from "tldts";
import { SPAM_PATTERNS, SPAM_THRESHOLD, KNOWN_REPLY_SERVICES } from "./config.js";

const RESULTS = "pass|fail|softfail|none|neutral|temperror|permerror|policy";
const AUTH_HEADERS = ["authentication-results", "arc-authentication-results", "received-spf"];

// 같은 이름의 헤더를 모두, 접힌 줄을 펴서 소문자로 반환 (위에 있는 헤더가 먼저)
function headerValues(m, key) {
  return (m.headerLines || [])
    .filter(h => h.key === key)
    .map(h => h.line.slice(h.line.indexOf(":") + 1).replace(/\r?\n[ \t]+/g, " ").trim().toLowerCase());
}
// 헤더를 단 서버(authserv-id) — 수신 서버가 단 헤더만 믿기 위해 사용
function authServId(key, v) {
  if (key === "received-spf") return v.match(/\(([\w.-]+?):/)?.[1] || "";
  if (key === "arc-authentication-results") v = v.replace(/^i=\d+;\s*/, "");
  return v.split(";")[0].trim().split(/\s+/)[0];
}

// trustedDomains: 수신 서버의 등록 도메인 (예: ["naver.com"]). 발신자가 끼워 넣은 위조 헤더는 무시합니다.
export function parseAuth(m, trustedDomains) {
  const auth = { spf: null, dkim: null, dmarc: null };
  let found = false;
  for (const key of AUTH_HEADERS) {
    for (const v of headerValues(m, key)) {
      if (!trustedDomains.includes(getDomain(authServId(key, v)))) continue;
      found = true;
      if (key === "received-spf") { auth.spf ??= v.match(new RegExp(`^(${RESULTS})\\b`))?.[1] ?? null; continue; }
      for (const k of ["spf", "dkim", "dmarc"])
        auth[k] ??= v.match(new RegExp(`\\b${k}=(${RESULTS})\\b`))?.[1] ?? null;
    }
  }
  const text = [auth.spf && `SPF:${auth.spf}`, auth.dkim && `DKIM:${auth.dkim}`, auth.dmarc && `DMARC:${auth.dmarc}`]
    .filter(Boolean).join(" | ");
  return { ...auth, text: text || (found ? "인증헤더 해석실패" : "인증헤더없음") };
}

export function spamScore(from, subject, snippet, auth) {
  let s = 0;
  const text = `${from} ${subject} ${snippet}`;
  for (const { re, score } of SPAM_PATTERNS) if (re.test(text)) s += score;
  if (auth.spf === "fail") s += 35; else if (auth.spf === "softfail") s += 15;
  if (auth.dkim === "fail") s += 30;
  if (auth.dmarc === "fail") s += 25;
  return Math.min(s, 100);
}

const regDomain = addr => getDomain(addr.split("@")[1] || "") || "";

// mailparser 는 List-* 헤더를 headers.get("list") 로 옮겨 담습니다 ("list-unsubscribe" 로는 안 나옴)
export function isNewsletter(m, text) {
  const list = m.headers?.get("list");
  return !!(list?.unsubscribe || list?.id) || /수신\s*거부|unsubscribe/i.test(text || "");
}

export function analyzeMail(m, { text = "", snippet = "", trustedAuthDomains = [] } = {}) {
  const from      = m.from?.text || "";
  const subject   = m.subject || "";
  const auth      = parseAuth(m, trustedAuthDomains);
  const score     = spamScore(from, subject, snippet, auth);
  const replyTo   = m.replyTo?.value?.[0]?.address || "";
  const fromDom   = regDomain(m.from?.value?.[0]?.address || "");
  const replyDom  = regDomain(replyTo);
  const differs   = !!(fromDom && replyDom && fromDom !== replyDom);
  return {
    isNewsletter: isNewsletter(m, text),
    spamScore: score,
    isSpam: score >= SPAM_THRESHOLD,
    auth: auth.text,
    replyTo,
    replyToDiffers: differs,
    replyToKnownService: differs && KNOWN_REPLY_SERVICES.includes(replyDom) ? replyDom : null,
  };
}
