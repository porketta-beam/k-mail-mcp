// 감시 폴더 관리 (watched_mailboxes.json — 로컬 런타임 파일)
import fs from "fs";
import { WATCHED_MAILBOXES_FILE, MAX_DISCOVERED_SIZE, DEFAULT_EXCLUDED_FOLDERS } from "./config.js";
import { listBoxes } from "./imap.js";

export function loadWatchedMailboxes() {
  try {
    if (fs.existsSync(WATCHED_MAILBOXES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(WATCHED_MAILBOXES_FILE, "utf-8"));
      if (raw && typeof raw === "object") return raw;
    }
  } catch (e) { console.error("[watched] 로드 실패:", e.message); }
  return {};
}
export function saveWatchedMailboxes(data) {
  const tmp = WATCHED_MAILBOXES_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, WATCHED_MAILBOXES_FILE);
}
export function removeFromDiscovered(accountLabel, folderName) {
  const config = loadWatchedMailboxes();
  const entry  = config[accountLabel];
  if (!entry) return;
  entry.discovered = (entry.discovered || []).filter(f => f !== folderName);
  entry.excluded   = (entry.excluded   || []).filter(f => f !== folderName);
  saveWatchedMailboxes(config);
}

export async function syncMailboxes(account, imap) {
  const config     = loadWatchedMailboxes();
  const entry      = config[account.label];
  const isFirstRun = !entry;

  let discovered = entry?.discovered ? [...entry.discovered] : [];
  let excluded   = entry?.excluded   ? [...entry.excluded]   : [];

  const current    = await listBoxes(imap);
  const currentSet = new Set(current);
  const knownSet   = new Set(discovered);

  const removedFolders = discovered.filter(f => !currentSet.has(f));
  discovered = discovered.filter(f => currentSet.has(f));
  excluded   = excluded.filter(f => currentSet.has(f));

  const newFolders = current.filter(f => !knownSet.has(f));
  discovered = [...discovered, ...newFolders];

  if (discovered.length > MAX_DISCOVERED_SIZE) {
    const excludedSet = new Set(excluded);
    const overflow    = discovered.length - MAX_DISCOVERED_SIZE;
    const toRemove    = new Set(discovered.filter(f => !excludedSet.has(f)).slice(0, overflow));
    discovered = discovered.filter(f => !toRemove.has(f));
  }

  const isDefaultExcluded = f => DEFAULT_EXCLUDED_FOLDERS.includes(f);
  if (isFirstRun) {
    excluded = discovered.filter(isDefaultExcluded);
  } else {
    excluded = [...new Set([...excluded, ...newFolders.filter(isDefaultExcluded)])];
  }

  config[account.label] = {
    discovered, excluded,
    lastSync: new Date().toISOString(),
    _lastChange: { newFolders, removedFolders },
  };
  saveWatchedMailboxes(config);

  const excludedSet = new Set(excluded);
  return {
    effective: discovered.filter(f => !excludedSet.has(f)),
    discovered, excluded, newFolders, removedFolders,
  };
}
