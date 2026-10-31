import test from 'node:test'; import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.document = { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } };
const { adminNewer } = await import('../dist/hub/profiles.js');
test('admin cleanup on server is pulled only when its rev is higher', () => {
  assert.equal(adminNewer({}, { _adminRev: 1 }), true);
  assert.equal(adminNewer({ _adminRev: 1 }, { _adminRev: 1 }), false);
  assert.equal(adminNewer({ _adminRev: 2 }, { _adminRev: 1 }), false);
  assert.equal(adminNewer({}, {}), false);
  assert.equal(adminNewer({}, null), false);
});
