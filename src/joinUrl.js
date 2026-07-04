// Builds the player-client deep link a host shares to invite players. The URL
// carries the game code as a `?code=1234` query param so a scanned QR (or a
// tapped link) lands the player on the join screen with the code prefilled.
//
// The client's public base URL is configurable per environment via
// VITE_CLIENT_URL (see .env / .env.production) and defaults to the production
// GitHub Pages site. Query params work on GitHub Pages with no server config —
// they're handed to the client's JS untouched — which is why this is a plain
// `?code=` link rather than a path route.
// Default when VITE_CLIENT_URL is unset. Read at call time (not module load) so
// tests can stub the env with vi.stubEnv.
const DEFAULT_CLIENT_URL = 'https://play.rotcev.com';

export function joinUrl(code) {
  const clientUrl = import.meta.env.VITE_CLIENT_URL || DEFAULT_CLIENT_URL;
  const base = clientUrl.replace(/\/+$/, '');
  return `${base}/?code=${encodeURIComponent(code)}`;
}
