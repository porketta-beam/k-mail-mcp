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
// 두 번째 인자 true = 읽기 전용(EXAMINE). 메일이 읽음 처리되지 않습니다.
export function openBox(imap, name) {
  return new Promise((res, rej) => imap.openBox(name, true, (e, b) => e ? rej(e) : res(b)));
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
function htmlToText(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
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
