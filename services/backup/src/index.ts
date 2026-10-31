import { buildSnapshot, deriveKey, encrypt, decrypt, pickExpired, isFirstOfMonth, restoreCheck } from './core.js';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  BACKUP?: R2Bucket;
  BACKUP_KEY?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await runBackup(env, ctx, false);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // manual run: POST /run with header x-backup-key = BACKUP_KEY (constant-time compare); ?check=1 forces restore check
    if (url.pathname === '/run' && request.method === 'POST') {
      if (!env.BACKUP_KEY || !(await sameSecret(request.headers.get('x-backup-key') || '', env.BACKUP_KEY))) return new Response('Forbidden', { status: 403 });
      await runBackup(env, ctx, url.searchParams.get('check') === '1');
      return new Response(JSON.stringify({ status: await env.KV.get('backup:status', 'json'), restoreCheck: await env.KV.get('backup:restorecheck', 'json') }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      const [status, restoreCheck] = await Promise.all([env.KV.get('backup:status', 'json'), env.KV.get('backup:restorecheck', 'json')]) as any[];
      // public endpoint: no table names / counts
      const pub = (o: any) => o && { lastRun: o.lastRun, at: o.at, ok: o.ok, target: o.target, bytes: o.bytes, error: o.error };
      return new Response(JSON.stringify({ status: pub(status), restoreCheck: pub(restoreCheck) }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('Not Found', { status: 404 });
  },
};

async function sameSecret(a: string, b: string): Promise<boolean> {
  const h = async (x: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function runBackup(env: Env, ctx: ExecutionContext, forceCheck: boolean): Promise<void> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    try {
      if (!env.BACKUP_KEY) {
        await env.KV.put('backup:status', JSON.stringify({
          lastRun: now.toISOString(),
          ok: false,
          error: 'BACKUP_KEY fehlt'
        }));
        return;
      }
      
      const key = await deriveKey(env.BACKUP_KEY);
      const snapshot = await buildSnapshot(env.DB, env.KV, now);
      const json = JSON.stringify(snapshot);
      
      const compressed = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(json));
            controller.close();
          }
        }).pipeThrough(new CompressionStream('gzip'))
      );
      
      const compressedBytes = new Uint8Array(await compressed.arrayBuffer());
      const encrypted = await encrypt(key, compressedBytes);
      
      const filename = `jeffa-backup-${dateStr}.bin`;
      
      if (env.BACKUP) {
        await env.BACKUP.put(filename, encrypted);
        
        const list = await env.BACKUP.list();
        const nowMs = now.getTime();
        const expired = pickExpired(list.objects.map(o => o.key), nowMs);
        for (const key of expired) {
          await env.BACKUP.delete(key);
        }
        
        await env.KV.put('backup:status', JSON.stringify({
          lastRun: now.toISOString(),
          ok: true,
          bytes: encrypted.length,
          target: 'r2',
          counts: snapshot.d1.counts,
          kvCount: snapshot.kv.count
        }));
      } else {
        const maxSize = 24 * 1024 * 1024;
        if (encrypted.length <= maxSize) {
          await env.KV.put(`backup:blob:${dateStr}`, encrypted, {
            expirationTtl: 30 * 86400
          });
        } else {
          const chunkSize = 20 * 1024 * 1024;
          const parts = Math.ceil(encrypted.length / chunkSize);
          for (let i = 0; i < parts; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, encrypted.length);
            await env.KV.put(`backup:blob:${dateStr}:${i}`, encrypted.slice(start, end), {
              expirationTtl: 30 * 86400
            });
          }
          await env.KV.put(`backup:blob:${dateStr}:parts`, parts.toString(), {
            expirationTtl: 30 * 86400
          });
        }
        
        const list = await env.KV.list({ prefix: 'backup:blob:' });
        const nowMs = now.getTime();
        const dateKeys = list.keys.map(k => k.name).filter(n => /backup:blob:\d{4}-\d{2}-\d{2}$/.test(n));
        const expired = pickExpired(dateKeys.map(k => k.replace('backup:blob:', 'jeffa-backup-') + '.bin'), nowMs)
          .map(k => k.replace('jeffa-backup-', 'backup:blob:').replace('.bin', ''));
        for (const baseKey of expired) {
          await env.KV.delete(baseKey);
          const partCount = await env.KV.get(`${baseKey}:parts`);
          if (partCount) {
            const parts = parseInt(partCount, 10);
            for (let i = 0; i < parts; i++) {
              await env.KV.delete(`${baseKey}:${i}`);
            }
            await env.KV.delete(`${baseKey}:parts`);
          }
        }
        
        await env.KV.put('backup:status', JSON.stringify({
          lastRun: now.toISOString(),
          ok: true,
          bytes: encrypted.length,
          target: 'kv',
          counts: snapshot.d1.counts,
          kvCount: snapshot.kv.count
        }));
      }
      
      if (forceCheck || isFirstOfMonth(now)) {
        await performRestoreCheck(env, key, dateStr);
      }
    } catch (error: any) {
      await env.KV.put('backup:status', JSON.stringify({
        lastRun: now.toISOString(),
        ok: false,
        error: error?.message || String(error)
      }));
    }
}

async function performRestoreCheck(env: Env, key: CryptoKey, dateStr: string): Promise<void> {
  try {
    let encrypted: Uint8Array | null = null;
    
    if (env.BACKUP) {
      const obj = await env.BACKUP.get(`jeffa-backup-${dateStr}.bin`);
      if (obj) {
        encrypted = new Uint8Array(await obj.arrayBuffer());
      }
    } else {
      const partsStr = await env.KV.get(`backup:blob:${dateStr}:parts`);
      if (partsStr) {
        const parts = parseInt(partsStr, 10);
        const chunks: Uint8Array[] = [];
        let totalLen = 0;
        for (let i = 0; i < parts; i++) {
          const chunk = await env.KV.get(`backup:blob:${dateStr}:${i}`, 'arrayBuffer');
          if (chunk) {
            const arr = new Uint8Array(chunk);
            chunks.push(arr);
            totalLen += arr.length;
          }
        }
        if (chunks.length === parts) {
          encrypted = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of chunks) {
            encrypted.set(chunk, offset);
            offset += chunk.length;
          }
        }
      } else {
        const blob = await env.KV.get(`backup:blob:${dateStr}`, 'arrayBuffer');
        if (blob) {
          encrypted = new Uint8Array(blob);
        }
      }
    }
    
    if (!encrypted) {
      await env.KV.put('backup:restorecheck', JSON.stringify({
        at: new Date().toISOString(),
        ok: false,
        error: 'Backup nicht gefunden'
      }));
      return;
    }
    
    const decrypted = await decrypt(key, encrypted);
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
    
    // live row counts only (no full dump)
    const liveCounts: Record<string, number> = {};
    for (const table of Object.keys(snapshot?.d1?.counts || {})) {
      try {
        const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM "${table.replace(/"/g, '""')}"`).first<{ n: number }>();
        liveCounts[table] = r?.n ?? 0;
      } catch { /* table missing -> diff */ }
    }
    
    const result = restoreCheck(snapshot, liveCounts);
    
    await env.KV.put('backup:restorecheck', JSON.stringify({
      at: new Date().toISOString(),
      ok: result.ok,
      diffs: result.diffs
    }));
  } catch (error: any) {
    await env.KV.put('backup:restorecheck', JSON.stringify({
      at: new Date().toISOString(),
      ok: false,
      error: error?.message || String(error)
    }));
  }
}
