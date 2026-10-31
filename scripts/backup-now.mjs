#!/usr/bin/env node
// Manuelles Backup vom Rechner aus (gleiches Format wie der Cron-Worker services/backup):
// D1 + KV über wrangler lesen, gzip + AES-GCM (BACKUP_KEY aus /workspace/.jeffa_backup_key oder env),
// in KV "backup:blob:<datum>" (30 Tage) ablegen und "backup:status" schreiben. Gibt den Key nie aus.
// Usage: node scripts/backup-now.mjs [--local-only]   (--local-only: nur Datei backups/jeffa-backup-<datum>.bin schreiben)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildSnapshot, deriveKey, encrypt } from '../services/backup/src/core.js';

const NS = '0ec191e5f5b148d391d46d63d51f42a2', DB = 'jeffa-kollab';
const keyFile = '/workspace/.jeffa_backup_key';
const secret = process.env.BACKUP_KEY || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '');
if (!secret) { console.error('BACKUP_KEY fehlt (env oder ' + keyFile + ')'); process.exit(1); }
const w = (args, input) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', input, maxBuffer: 512 << 20, stdio: ['pipe', 'pipe', 'ignore'] });
const lit = (v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const db = {
  prepare(sql) {
    let params = [];
    const run = () => { let i = 0; const q = sql.replace(/\?/g, () => lit(params[i++])); return JSON.parse(w(['d1', 'execute', DB, '--remote', '--json', '--command', q]))[0]; };
    const o = { bind(...p) { params = p; return o; }, async all() { return { results: run().results }; }, async first() { return run().results[0] ?? null; } };
    return o;
  },
};
const kv = {
  async list() { return { keys: JSON.parse(w(['kv', 'key', 'list', '--namespace-id', NS, '--remote'])), list_complete: true }; },
  async get(name) { return w(['kv', 'key', 'get', '--namespace-id', NS, '--remote', '--text', name]); },
};
const now = new Date(), day = now.toISOString().slice(0, 10);
const snap = await buildSnapshot(db, kv, now, 5000);
const enc = await encrypt(await deriveKey(secret), gzipSync(Buffer.from(JSON.stringify(snap))));
mkdirSync('backups', { recursive: true });
const file = `backups/jeffa-backup-${day}.bin`; writeFileSync(file, enc);
console.log('Tabellen:', Object.keys(snap.d1.counts).length, 'Zeilen:', Object.values(snap.d1.counts).reduce((a, b) => a + b, 0), 'KV-Keys:', snap.kv.count, 'Bytes:', enc.length, '->', file);
if (!process.argv.includes('--local-only')) {
  w(['kv', 'key', 'put', '--namespace-id', NS, '--remote', '--ttl', String(30 * 86400), `backup:blob:${day}`, '--path', file]);
  w(['kv', 'key', 'put', '--namespace-id', NS, '--remote', 'backup:status', JSON.stringify({ lastRun: now.toISOString(), ok: true, bytes: enc.length, target: 'kv', via: 'manuell', counts: snap.d1.counts, kvCount: snap.kv.count })]);
  console.log('in KV gespeichert: backup:blob:' + day);
}
