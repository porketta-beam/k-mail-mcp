/**
 * setup-worker.js — 계정 정보 암호화/저장 담당
 * setup.ps1 이 환경변수 KMAIL_INPUT(JSON) 으로 값을 넘겨 호출합니다. 직접 실행하지 마세요.
 *
 * 원본: K-Mail-MCP by youngsooco (MIT) — https://github.com/youngsooco/k-mail-mcp
 * 포크 변경: 네이버/다음/카카오만 지원, 잘못된 서비스 번호 거부, API 키 설정 기능 제거
 */

import crypto from "crypto";
import fs     from "fs";
import path   from "path";
import { fileURLToPath } from "url";

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_FILE = path.join(__dirname, "accounts.enc.json");
const KEY_FILE      = path.join(__dirname, ".master.key");

const SVC_MAP   = { "1": "naver", "2": "daum", "3": "kakao" };
const SVC_LABEL = { naver: "Naver", daum: "Daum/Hanmail", kakao: "Kakao" };

function ensureKey() {
  if (!fs.existsSync(KEY_FILE)) {
    fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(KEY_FILE, "utf-8").trim(), "hex");
}
function encrypt(plaintext, keyBuf) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return { iv: iv.toString("hex"), authTag: cipher.getAuthTag().toString("hex"), ciphertext: enc.toString("hex") };
}
function decrypt(encObj, keyBuf) {
  const d = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(encObj.iv, "hex"));
  d.setAuthTag(Buffer.from(encObj.authTag, "hex"));
  return Buffer.concat([d.update(Buffer.from(encObj.ciphertext, "hex")), d.final()]).toString("utf-8");
}
function loadRaw() {
  return fs.existsSync(ACCOUNTS_FILE) ? JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8")) : [];
}
function saveRaw(accounts) {
  const tmp = ACCOUNTS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ACCOUNTS_FILE);
}
function readInput() {
  if (process.env.KMAIL_INPUT) {
    try { return JSON.parse(process.env.KMAIL_INPUT); } catch { return {}; }
  }
  return {};
}

function main() {
  const keyBuf = ensureKey();
  const action = process.argv[2] || "list";
  const input  = readInput();

  if (action === "add") {
    const service = SVC_MAP[String(input.service || "").trim()];
    if (!service) { console.log("[ERROR] 서비스 번호는 1(네이버), 2(다음), 3(카카오) 중 하나여야 합니다."); process.exit(1); }
    const email = String(input.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.log("[ERROR] 이메일 형식이 올바르지 않습니다."); process.exit(1); }
    const pass = String(input.pass || "").replace(/\s+/g, "");
    if (pass.length < 4) { console.log("[ERROR] 비밀번호가 너무 짧습니다."); process.exit(1); }
    const label = (String(input.label || "").trim() || email.split("@")[0]);

    const accounts = loadRaw();
    const idx = accounts.findIndex(a => a.label === label);
    const entry = {
      id: idx >= 0 ? accounts[idx].id : crypto.randomUUID(),
      service, label,
      encUser: encrypt(email, keyBuf),
      encPass: encrypt(pass,  keyBuf),
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) accounts[idx] = entry; else accounts.push(entry);
    saveRaw(accounts);
    console.log(`[OK] ${idx >= 0 ? "업데이트" : "추가"}: [${SVC_LABEL[service]}] ${label} (AES-256-GCM 암호화 저장)`);

  } else if (action === "list") {
    const raw = loadRaw();
    if (!raw.length) { console.log("  (등록된 계정 없음)"); return; }
    raw.forEach((a, i) => {
      let user = "(복호화 실패)";
      try { user = decrypt(a.encUser, keyBuf); } catch {}
      const note = SVC_LABEL[a.service] ? "" : "  ← 이 포크에서 지원하지 않는 서비스";
      console.log(`  ${i + 1}. [${SVC_LABEL[a.service] || a.service}] ${a.label} — ${user}${note}`);
    });

  } else if (action === "delete") {
    const accounts = loadRaw();
    const n = Number(input.index) - 1;
    if (!Number.isInteger(n) || n < 0 || n >= accounts.length) { console.log("[ERROR] 잘못된 번호입니다"); return; }
    const removed = accounts.splice(n, 1)[0];
    saveRaw(accounts);
    console.log(`[삭제됨] ${removed.label}`);

  } else {
    console.log(`[ERROR] 알 수 없는 동작: ${action}`);
    process.exit(1);
  }
}

main();
