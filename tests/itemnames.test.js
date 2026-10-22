import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_PORTAL, TOWN_PORTAL } from '../src/core/items.js';
import { online } from '../src/net/online.js';
import { itemName, defName, defDescription } from '../src/game/itemnames.js';

test('playing together the room portal scroll goes by the teleport scroll, the same item', () => {
  const scroll = { itemId: ROOM_PORTAL.id, instanceId: 'a', count: 1 };
  assert.equal(itemName(scroll), 'Room Portal Scroll');
  assert.match(defDescription(ROOM_PORTAL), /after 3 seconds of holding still/);
  assert.doesNotMatch(defDescription(ROOM_PORTAL), /to a friend/);
  online.peers.set(1, { name: 'Anna' });
  try {
    assert.equal(itemName(scroll), 'Teleport Scroll');
    assert.equal(defName(ROOM_PORTAL), 'Teleport Scroll');
    assert.match(defDescription(ROOM_PORTAL), /to a friend/);
    assert.equal(defName(TOWN_PORTAL), TOWN_PORTAL.name, 'the others keep their name');
    assert.equal(scroll.itemId, ROOM_PORTAL.id);
  } finally { online.peers.clear(); }
  assert.equal(itemName(scroll), 'Room Portal Scroll');
});
