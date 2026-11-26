// A value that changes many times a second, outside the game screen's state (components/games/fx/ticking): whoever
// shows it hears of a change, and only of a real one, so a count-up that stays on the same number redraws nothing.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { makeTicking } from '@/components/games/fx/ticking';

describe('ticking', () => {
  test('starts at its first value and keeps the last one set', () => {
    const t = makeTicking(0);
    assert.equal(t.get(), 0);
    t.set(120);
    assert.equal(t.get(), 120);
  });

  test('a listener hears each change, not a value set again', () => {
    const t = makeTicking(5);
    let heard = 0;
    t.subscribe(() => heard++);
    t.set(5);
    assert.equal(heard, 0);
    t.set(6);
    t.set(6);
    t.set(7);
    assert.equal(heard, 2);
  });

  test('a listener that left hears nothing more', () => {
    const t = makeTicking<number[]>([]);
    let heard = 0;
    const leave = t.subscribe(() => heard++);
    t.set([1]);
    leave();
    t.set([1, 2]);
    assert.equal(heard, 1);
    assert.deepEqual(t.get(), [1, 2]);
  });
});
