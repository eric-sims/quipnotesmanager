// Thin, resilient WebSocket wrapper over a game's event stream
// (GET /games/:code/events). Used online only — offline mode has no server, so
// the app drives rounds directly and does not open a socket.
//
// Server -> client events are JSON objects: { type, ... }:
//   round_started { round, prompt }
//   submission    { round, count, total }
//   players       { players: [{ id }] }   (roster on join/leave + connect snapshot)
//   game_ended    {}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';

// Derive the ws(s):// events URL from the http(s):// API base.
function eventsUrl(code) {
  const base = API_URL.replace(/^http/i, 'ws');
  return `${base}/games/${code}/events`;
}

// Opens a WebSocket to a game's event stream. `onEvent(evt)` receives each
// parsed event. Reconnects with capped exponential backoff until close() is
// called by the caller. Returns a handle: { close() }.
export function createGameSocket(code, onEvent) {
  let ws = null;
  let closed = false;
  let retry = 0;
  let reconnectTimer = null;

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(eventsUrl(code));
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retry = 0;
    };
    ws.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        // Ignore malformed frames.
      }
    };
    ws.onerror = () => {
      // onclose will follow and handle the reconnect.
      try {
        ws.close();
      } catch {
        // no-op
      }
    };
    ws.onclose = () => {
      if (!closed) scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    // 0.5s, 1s, 2s, ... capped at 10s.
    const delay = Math.min(10000, 500 * 2 ** retry);
    retry += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // no-op
        }
      }
    },
  };
}
