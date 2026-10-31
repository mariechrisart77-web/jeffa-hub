import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { deriveKey, encrypt, decrypt, dumpD1, dumpKV, restoreCheck, pickExpired, retentionCutoff } from '../services/backup/src/core.js';

test('encrypt/decrypt roundtrip', async () => {
  const key = await deriveKey('test-secret-123');
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const encrypted = await encrypt(key, data);
  
  assert.ok(encrypted.length > data.length);
  assert.equal(encrypted[0], 0x4A);
  assert.equal(encrypted[1], 0x42);
  assert.equal(encrypted[2], 0x31);
  
  const decrypted = await decrypt(key, encrypted);
  assert.deepEqual(decrypted, data);
});

test('decrypt with wrong key throws', async () => {
  const key1 = await deriveKey('secret1');
  const key2 = await deriveKey('secret2');
  const data = new Uint8Array([1, 2, 3]);
  const encrypted = await encrypt(key1, data);
  
  await assert.rejects(() => decrypt(key2, encrypted));
});

test('dumpD1 with fake database', async () => {
  const fakeDB = {
    prepare(sql) {
      const self = this;
      return {
        bind(...params) {
          self._params = params;
          return this;
        },
        async all() {
          if (sql.includes('sqlite_master')) {
            return {
              results: [
                { name: 'users', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)' },
                { name: 'posts', sql: 'CREATE TABLE posts (id INTEGER, content TEXT)' }
              ]
            };
          }
          const [limit, offset] = self._params || [500, 0];
          if (sql.includes('users')) {
            if (offset > 0) return { results: [] };
            return { results: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] };
          }
          if (sql.includes('posts')) {
            if (offset >= 1000) return { results: [] };
            const rows = [];
            for (let i = 0; i < Math.min(limit, 1000 - offset); i++) {
              rows.push({ id: offset + i, content: `Post ${offset + i}` });
            }
            return { results: rows };
          }
          return { results: [] };
        }
      };
    }
  };
  
  const result = await dumpD1(fakeDB);
  
  assert.ok(result.tables.users);
  assert.equal(result.tables.users.rows.length, 2);
  assert.equal(result.counts.users, 2);
  assert.ok(result.tables.posts);
  assert.equal(result.tables.posts.rows.length, 1000);
  assert.equal(result.counts.posts, 1000);
});

test('dumpKV excludes backup: prefix', async () => {
  const fakeKV = {
    async list({ cursor }) {
      if (cursor === 'page2') {
        return {
          keys: [{ name: 'key3' }, { name: 'backup:should-skip' }],
          cursor: null
        };
      }
      return {
        keys: [{ name: 'key1' }, { name: 'backup:skip-this' }, { name: 'key2' }],
        cursor: 'page2'
      };
    },
    async get(name) {
      if (name === 'key1') return 'value1';
      if (name === 'key2') return 'value2';
      if (name === 'key3') return 'value3';
      return null;
    }
  };
  
  const result = await dumpKV(fakeKV);
  
  assert.equal(result.count, 3);
  assert.equal(result.keys.length, 3);
  assert.ok(result.keys.every(k => !k.name.startsWith('backup:')));
  assert.deepEqual(result.keys.map(k => k.name).sort(), ['key1', 'key2', 'key3']);
});

test('restoreCheck ok when counts match', () => {
  const snapshot = {
    d1: {
      counts: { users: 100, posts: 500 }
    }
  };
  const liveCounts = { users: 105, posts: 510 };
  
  const result = restoreCheck(snapshot, liveCounts);
  assert.equal(result.ok, true);
  assert.equal(result.diffs.length, 0);
});

test('restoreCheck fails on large deviation', () => {
  const snapshot = {
    d1: {
      counts: { users: 100, posts: 500 }
    }
  };
  const liveCounts = { users: 150, posts: 500 };
  
  const result = restoreCheck(snapshot, liveCounts);
  assert.equal(result.ok, false);
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].table, 'users');
});

test('pickExpired filters old backups', () => {
  const now = new Date('2026-11-15').getTime();
  const keys = [
    'jeffa-backup-2026-11-14.bin',
    'jeffa-backup-2026-10-10.bin',
    'jeffa-backup-2026-09-01.bin',
    'other-file.bin'
  ];
  
  const expired = pickExpired(keys, now);
  
  assert.deepEqual(expired.sort(), ['jeffa-backup-2026-09-01.bin', 'jeffa-backup-2026-10-10.bin']); // both > 30 days
});

test('file checks', () => {
  const wranglerToml = readFileSync('services/backup/wrangler.toml', 'utf8');
  assert.ok(wranglerToml.includes('crons'));
  
  const deploySh = readFileSync('scripts/deploy.sh', 'utf8');
  assert.ok(deploySh.includes('services/backup'));
  
  const statusTs = readFileSync('functions/api/status.ts', 'utf8');
  assert.ok(statusTs.includes('backup:status'));
  
  const waechterJs = readFileSync('apps/waechter/waechter.js', 'utf8');
  assert.ok(waechterJs.includes('Restore-Test') || waechterJs.includes('restore'));
});
