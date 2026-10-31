// @ts-check
// Plain JS, ESM, no Cloudflare dependencies, testable in Node via globalThis.crypto

/**
 * @param {string} secretString
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(secretString) {
  // BACKUP_KEY is 32 random bytes (base64) -> SHA-256 is enough; PBKDF2 would burn the Workers CPU budget
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secretString));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * @param {CryptoKey} key
 * @param {Uint8Array} data
 * @returns {Promise<Uint8Array>}
 */
export async function encrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const result = new Uint8Array(3 + 12 + ciphertext.byteLength);
  result.set([0x4A, 0x42, 0x31], 0); // "JB1" magic
  result.set(iv, 3);
  result.set(new Uint8Array(ciphertext), 15);
  return result;
}

/**
 * @param {CryptoKey} key
 * @param {Uint8Array} encrypted
 * @returns {Promise<Uint8Array>}
 */
export async function decrypt(key, encrypted) {
  if (encrypted.length < 15 || encrypted[0] !== 0x4A || encrypted[1] !== 0x42 || encrypted[2] !== 0x31) {
    throw new Error('Invalid encrypted format');
  }
  const iv = encrypted.slice(3, 15);
  const ciphertext = encrypted.slice(15);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(decrypted);
}

/**
 * @param {any} db - D1Database
 * @returns {Promise<{tables: Record<string, {sql: string, rows: any[]}>, counts: Record<string, number>}>}
 */
export async function dumpD1(db, limit = 500) {
  const tables = {};
  const counts = {};
  
  const tableList = await db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
  ).all();
  
  for (const { name, sql } of tableList.results || []) {
    const rows = [];
    let offset = 0;
    
    while (true) {
      const batch = await db.prepare(`SELECT * FROM "${name}" LIMIT ? OFFSET ?`).bind(limit, offset).all();
      if (!batch.results || batch.results.length === 0) break;
      rows.push(...batch.results);
      offset += limit;
      if (batch.results.length < limit) break;
    }
    
    tables[name] = { sql, rows };
    counts[name] = rows.length;
  }
  
  return { tables, counts };
}

/**
 * @param {any} kv - KVNamespace
 * @returns {Promise<{keys: Array<{name: string, value: string, expiration?: number, metadata?: any}>, count: number}>}
 */
export async function dumpKV(kv) {
  const keys = [];
  let cursor;
  
  while (true) {
    const list = await kv.list({ cursor });
    for (const key of list.keys || []) {
      if (key.name.startsWith('backup:')) continue;
      const value = await kv.get(key.name, 'text');
      keys.push({
        name: key.name,
        value: value || '',
        expiration: key.expiration,
        metadata: key.metadata
      });
    }
    if (list.list_complete || !list.cursor) break;
    cursor = list.cursor;
  }
  
  return { keys, count: keys.length };
}

/**
 * @param {any} db
 * @param {any} kv
 * @param {Date} now
 * @returns {Promise<{version: number, createdAt: string, d1: any, kv: any}>}
 */
export async function buildSnapshot(db, kv, now, limit = 500) {
  const d1 = await dumpD1(db, limit);
  const kvData = await dumpKV(kv);
  return {
    version: 1,
    createdAt: now.toISOString(),
    d1,
    kv: kvData
  };
}

/**
 * @param {number} nowMs
 * @param {number} days
 * @returns {number}
 */
export function retentionCutoff(nowMs, days = 30) {
  return nowMs - days * 86400000;
}

/**
 * @param {string[]} keyNames
 * @param {number} nowMs
 * @returns {string[]}
 */
export function pickExpired(keyNames, nowMs) {
  const cutoff = retentionCutoff(nowMs, 30);
  return keyNames.filter(name => {
    const match = name.match(/jeffa-backup-(\d{4}-\d{2}-\d{2})\.bin/);
    if (!match) return false;
    const ts = new Date(match[1]).getTime();
    return !isNaN(ts) && ts < cutoff;
  });
}

/**
 * @param {any} snapshot
 * @param {{[table: string]: number}} liveCounts
 * @returns {{ok: boolean, diffs: Array<{table: string, backup: number, live: number}>}}
 */
export function restoreCheck(snapshot, liveCounts) {
  const diffs = [];
  const backupCounts = snapshot.d1?.counts || {};
  
  for (const table in backupCounts) {
    const backup = backupCounts[table];
    const live = liveCounts[table] || 0;
    const diff = Math.abs(live - backup);
    const ratio = backup > 0 ? diff / backup : (live > 0 ? 1 : 0);
    if (ratio > 0.1 || (backup > 0 && live === 0)) {
      diffs.push({ table, backup, live });
    }
  }
  
  for (const table in liveCounts) {
    if (!(table in backupCounts) && liveCounts[table] > 0) {
      diffs.push({ table, backup: 0, live: liveCounts[table] });
    }
  }
  
  return { ok: diffs.length === 0, diffs };
}

/**
 * @param {Date} date
 * @returns {boolean}
 */
export function isFirstOfMonth(date) {
  return date.getDate() === 1;
}
