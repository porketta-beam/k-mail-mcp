// 로컬 분류 / 스팸 신호 (네트워크 호출 없음)
import fs from "fs";
import { CATEGORIES_FILE, DEFAULT_CATEGORY_RULES, SPAM_PATTERNS, TRUSTED_REPLY_HOSTS } from "./config.js";

export function loadCategoryRules() {
  try {
    if (fs.existsSync(CATEGORIES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf-8"));
      if (Array.isArray(raw) && raw.length) return raw;
    }
  } catch (e) { console.error("[categories] 기본값 사용:", e.message); }
  return DEFAULT_CATEGORY_RULES;
}
export function classifyEmail(rules, from, subject, isNewsletter) {
  const text = (from + " " + subject).toLowerCase();
  for (const r of rules) {
    if (r.newsletterOnly && !isNewsletter) continue;
    if ((r.keywords || []).some(kw => text.includes(String(kw).toLowerCase()))) return r.name;
  }
  return isNewsletter ? "📰 뉴스레터" : "📂 기타";
}

export function parseAuthResults(m) {
  let raw = m.headers?.get("authentication-results") || "";
  if (Array.isArray(raw)) raw = raw[0] || "";
  const h = (typeof raw === "object" ? raw.value || raw.text || "" : String(raw)).toLowerCase();
  const get = key => h.match(new RegExp(`\\b${key}=(pass|fail|softfail|none|neutral|temperror|permerror)\\b`))?.[1] || null;
  return { spf: get("spf"), dkim: get("dkim"), dmarc: get("dmarc") };
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
export function senderDomain(from) {
  return (from.match(/@([\w.-]+)/)?.[1] || "").toLowerCase();
}
// 기본 도메인 추출: reply.github.com -> github.com, mail.co.kr 같은 2단계 국가 도메인 고려
export function baseDomain(d) {
  const parts = String(d || "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2];
  const twoLevel = parts[parts.length - 1].length === 2 && /^(co|or|ne|go|ac|re|pe|com|net|org|gov|edu)$/.test(sld);
  return parts.slice(twoLevel ? -3 : -2).join(".");
}
export function replyToDiffers(replyDomain, domain) {
  return !!(replyDomain && domain && baseDomain(replyDomain) !== baseDomain(domain)
            && !TRUSTED_REPLY_HOSTS.includes(baseDomain(replyDomain)));
}
