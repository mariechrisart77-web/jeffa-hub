import test from 'node:test';
import assert from 'node:assert/strict';

// mergeServerProfiles is exported from profiles.js, which touches browser APIs at import time
// in some builds; keep the test resilient by importing lazily.
test('mergeServerProfiles adds missing, keeps existing', async () => {
  const mod = await import('../apps/shared/profilemerge.js');
  const { mergeServerProfiles } = mod;
  const local = [{ id: 'a', name: 'Lokal A', _adminRev: 1 }];
  const server = [
    { id: 'a', name: 'Server A', _adminRev: 99 },
    { id: 'b', name: 'Server B', _adminRev: 2 },
    { id: 'c', name: 'Ohne Rev' },
  ];
  const { profiles, added } = mergeServerProfiles(local, server);
  assert.equal(added, 1);
  assert.equal(profiles.length, 2);
  const a = profiles.find(p => p.id === 'a');
  assert.equal(a.name, 'Lokal A');
  assert.equal(profiles.find(p => p.id === 'b').name, 'Server B');
  assert.equal(profiles.find(p => p.id === 'c'), undefined);
});
