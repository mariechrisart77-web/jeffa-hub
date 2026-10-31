import { Env } from './env';

export interface Corrections {
  positive?: string;
  negative?: string;
  goodSeed?: number | null;
}

/**
 * Get condensed feedback corrections for a profile
 */
export async function getCorrections(env: Env, profile: string): Promise<Corrections> {
  if (!env.DB) return {};
  try {
    const row: any = await env.DB.prepare(
      'SELECT positive, negative, good_seed FROM image_feedback_corr WHERE profile = ?'
    ).bind(profile).first();
    if (!row) return {};
    return {
      positive: row.positive || undefined,
      negative: row.negative || undefined,
      goodSeed: row.good_seed ?? undefined
    };
  } catch (e) {
    console.error('getCorrections failed', e);
    return {};
  }
}

/**
 * Load synced profile data
 */
export async function loadSyncedProfile(env: Env, id: string): Promise<{ profile: any; resolved: any; updated: number } | null> {
  if (!env.DB) return null;
  try {
    const row: any = await env.DB.prepare(
      'SELECT data, updated FROM profiles_sync WHERE id = ?'
    ).bind(id).first();
    if (!row || !row.data) return null;
    const parsed = JSON.parse(row.data);
    return {
      profile: parsed.profile,
      resolved: parsed.resolved,
      updated: row.updated
    };
  } catch (e) {
    console.error('loadSyncedProfile failed', e);
    return null;
  }
}

/**
 * Load character card for profile
 */
export async function loadCard(env: Env, profile: string): Promise<any | null> {
  if (!env.DB) return null;
  try {
    const row: any = await env.DB.prepare(
      'SELECT card FROM character_cards WHERE profile = ?'
    ).bind(profile).first();
    if (!row || !row.card) return null;
    return JSON.parse(row.card);
  } catch (e) {
    console.error('loadCard failed', e);
    return null;
  }
}

/**
 * Load ref mode setting for profile
 */
export async function loadRefMode(env: Env, profile: string, dflt: string | null = 'off'): Promise<string | null> {
  if (!env.DB) return dflt;
  try {
    const row: any = await env.DB.prepare(
      'SELECT mode FROM ref_settings WHERE profile = ?'
    ).bind(profile).first();
    return (row?.mode === 'full' ? 'figur' : row?.mode) || dflt; // v35: legacy 'full' read as 'figur'
  } catch (e) {
    console.error('loadRefMode failed', e);
    return dflt;
  }
}

/**
 * Load starred ref (else active gesicht) for profile: raw base64 or null
 * If r2_key set, reads from R2; else reads data column
 */
export async function loadStarRef(env: Env, profile: string): Promise<string | null> {
  if (!env.DB) return null;
  try {
    const row: any = await env.DB.prepare(
      "SELECT id, data, r2_key, mime FROM profile_refs WHERE profile = ? AND (star = 1 OR (cat = 'gesicht' AND active = 1)) ORDER BY star DESC, created DESC LIMIT 1"
    ).bind(profile).first();
    
    if (!row) return null;

    let imageData: string | null = null;
    if (row.r2_key && env.IMAGES) {
      try {
        const obj = await env.IMAGES.get(row.r2_key);
        if (obj) {
          const buf = await obj.arrayBuffer();
          { const u = new Uint8Array(buf); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); imageData = btoa(b); }
        }
      } catch (e) {
        console.error('loadStarRef R2 read failed', e);
      }
    } else if (row.data) {
      imageData = row.data;
    }

    return imageData || null; // raw base64 (same as legacy profile_refs.data)
  } catch (e) {
    console.error('loadStarRef failed', e);
    return null;
  }
}
