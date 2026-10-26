// IMAP 유틸 (모두 읽기 전용)
import Imap from "imap";
import { simpleParser } from "mailparser";
import { PRESETS, TLS_INSECURE } from "./config.js";

export function makeImap(account) {
  const p = PRESETS[account.service];
  return new Imap({
    user: account.user, password: account.pass,
    host: p.host, port: p.port, tls: p.tls,
    tlsOptions: { rejectUnauthorized: !TLS_INSECURE, servername: p.host },
    connTimeout: 30000, authTimeout: 15000,
  });
}
export function imapConnect(imap) {
  return new Promise((res, rej) => {
    const onReady = () => { imap.removeListener("error", onErr); res(); };
    const onErr   = (e) => { imap.removeListener("ready", onReady); rej(e); };
    imap.once("ready", onReady); imap.once("error", onErr); imap.connect();
  });
}
// readOnly=true 는 EXAMINE(읽기 전용) — 메일이 읽음 처리되지 않습니다.
// readOnly=false 는 SELECT(쓰기) — \Seen 같은 플래그를 바꾸려면 필요합니다. mark_read 전용.
export function openBox(imap, name, readOnly = true) {
  return new Promise((res, rej) => imap.openBox(name, readOnly, (e, b) => e ? rej(e) : res(b)));
}
// UID 기준 플래그 추가/삭제 (mark_read/mark_unread 가 "\\Seen" 을 붙이거나 뗄 때). 쓰기 모드에서만 동작.
export function addFlags(imap, uids, flags) {
  return new Promise((res, rej) => imap.addFlags(uids, flags, (e) => e ? rej(e) : res()));
}
export function delFlags(imap, uids, flags) {
  return new Promise((res, rej) => imap.delFlags(uids, flags, (e) => e ? rej(e) : res()));
}
export function listBoxes(imap) {
  // 하위 폴더까지 "상위/하위" 형태로 펼침
  return new Promise((res, rej) => imap.getBoxes((e, boxes) => {
    if (e) return rej(e);
    const out = [];
    const walk = (obj, prefix) => {
      for (const [name, box] of Object.entries(obj || {})) {
        const full = prefix ? prefix + (box.delimiter || "/") + name : name;
        if (!(box.attribs || []).some(a => /noselect/i.test(a))) out.push(full);
        if (box.children) walk(box.children, full);
      }
    };
    walk(boxes, "");
    res(out);
  }));
}
// node-imap 의 search()/fetch() 는 UID 기준입니다.
export function searchUids(imap, criteria) {
  return new Promise((res, rej) => imap.search(criteria, (e, u) => e ? rej(e) : res(u || [])));
}
export function isNonExistentError(err) {
  const msg = (err?.message || "").toUpperCase();
  return msg.includes("NONEXISTENT") || msg.includes("NO [TRYCREATE]") || msg.includes("MAILBOX DOES NOT EXIST");
}
export function toImapDate(d) {
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()}-${M[d.getMonth()]}-${d.getFullYear()}`;
}

// HTML 메일을 읽을 수 있는 텍스트로 변환 (주석·스타일·스크립트·태그 제거)
// 화면에 숨긴 요소의 "내용까지" 제거 — 사람은 못 보고 Claude 만 읽는 지시문 차단
// ponytail: 정규식이라 같은 태그가 중첩되면 완벽하지 않음. HTML 파서가 필요하면 그때 도입.
const HIDDEN_ELEMENT =
  /<(\w+)\b[^>]*?(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|font-size\s*:\s*0|(?:max-)?height\s*:\s*0|\shidden(?=[\s=>]))[^>]*>[\s\S]*?<\/\1>/gi;
export function htmlToText(html) {
  let s = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // 중첩되어 안쪽부터 드러나는 숨김 요소까지 몇 번 반복해 제거
  for (let i = 0; i < 3; i++) {
    const next = s.replace(HIDDEN_ELEMENT, " ");
    if (next === s) break;
    s = next;
  }
  return s
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
}
export function toPlainText(m) {
  const t = m.text && !/<!--|<\/?(table|td|div|a)\b/i.test(m.text) ? m.text : "";
  return t || htmlToText(m.html || m.text || "");
}

export function fetchMessages(imap, uids) {
  return new Promise((res, rej) => {
    if (!uids.length) { res([]); return; }
    const bag = [];
    const f = imap.fetch(uids, { bodies: [""], struct: false });
    f.on("message", (msg) => {
      const chunks = []; let attrs = {};
      msg.on("body", (stream) => stream.on("data", c => chunks.push(c)));
      msg.once("attributes", a => { attrs = a; });
      msg.once("end", () => bag.push({ raw: Buffer.concat(chunks), attrs }));
    });
    f.once("error", rej);
    f.once("end", async () => {
      const results = [];
      for (const item of bag) {
        try {
          const m    = await simpleParser(item.raw);
          const text = toPlainText(m);
          results.push({
            uid: item.attrs.uid, m,
            flags: item.attrs.flags || [],
            snippet: text.replace(/\s+/g, " ").trim().substring(0, 400),
            messageId: (m.messageId || "").replace(/[<>]/g, "").trim(),
          });
        } catch (e) { console.error("[parse]", item.attrs?.uid, e.message); }
      }
      res(results);
    });
  });
}
