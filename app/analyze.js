// 메일 1통의 헤더 기반 신호 (네트워크 호출 없음)
// Claude 는 헤더를 볼 수 없으므로 헤더에서만 알 수 있는 것(인증 결과, Reply-To 도메인)만 계산합니다.
// 분류·스팸·뉴스레터 판단은 from·subject·snippet·mailbox 를 보고 Claude 가 합니다.
import { getDomain } from "tldts";
import { KNOWN_REPLY_SERVICES } from "./config.js";

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

const regDomain = addr => getDomain(addr.split("@")[1] || "") || "";

export function analyzeMail(m, { trustedAuthDomains = [] } = {}) {
  const replyTo   = m.replyTo?.value?.[0]?.address || "";
  const fromDom   = regDomain(m.from?.value?.[0]?.address || "");
  const replyDom  = regDomain(replyTo);
  const differs   = !!(fromDom && replyDom && fromDom !== replyDom);
  return {
    auth: parseAuth(m, trustedAuthDomains).text,
    replyTo,
    replyToDiffers: differs,
    replyToKnownService: differs && KNOWN_REPLY_SERVICES.includes(replyDom) ? replyDom : null,
  };
}
