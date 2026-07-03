// The server speaks notes as ordered token lists: each tile is a "<id>|<word>"
// string (the id prefix keeps duplicate words distinct) and a line break is the
// reserved BREAK_TILE token. This mirrors quipnotesclient/src/tiles.js — the
// host parses each token into a structured { id, word } at the boundary and
// never leaks the raw string into views.

// A line break between clusters of tiles. Carries no "<id>|<word>" tile, so it
// can never collide with a real tile. Matches BreakToken in the server's
// game.go and BREAK_TILE in the player client.
export const BREAK_TILE = '\n';

export function isBreak(token) {
  return token === BREAK_TILE;
}

export function parseTile(raw) {
  const str = String(raw);
  const sep = str.indexOf('|');
  if (sep === -1) {
    // No id prefix: treat the whole thing as the word, id == word.
    return { id: str, word: str };
  }
  return { id: str.slice(0, sep), word: str.slice(sep + 1) };
}
