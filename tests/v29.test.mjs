import test from 'node:test'; import assert from 'node:assert';
import { enterShouldSend } from '../apps/shared/typing.js';
test('enter: desktop sends, shift newline, touch never, composing never', () => {
  assert.equal(enterShouldSend({ key: 'Enter' }, false), true);
  assert.equal(enterShouldSend({ key: 'Enter', shiftKey: true }, false), false);
  assert.equal(enterShouldSend({ key: 'Enter' }, true), false);
  assert.equal(enterShouldSend({ key: 'Enter', isComposing: true }, false), false);
  assert.equal(enterShouldSend({ key: 'Enter', keyCode: 229 }, false), false);
  assert.equal(enterShouldSend({ key: 'a' }, false), false);
});
