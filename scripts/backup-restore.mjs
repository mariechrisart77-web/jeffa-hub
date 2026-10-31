#!/usr/bin/env node
// @ts-check
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { deriveKey, decrypt } from '../services/backup/src/core.js';

const usage = `
Jeffa Backup Restore

Usage: node scripts/backup-restore.mjs <backup-datei.bin> [--out verzeichnis]

Entschlüsselt und entpackt ein Jeffa-Backup in lesbare Dateien.

Key-Quelle (in dieser Reihenfolge):
  1. /workspace/.jeffa_backup_key
  2. Umgebungsvariable BACKUP_KEY

Ausgabe (Standard: ./out):
  - d1.sql: CREATE TABLE + INSERT-Statements für D1
  - kv.json: KV-Keys mit Werten und Metadaten

Backup-Datei holen:
  KV:  npx wrangler kv key get --namespace-id 0ec191e5f5b148d391d46d63d51f42a2 backup:blob:YYYY-MM-DD > backup.bin
  R2:  npx wrangler r2 object get jeffa-backup/jeffa-backup-YYYY-MM-DD.bin --file backup.bin

Einspielen (ACHTUNG: überschreibt live Daten):
  D1:  npx wrangler d1 execute jeffa-kollab --remote --file out/d1.sql
  KV:  (manuell per wrangler kv key put für jeden Eintrag)

Restore sollte nur nach Rückfrage und nach Prüfung von out/d1.sql und out/kv.json erfolgen.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    process.exit(args.length === 0 ? 1 : 0);
  }
  
  const file = args[0];
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : './out';
  
  let keyString;
  try {
    keyString = readFileSync('/workspace/.jeffa_backup_key', 'utf8').trim();
  } catch {
    keyString = process.env.BACKUP_KEY;
  }
  
  if (!keyString) {
    console.error('Fehler: BACKUP_KEY nicht gefunden (weder /workspace/.jeffa_backup_key noch env BACKUP_KEY)');
    process.exit(1);
  }
  
  console.log('Lade Backup-Datei...');
  const encrypted = new Uint8Array(readFileSync(file));
  
  console.log('Entschlüssele...');
  const key = await deriveKey(keyString);
  const decrypted = await decrypt(key, encrypted);
  
  console.log('Entpacke...');
  const decompressed = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(decrypted);
        controller.close();
      }
    }).pipeThrough(new DecompressionStream('gzip'))
  );
  
  const json = await decompressed.text();
  const snapshot = JSON.parse(json);
  
  console.log(`Backup vom ${snapshot.createdAt}`);
  
  mkdirSync(outDir, { recursive: true });
  
  // D1 SQL
  let sql = '-- Jeffa D1 Backup\n';
  sql += `-- Erstellt: ${snapshot.createdAt}\n\n`;
  
  for (const [table, data] of Object.entries(snapshot.d1.tables)) {
    sql += `${data.sql};\n\n`;
    
    if (data.rows.length > 0) {
      const cols = Object.keys(data.rows[0]);
      for (const row of data.rows) {
        const values = cols.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (typeof val === 'number') return String(val);
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        sql += `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
      }
      sql += '\n';
    }
  }
  
  writeFileSync(`${outDir}/d1.sql`, sql);
  console.log(`\nD1 gespeichert: ${outDir}/d1.sql`);
  console.log('Tabellen:');
  for (const [table, count] of Object.entries(snapshot.d1.counts)) {
    console.log(`  ${table}: ${count} Zeilen`);
  }
  
  // KV JSON
  writeFileSync(`${outDir}/kv.json`, JSON.stringify(snapshot.kv, null, 2));
  console.log(`\nKV gespeichert: ${outDir}/kv.json`);
  console.log(`Keys: ${snapshot.kv.count}`);
  
  console.log('\nFertig.');
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
