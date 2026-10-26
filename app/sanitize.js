// 프롬프트 인젝션 완화 — 메일 본문 속 지시문 패턴을 걸러냅니다.
import { INJECTION_PATTERNS } from "./config.js";

export function sanitize(text) {
  if (!text || typeof text !== "string") return "";
  let s = text;
  for (const p of INJECTION_PATTERNS) s = s.replace(p, "[FILTERED]");
  return s;
}
