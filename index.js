/**
 * K-Mail-MCP (Naver/Daum fork)
 *
 * 원본: K-Mail-MCP by youngsooco — https://github.com/youngsooco/k-mail-mcp
 *       (MIT License, 원본 커밋 5af081888fd323c7f9127acf71471fbd91a907fe 기준)
 * 이 포크에서 바꾼 점은 FORK_CHANGES.md 를 참고하세요.
 *
 * 하는 일: 네이버 / 다음(한메일) / 카카오메일 계정을 IMAP 으로 "읽기 전용" 접속해
 *          최근 N시간(기본 24시간) 메일을 모아 Claude 에게 넘겨줍니다.
 * 하지 않는 일: 메일 발송, 삭제, 읽음 처리, 외부 API 호출, 원격(HTTP) 접속.
 *
 * 실행 방식: stdio 전용 (Claude 데스크톱 앱이 로컬 프로세스로 실행)
 * 구조: 이 파일은 MCP 도구 등록만 담당하고, 나머지는 app/ 모듈에 있습니다.
 *       설정 → app/config.js, Claude 에게 보이는 문구 → app/prompts.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERSION, PRESETS, TLS_INSECURE, DEFAULT_EXCLUDED_FOLDERS } from "./app/config.js";
import { TOOL_DESCRIPTIONS as T, PARAM_DESCRIPTIONS as P, wrapEmailContent } from "./app/prompts.js";
import { sanitize } from "./app/sanitize.js";
import { loadAccounts, findAccount } from "./app/accounts.js";
import { loadWatchedMailboxes, saveWatchedMailboxes } from "./app/mailboxes.js";
import { makeImap, imapConnect, openBox, listBoxes, fetchMessages, toPlainText } from "./app/imap.js";
import { collectRecentMails } from "./app/collect.js";

const json = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

// ══════════════════════════════════════════════════════
// MCP 서버 (도구 6개, 모두 읽기 전용)
// ══════════════════════════════════════════════════════
const server = new McpServer({ name: "k-mail-mcp", version: VERSION });

server.tool("list_accounts", T.list_accounts, {},
  async () => {
    const watched = loadWatchedMailboxes();
    const accounts = loadAccounts().map(a => ({
      label: a.label, service: a.service, user: a.user,
      scanFolders: watched[a.label]
        ? (watched[a.label].discovered || []).filter(f => !(watched[a.label].excluded || []).includes(f)).length
        : "첫 실행 시 자동 탐색",
    }));
    return json({ version: VERSION, tlsVerification: !TLS_INSECURE, accounts });
  }
);

server.tool("check_new_mails", T.check_new_mails,
  {
    account_label: z.string().default("all").describe(P.account_label),
    hours:         z.number().min(1).max(168).default(24).describe(P.hours),
    include_read:  z.boolean().default(true).describe(P.include_read),
    max_per_folder:z.number().min(1).max(200).default(100).describe(P.max_per_folder),
  },
  async ({ account_label, hours, include_read, max_per_folder }) => {
    const all = loadAccounts();
    if (!all.length) return json({ error: "등록된 계정이 없습니다. setup.bat 으로 계정을 추가하세요." });
    const targets = account_label === "all" ? all : all.filter(a => a.label === account_label || a.user === account_label);
    if (!targets.length) return json({ error: `계정 '${account_label}' 없음` });

    const now   = new Date();
    const since = new Date(now.getTime() - hours * 3600 * 1000);
    const settled = await Promise.allSettled(
      targets.map(acc => collectRecentMails(acc, { since, includeRead: include_read, maxPerFolder: max_per_folder }))
    );
    const results = settled.map((s, i) => s.status === "fulfilled"
      ? s.value : { account: targets[i].label, error: s.reason?.message, mails: [] });

    const mails = results.flatMap(r => r.mails)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const errors = results.filter(r => r.error).map(r => ({ account: r.account, error: r.error }));
    const folderChanges = results.filter(r => r.folderChanges).map(r => ({ account: r.account, ...r.folderChanges }));

    return json({
      range: { since: since.toISOString(), until: now.toISOString(), hours },
      totalMails: mails.length,
      unreadMails: mails.filter(m => !m.isRead).length,
      byAccount: Object.fromEntries(results.map(r => [r.account, r.mails.length])),
      mails,
      folderChanges: folderChanges.length ? folderChanges : undefined,
      errors: errors.length ? errors : undefined,
    });
  }
);

server.tool("read_email", T.read_email,
  {
    account_label: z.string(),
    uid:           z.number(),
    mailbox:       z.string().default("INBOX"),
    max_chars:     z.number().default(5000).describe(P.max_chars),
  },
  async ({ account_label, uid, mailbox, max_chars }) => {
    const acc = findAccount(account_label);
    if (!acc) return json({ error: "계정 없음" });
    const imap = makeImap(acc);
    try {
      await imapConnect(imap);
      await openBox(imap, mailbox);
      const [item] = await fetchMessages(imap, [uid]);
      if (!item) return json({ error: "메일을 찾을 수 없습니다", mailbox, uid });
      const m = item.m;
      const full = toPlainText(m).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim() || "(본문 없음)";
      const body = (max_chars === -1 || full.length <= max_chars)
        ? full : full.substring(0, max_chars) + `\n\n...[이하 ${full.length - max_chars}자 생략 — max_chars=-1 로 전체 보기]`;
      return json({
        account: acc.label, mailbox, uid,
        from: m.from?.text || "", to: m.to?.text || "", cc: m.cc?.text || "",
        replyTo: m.replyTo?.text || "",
        subject: m.subject || "", date: m.date?.toISOString() || "",
        attachments: (m.attachments || []).map(a => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
        body: wrapEmailContent(sanitize(body)),
        totalChars: full.length,
        webLink: PRESETS[acc.service].web,
      });
    } catch (e) {
      return json({ error: e.message });
    } finally { try { imap.end(); } catch {} }
  }
);

server.tool("list_mailboxes", T.list_mailboxes,
  { account_label: z.string() },
  async ({ account_label }) => {
    const acc = findAccount(account_label);
    if (!acc) return json({ error: "계정 없음" });
    const imap = makeImap(acc);
    try {
      await imapConnect(imap);
      const current  = await listBoxes(imap);
      const entry    = loadWatchedMailboxes()[acc.label];
      const excluded = entry?.excluded || current.filter(f => DEFAULT_EXCLUDED_FOLDERS.includes(f));
      return json({
        account: acc.label, currentImap: current, excluded,
        effective: current.filter(f => !excluded.includes(f)),
        lastSync: entry?.lastSync || "미동기화",
        tip: "set_watched_mailboxes 로 제외 폴더를 조정할 수 있습니다.",
      });
    } catch (e) {
      return json({ error: e.message });
    } finally { try { imap.end(); } catch {} }
  }
);

server.tool("get_watched_mailboxes", T.get_watched_mailboxes, {},
  async () => {
    const config = loadWatchedMailboxes();
    return json({
      systemDefaultExcluded: DEFAULT_EXCLUDED_FOLDERS,
      accounts: loadAccounts().map(acc => {
        const e = config[acc.label];
        if (!e) return { label: acc.label, status: "미등록 — 다음 check_new_mails 때 자동 탐색" };
        const ex = new Set(e.excluded || []);
        return { label: acc.label, discovered: e.discovered || [], excluded: e.excluded || [],
                 effective: (e.discovered || []).filter(f => !ex.has(f)), lastSync: e.lastSync };
      }),
    });
  }
);

server.tool("set_watched_mailboxes", T.set_watched_mailboxes,
  {
    account_label:  z.string(),
    add_exclude:    z.array(z.string()).default([]),
    remove_exclude: z.array(z.string()).default([]),
    reset_exclude:  z.boolean().default(false),
  },
  async ({ account_label, add_exclude, remove_exclude, reset_exclude }) => {
    const acc = findAccount(account_label);
    if (!acc) return json({ error: `계정 '${account_label}' 없음` });
    const config = loadWatchedMailboxes();
    const entry  = config[acc.label];
    if (!entry) return json({ warning: "아직 폴더 탐색 전입니다. check_new_mails 를 먼저 실행하세요." });

    const before = [...(entry.excluded || [])];
    let excluded = [...before];
    if (reset_exclude) excluded = (entry.discovered || []).filter(f => DEFAULT_EXCLUDED_FOLDERS.includes(f));
    if (add_exclude.length) excluded = [...new Set([...excluded, ...add_exclude])];
    if (remove_exclude.length) excluded = excluded.filter(f => !remove_exclude.includes(f));
    entry.excluded = excluded;
    saveWatchedMailboxes(config);
    return json({ account: acc.label, before, after: excluded,
                  effective: (entry.discovered || []).filter(f => !excluded.includes(f)) });
  }
);

// ══════════════════════════════════════════════════════
// 실행 — stdio 전용
// ══════════════════════════════════════════════════════
await server.connect(new StdioServerTransport());
console.error(`[k-mail-mcp] ${VERSION} 시작 (stdio, TLS 검증 ${TLS_INSECURE ? "꺼짐" : "켜짐"})`);
