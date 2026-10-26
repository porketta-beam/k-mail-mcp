// 한 계정의 최근 메일 수집
import { PRESETS } from "./config.js";
import { sanitize } from "./sanitize.js";
import { makeImap, imapConnect, openBox, searchUids, isNonExistentError, toImapDate, fetchMessages } from "./imap.js";
import { syncMailboxes, removeFromDiscovered } from "./mailboxes.js";
import { analyzeMail } from "./analyze.js";

export async function collectRecentMails(account, { since, includeRead, maxPerFolder }) {
  const result = { account: account.label, service: account.service, scannedMailboxes: [], mails: [], error: null };
  const preset = PRESETS[account.service];
  const imap   = makeImap(account);
  try {
    await imapConnect(imap);
    const { effective, newFolders, removedFolders } = await syncMailboxes(account, imap);
    result.scannedMailboxes = effective;
    if (newFolders.length || removedFolders.length) result.folderChanges = { newFolders, removedFolders };

    const seen = new Set();
    for (const mailbox of effective) {
      try { await openBox(imap, mailbox); }
      catch (e) {
        if (isNonExistentError(e)) removeFromDiscovered(account.label, mailbox);
        else console.error(`[skip open] ${account.label}/${mailbox}: ${e.message}`);
        continue;
      }

      // IMAP SINCE 는 "날짜" 단위라 넉넉히 검색한 뒤 아래에서 시각으로 다시 거릅니다.
      const criteria = [["SINCE", toImapDate(since)]];
      if (!includeRead) criteria.unshift("UNSEEN");
      let uids;
      try { uids = (await searchUids(imap, criteria)).slice(-maxPerFolder); }
      catch (e) { console.error(`[skip search] ${account.label}/${mailbox}: ${e.message}`); continue; }
      if (!uids.length) continue;

      let items;
      try { items = await fetchMessages(imap, uids); }
      catch (e) { console.error(`[skip fetch] ${account.label}/${mailbox}: ${e.message}`); continue; }

      for (const { uid, m, flags, snippet, messageId } of items) {
        const date = m.date ? new Date(m.date) : null;
        if (date && date < since) continue;
        if (messageId) { if (seen.has(messageId)) continue; seen.add(messageId); }

        result.mails.push({
          account: account.label,
          mailbox, uid,
          date: date?.toISOString() || "",
          from: sanitize(m.from?.text || ""),
          to: sanitize(m.to?.text || ""),
          cc: sanitize(m.cc?.text || ""),
          subject: sanitize(m.subject || "(제목 없음)"),
          snippet: sanitize(snippet),
          isRead: flags.includes("\\Seen"),
          isFlagged: flags.includes("\\Flagged"),
          hasAttachments: (m.attachments || []).length > 0,
          ...analyzeMail(m, { trustedAuthDomains: preset.authDomains }),
          webLink: preset.web,
        });
      }
    }
    result.mails.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  } catch (e) {
    result.error = e.message;
  } finally {
    try { imap.end(); } catch {}
  }
  return result;
}
