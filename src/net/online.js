// Whether this game is played together with someone (src/net/session.js runs it). The rest of
// the game only asks: role is null when playing alone, 'host' for the one whose world it is,
// 'guest' for the one who joined.
export const online = {
  role: null,
  code: null,       // the room code (host: while the room is open)
  partner: null,    // the other player once connected: { name, pid }
  // the other player as of their last word (null alone): cube, here (in our cube, not
  // travelling), x, y, z (in their cube), hp, out (downed: game/downed.js)
  buddy: null,
};
export const isGuest = () => online.role === 'guest' && !!online.partner;

// What the game tells the other side as it happens, while playing together (the session sets
// these; null: nobody to tell). The guest's hits on the host's enemies, and the host's enemy
// projectiles, so the guest sees them fly:
//   hit(e, damage, crit, dx, dz, knockback)   the guest hurt enemy e (game/sword.js hitEnemy)
//   afflict(e, status, spec)                  the guest set it burning or poisoned (game/statuses.js)
//   launch(pr, e)                             an enemy of the host threw pr (game/projectiles.js)
//   landed(pr, end)                           ... and it ended: 'hit', 'blocked' or 'spent'
// and both ways, so the friend sees them fly (only the thrower's side hurts anything with them):
//   shoot(shot)                               we shot an arrow, a bolt or a spell (game/shots.js)
//   toss(flask)                               we threw a flask (game/throws.js)
//   defeated(e)                               we got the reward for e (game/enemies.js): apart,
//                                             it stays defeated for the friend
//   visited(key)                              we discovered a cube (game/flow.js): the friend's too
export const relay = { hit: null, afflict: null, launch: null, landed: null, shoot: null, toss: null, defeated: null, visited: null };
