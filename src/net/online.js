// Whether this game is played together with others (src/net/session.js runs it). The rest of
// the game only asks: role is null when playing alone, 'host' for the one whose world it is,
// 'guest' for those who joined.
export const online = {
  role: null,
  code: null,       // the room code (host: while the room is open)
  slot: null,       // our player number while together: the host 0, the guests 1 to 3
  peers: new Map(), // the others, once connected: slot -> { name }
  // the others as of their last word (in this world): [{ slot, name, cube, here (in our
  // cube, not travelling), x, y, z (in their cube), hp, out (downed: game/downed.js) }]
  buddies: [],
};
export const together = () => online.peers.size > 0;

// Every player's colour, by player number: the same on every screen (their hero, our own too
// while together, their health bar and minimap dot: render/partner.js, render/character.js
// tintCharacter, game/minimap.js)
export const PLAYER_COLORS = ['#6fb4e8', '#7cc96e', '#e8a352', '#bb8ce8'];
export const playerColor = slot => PLAYER_COLORS[slot] ?? PLAYER_COLORS[0];

// What the game tells the others as it happens, while playing together (the session sets
// these; null: nobody to tell). For the runner of a cube's enemies (net/foes.js) and those
// shown them:
//   hit(e, damage, crit, dx, dz, knockback)   we hurt enemy e, shown here (game/sword.js hitEnemy)
//   afflict(e, status, spec)                  we set it burning or poisoned (game/statuses.js)
//   launch(pr, e)                             an enemy we run threw pr (game/projectiles.js)
//   landed(pr, end)                           ... and it ended: 'hit', 'blocked' or 'spent'
// and for everyone, so the others see them fly (only the thrower's side hurts anything with them):
//   shoot(shot)                               we shot an arrow, a bolt or a spell (game/shots.js)
//   toss(flask)                               we threw a flask (game/throws.js)
//   defeated(e)                               we got the reward for e (game/enemies.js): apart,
//                                             it stays defeated for the others
//   visited(key)                              we discovered a cube (game/flow.js): theirs too
// and the shared floor loot (game/loot.js; the host decides):
//   drop(key, source, pickups)                we dropped these in cube key (killed, opened, put down)
//   take(key, pickup)                         we reach for it: 'mine' (the host's word, or we are
//                                             the host) or 'asked' (the host will say)
//   forget(key, sources)                      a death put our cube back: those drops are undone
export const relay = { hit: null, afflict: null, launch: null, landed: null, shoot: null, toss: null, defeated: null, visited: null,
  drop: null, take: null, forget: null };
