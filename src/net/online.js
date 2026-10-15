// Whether this game is played together with someone (src/net/session.js runs it). The rest of
// the game only asks: role is null when playing alone, 'host' for the one whose world it is,
// 'guest' for the one who joined.
export const online = {
  role: null,
  code: null,       // the room code (host: while the room is open)
  partner: null,    // the other player once connected: { name }
};
export const isGuest = () => online.role === 'guest' && !!online.partner;
