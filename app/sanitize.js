// 프롬프트 인젝션 완화 — 메일 본문 속 지시문 패턴을 걸러냅니다.
import crypto from "crypto";
import { INJECTION_PATTERNS } from "./config.js";

export function sanitize(text) {
  if (!text || typeof text !== "string") return "";
  let s = text;
  for (const p of INJECTION_PATTERNS) s = s.replace(p, "[FILTERED]");
  return s;
}

// 호출마다 새로 만드는 경계 토큰. 메일을 "받을" 때는 알 수 없으므로
// 공격자가 진짜와 같은 닫는 표시를 미리 심어 둘 수 없습니다.
export function makeBoundary() {
  return crypto.randomBytes(6).toString("hex");
}

// 본문에서 "경계 표시처럼 생긴" 문자열을 지웁니다.
// (고정 경계든 무작위 경계든, 공격자가 데이터 구간을 가짜로 닫으려는 시도를 무력화)
const MARKER_LIKE = [
  /<<\s*EMAIL\b[^>]*?>>/gi,           // 새 경계: <<EMAIL ... 시작>> / <<EMAIL ... 끝>>
  /⟦\/?[0-9a-f]{6,}⟧/gi,             // check_new_mails 인라인 경계: ⟦token⟧ … ⟦/token⟧
  /={3,}\s*EMAIL_CONTENT[^=]*={3,}/gi, // 구버전 고정 경계
];
export function stripBoundaryMarkers(text) {
  if (!text || typeof text !== "string") return "";
  let s = text;
  for (const p of MARKER_LIKE) s = s.replace(p, "[경계표시 제거됨]");
  return s;
}
