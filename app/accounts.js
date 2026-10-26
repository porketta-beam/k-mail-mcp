// 계정 (AES-256-GCM 으로 암호화된 accounts.enc.json)
import crypto from "crypto";
import fs from "fs";
import { ACCOUNTS_FILE, KEY_FILE, PRESETS } from "./config.js";

function loadKeyBuf() {
  if (!fs.existsSync(KEY_FILE))
    throw new Error("마스터 키(.master.key) 없음 — setup.bat 으로 계정을 먼저 등록하세요");
  return Buffer.from(fs.readFileSync(KEY_FILE, "utf-8").trim(), "hex");
}
function decrypt(enc, keyBuf) {
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(enc.iv, "hex"));
    d.setAuthTag(Buffer.from(enc.authTag, "hex"));
    return Buffer.concat([d.update(Buffer.from(enc.ciphertext, "hex")), d.final()]).toString("utf-8");
  } catch { throw new Error("복호화 실패"); }
}
export function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  const keyBuf = loadKeyBuf();
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"))
    .filter(a => PRESETS[a.service])          // 이 포크가 지원하는 서비스만
    .map(a => ({
      id: a.id, service: a.service, label: a.label,
      user: decrypt(a.encUser, keyBuf).trim(),
      pass: decrypt(a.encPass, keyBuf).replace(/\s+/g, ""),
    }));
}
export function findAccount(labelOrUser) {
  return loadAccounts().find(a => a.label === labelOrUser || a.user === labelOrUser);
}
