<template>
  <div class="stage">
    <header class="masthead">
      <h1 class="app-title">quipNotes</h1>
      <p class="app-subtitle">Host screen</p>
      <p v-if="isOffline" class="offline-badge">Offline mode — no server</p>
    </header>

    <!-- Lobby: no active game yet -->
    <section v-if="!code" class="lobby">
      <p class="lobby__lede">Start a game, then share the code with your friends.</p>
      <button
        @click="startGame"
        class="game-btn game-btn--primary game-btn--xl"
        :disabled="busy"
      >
        {{ busy ? 'Starting…' : 'Start Game' }}
      </button>
    </section>

    <!-- Hosting: a game is running -->
    <section v-else class="hosting">
      <!-- Invite code: a giant centered hero while waiting, then shrinks and
           pins to the corner once the first prompt is drawn (round > 0), so the
           prompt and notes take center stage. -->
      <div class="code-card" :class="{ 'code-card--corner': round > 0 }">
        <span class="code-label">Join at the code</span>
        <span class="code-value">{{ code }}</span>
        <!-- QR deep link — only in the roomy hero (round 0); the corner badge is
             too small to scan. Points at the client with the code prefilled. -->
        <template v-if="round === 0 && qrDataUrl">
          <img :src="qrDataUrl" class="code-qr" alt="QR code to join the game" />
          <span class="code-qr-hint">Scan to join</span>
        </template>
        <button
          @click="copyInvite"
          class="game-btn game-btn--ghost"
          :class="{ 'game-btn--sm': round > 0 }"
        >
          {{ copyLabel }}
        </button>
      </div>

      <!-- Waiting room (no prompt drawn yet): the roster is the focus. Big
           "Draw prompt" button, prominent roster. -->
      <template v-if="round === 0">
        <p class="waiting-lede">Waiting for players…</p>
        <p class="prompt-empty">Draw the first prompt to begin the round.</p>

        <button
          @click="drawPrompt"
          class="game-btn game-btn--primary game-btn--xl"
          :disabled="drawing"
        >
          {{ drawing ? 'Drawing…' : 'Draw prompt' }}
        </button>

        <PlayerRoster v-if="players.length" :players="players" />
      </template>

      <!-- Active round: prompt + notes take center stage; the roster tucks to
           the side as a compact panel, and the draw button is normal-sized. -->
      <template v-else>
        <PromptCard :round="round" :prompt="prompt" />

        <button
          @click="drawPrompt"
          class="game-btn game-btn--primary"
          :disabled="drawing"
        >
          {{ drawing ? 'Drawing…' : 'Next prompt' }}
        </button>

        <PlayerRoster
          v-if="players.length"
          :players="players"
          compact
          class="roster--corner"
        />

        <div class="board-head">
          <h2 class="board-title">Submitted notes</h2>
          <span class="note-count">Number of Notes: {{ responses.length }}</span>
          <span class="note-count">
            Answered: {{ submissionCount }} / {{ players.length }}
          </span>
        </div>

        <p v-if="responses.length === 0" class="board-empty">
          No notes yet. They'll appear here as players submit.
        </p>

        <div v-else class="board">
          <NoteSlate
            v-for="(resp, i) in responses"
            :key="i"
            :tokens="resp"
          />
        </div>
      </template>

      <div class="actions">
        <button @click="endGame" class="game-btn game-btn--danger">End Game</button>
      </div>
    </section>
  </div>
</template>

<script>
import NoteSlate from "@/components/NoteSlate.vue";
import PromptCard from "@/components/PromptCard.vue";
import PlayerRoster from "@/components/PlayerRoster.vue";
import QRCode from "qrcode";
import { apiRequest, startRound, getRound, getPlayers, IS_OFFLINE } from "@/api";
import { createGameSocket } from "@/socket";
import { copyText, shareMessage } from "@/clipboard";
import { joinUrl } from "@/joinUrl";

const CODE_KEY = "quipnotes.manager.code";
const ROUND_KEY = "quipnotes.manager.round";
const PROMPT_KEY = "quipnotes.manager.prompt";

export default {
  name: "App",
  components: {
    NoteSlate,
    PromptCard,
    PlayerRoster,
  },
  data() {
    return {
      code: "",
      responses: [],
      isOffline: IS_OFFLINE,
      busy: false,
      drawing: false,
      copyLabel: "Copy invite",
      // Data-URL of the QR code that deep-links players to the client with the
      // code prefilled. Rendered client-side (no network) whenever code changes.
      qrDataUrl: "",
      // Round / prompt state.
      round: 0,
      prompt: "",
      submissionCount: 0,
      // Roster of joined players ({ id } objects, scoring-ready). Fed by the
      // `players` event + snapshot online, and by fetchPlayers on mount/restore.
      players: [],
    };
  },
  watch: {
    // Regenerate the join QR whenever the active code changes (start, restore,
    // return-to-lobby clears it). Watchers don't fire for the initial restore,
    // so mounted() calls renderQr() directly for that case.
    code(newCode) {
      this.renderQr(newCode);
    },
  },
  mounted() {
    try {
      this.code = window.localStorage.getItem(CODE_KEY) || "";
      this.round = Number(window.localStorage.getItem(ROUND_KEY)) || 0;
      this.prompt = window.localStorage.getItem(PROMPT_KEY) || "";
    } catch {
      this.code = "";
    }
    // Restore a running game: re-sync the round and note board from the
    // server, and (online) reopen the live event stream that keeps both
    // current from here on.
    if (this.code) {
      this.renderQr(this.code);
      this.syncRound();
      this.getNotes();
      this.fetchPlayers();
      this.openEvents();
    }
  },
  beforeUnmount() {
    this.closeEvents();
  },
  methods: {
    persistCode() {
      try {
        if (this.code) {
          window.localStorage.setItem(CODE_KEY, this.code);
        } else {
          window.localStorage.removeItem(CODE_KEY);
        }
      } catch {
        // localStorage can throw in private-mode / sandboxed contexts; ignore.
      }
    },
    persistRound() {
      try {
        if (this.round > 0) {
          window.localStorage.setItem(ROUND_KEY, String(this.round));
          window.localStorage.setItem(PROMPT_KEY, this.prompt);
        } else {
          window.localStorage.removeItem(ROUND_KEY);
          window.localStorage.removeItem(PROMPT_KEY);
        }
      } catch {
        // localStorage can throw in private-mode / sandboxed contexts; ignore.
      }
    },
    // Drop the active game and go back to the lobby. Used both when the host
    // ends a game and when the server tells us the game is gone (e.g. it
    // restarted and wiped its in-memory games), so the host is never stranded
    // on a dead code.
    returnToLobby(message) {
      this.closeEvents();
      this.code = "";
      this.responses = [];
      this.round = 0;
      this.prompt = "";
      this.submissionCount = 0;
      this.players = [];
      this.persistCode();
      this.persistRound();
      if (message) alert(message);
    },
    async startGame() {
      if (this.busy) return;
      this.busy = true;
      try {
        const res = await apiRequest("POST", "/games", null, {
          "Content-Type": "application/json",
        });
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        const data = await res.json();
        this.code = data.code;
        this.responses = [];
        this.round = 0;
        this.prompt = "";
        this.submissionCount = 0;
        this.players = [];
        this.persistCode();
        this.persistRound();
        this.fetchPlayers();
        this.openEvents();
      } catch (error) {
        alert(`Could not start game: ${error.message}`);
      } finally {
        this.busy = false;
      }
    },
    // Draw the next prompt to start a round. The server clears the previous
    // round's notes, so we clear the board locally too.
    async drawPrompt() {
      if (!this.code || this.drawing) return;
      this.drawing = true;
      try {
        const res = await startRound(this.code);
        if (res.status === 404) {
          this.returnToLobby(
            "That game no longer exists — the server may have restarted. Back to the lobby."
          );
          return;
        }
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        const data = await res.json();
        this.round = data.round;
        this.prompt = data.prompt;
        this.responses = [];
        this.submissionCount = 0;
        this.persistRound();
      } catch (error) {
        alert(`Could not draw a prompt: ${error.message}`);
      } finally {
        this.drawing = false;
      }
    },
    // Re-sync the current round from the server (used on restore/reconnect).
    async syncRound() {
      if (!this.code) return;
      try {
        const res = await getRound(this.code);
        if (!res.ok) return;
        const data = await res.json();
        this.round = data.round;
        this.prompt = data.prompt;
        this.persistRound();
      } catch {
        // Non-fatal: the poll/socket or a later action will re-sync.
      }
    },
    // Fetch the roster from the server (used on mount/restore and after start).
    // Online, live updates then arrive via the `players` event; offline this is
    // the only source (no socket), matching how offline polls the round.
    async fetchPlayers() {
      if (!this.code) return;
      try {
        const res = await getPlayers(this.code);
        if (!res || !res.ok) return;
        const data = await res.json();
        this.players = data.players || [];
      } catch {
        // Non-fatal: the socket snapshot (online) or a later fetch will re-sync.
      }
    },
    // Open the live event stream (online only). Offline mode has no server; the
    // host drives rounds directly from drawPrompt's response.
    openEvents() {
      if (IS_OFFLINE || this.socket) return;
      this.socket = createGameSocket(this.code, (evt) => this.handleEvent(evt));
    },
    closeEvents() {
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    },
    handleEvent(evt) {
      if (!evt || !evt.type) return;
      switch (evt.type) {
        case "round_started":
          this.round = evt.round;
          this.prompt = evt.prompt;
          this.responses = [];
          this.submissionCount = 0;
          this.persistRound();
          break;
        case "submission":
          this.submissionCount = evt.count;
          // Pull the latest board so notes appear as they come in.
          this.getNotes();
          break;
        case "players":
          // Live roster (join/leave) + the connect snapshot.
          this.players = evt.players || [];
          break;
        case "game_ended":
          this.returnToLobby();
          break;
      }
    },
    async endGame() {
      if (!this.code) return;
      if (!confirm(`End game ${this.code}? Players will be disconnected.`)) return;
      try {
        // A 404 means the game is already gone (the server may have restarted)
        // — that's still a successful end from the host's point of view.
        const res = await apiRequest("DELETE", `/games/${this.code}`, null, {
          "Content-Type": "application/json",
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        this.returnToLobby();
      } catch {
        // The server is unreachable. End locally anyway so the host isn't
        // stranded on a code they can no longer manage.
        this.returnToLobby(
          "Couldn't reach the server, so the game was ended locally."
        );
      }
    },
    getNotes() {
      if (!this.code) return;
      apiRequest("GET", `/games/${this.code}/submitted-notes`, null, {
        "Content-Type": "application/json",
      })
        .then((response) => {
          if (response.status === 404) {
            // The game no longer exists (server likely restarted). Recover to
            // the lobby instead of leaving the host stuck on a dead code.
            this.returnToLobby(
              "That game no longer exists — the server may have restarted. Back to the lobby."
            );
            return null;
          }
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          if (data) this.responses = data.notes;
        })
        .catch((error) => {
          alert(`Error fetching data: ${error.message}`);
        });
    },
    // Render the join deep-link as a QR data-URL (fully client-side). Cleared
    // when there's no active code so a stale QR never lingers in the lobby.
    async renderQr(code) {
      if (!code) {
        this.qrDataUrl = "";
        return;
      }
      try {
        this.qrDataUrl = await QRCode.toDataURL(joinUrl(code), {
          width: 220,
          margin: 1,
        });
      } catch {
        // Non-fatal: fall back to the code + copyable link without a QR.
        this.qrDataUrl = "";
      }
    },
    async copyInvite() {
      const ok = await copyText(shareMessage(this.code));
      this.copyLabel = ok ? "Copied!" : "Copy failed";
      setTimeout(() => (this.copyLabel = "Copy invite"), 1500);
    },
  },
};
</script>

<style>
:root {
  /* --- Spacing scale (a touch roomier than the client, for big screens) --- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 40px;

  /* --- Radius & shadow --- */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --shadow-tile: 1px 2px 4px rgba(0, 0, 0, 0.16);
  --shadow-card: 0 8px 28px rgba(0, 0, 0, 0.12);

  /* --- Typography --- */
  --font-ui: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
  --font-tile: 'Courier New', ui-monospace, 'SF Mono', Menlo, monospace;

  /* --- Light palette (paper) — shared with the player client --- */
  --color-bg: #f3efe6;
  --color-surface: #ffffff;
  --color-text: #2b2b2b;
  --color-muted: #7a7468;
  --color-border: #e4ddcf;

  --color-accent: #c0392b; /* ransom red */
  --color-accent-strong: #a5301f;
  --color-accent-contrast: #ffffff;
  --color-focus: #3a6ea5;

  --color-tile: #fffdf7;
  --color-tile-text: #1a1a1a;
  --color-tile-border: #e0d8c6;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1b1a17;
    --color-surface: #262420;
    --color-text: #ece7db;
    --color-muted: #a39a89;
    --color-border: #3a352d;

    --color-accent: #e05a4a;
    --color-accent-strong: #f06a59;
    --color-accent-contrast: #1b1a17;
    --color-focus: #7aa7d6;

    --color-tile: #f3ecdd;
    --color-tile-text: #1a1a1a;
    --color-tile-border: #cabfa8;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--color-bg);
  background-image: radial-gradient(
    circle at 20% 10%,
    rgba(255, 255, 255, 0.5),
    transparent 60%
  );
  background-attachment: fixed;
}

#app {
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: var(--color-text);
}

.stage {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-5) 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}

/* --- Masthead --- */
.masthead {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.app-title {
  margin: 0;
  font-family: var(--font-tile);
  font-size: clamp(2.6rem, 6vw, 4.5rem);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.app-subtitle {
  margin: 0;
  font-size: clamp(1rem, 1.6vw, 1.3rem);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--color-muted);
}

.offline-badge {
  display: inline-block;
  margin: var(--space-2) 0 0;
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-tile);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-accent-contrast);
  background-color: var(--color-accent);
  border-radius: var(--radius-sm);
}

/* --- Lobby --- */
.lobby {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  margin-top: var(--space-5);
}

.lobby__lede {
  margin: 0;
  font-size: clamp(1.2rem, 2.2vw, 1.7rem);
  color: var(--color-muted);
}

/* --- Hosting --- */
.hosting {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}

/* The big "join here" card — readable from across a room. */
.code-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 640px;
  padding: var(--space-5) var(--space-6);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: padding 0.35s ease, max-width 0.35s ease;
}

/* Once a round is live the code steps aside: it shrinks and pins to the
   top-right corner so the prompt and notes own the center of the screen. */
.code-card--corner {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 20;
  flex-direction: row;
  align-items: center;
  gap: var(--space-3);
  width: auto;
  max-width: none;
  padding: var(--space-2) var(--space-3);
}

.code-label {
  font-size: clamp(0.9rem, 1.4vw, 1.1rem);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--color-muted);
}

/* In the corner the verbose label is dropped so the badge stays compact and
   clears the centered masthead title; the accent code + Copy button read on
   their own. */
.code-card--corner .code-label {
  display: none;
}

.code-value {
  font-family: var(--font-tile);
  font-size: clamp(4rem, 14vw, 9rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--color-accent);
  transition: font-size 0.35s ease;
}

.code-card--corner .code-value {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  letter-spacing: 0.08em;
}

/* Join QR — white quiet-zone keeps it scannable on the paper surface and in
   dark mode (the QR itself is always black-on-white). */
.code-qr {
  width: 220px;
  height: 220px;
  padding: var(--space-2);
  background: #ffffff;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-tile);
}

.code-qr-hint {
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-muted);
}

/* The "Waiting for players…" lede shown above the code while no round is live. */
.waiting-lede {
  margin: 0;
  font-size: clamp(1.2rem, 2.4vw, 1.8rem);
  font-weight: 700;
  color: var(--color-text);
}

/* During a round the roster becomes a compact scoreboard pinned to the top-left
   corner — mirroring the code badge in the top-right. On wide host screens the
   centered content (max 900px) leaves room in the margins for it. On narrower
   screens, where a fixed panel would collide with the prompt, it falls back to
   sitting inline at the left. */
.roster--corner {
  align-self: flex-start;
}

@media (min-width: 1000px) {
  .roster--corner {
    position: fixed;
    top: var(--space-4);
    left: var(--space-4);
    z-index: 20;
    max-height: calc(100vh - 2 * var(--space-4));
    overflow-y: auto;
  }
}

.board-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-3) var(--space-4);
}

.board-title {
  margin: 0;
  font-size: clamp(1.3rem, 2.4vw, 2rem);
  font-weight: 700;
}

.note-count {
  font-family: var(--font-tile);
  font-size: clamp(1rem, 1.6vw, 1.2rem);
  color: var(--color-muted);
}

.board-empty {
  margin: 0;
  font-size: clamp(1rem, 1.8vw, 1.3rem);
  color: var(--color-muted);
}

.prompt-empty {
  margin: 0;
  font-size: clamp(1.1rem, 2vw, 1.5rem);
  color: var(--color-muted);
}

/* Responsive grid of slates — fills the big screen, wraps as needed. */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

/* --- Actions / buttons (shared vocabulary with the client) --- */
.actions {
  display: flex;
  gap: var(--space-4);
  justify-content: center;
  flex-wrap: wrap;
}

.game-btn {
  min-height: 56px;
  padding: var(--space-3) var(--space-5);
  font-family: var(--font-ui);
  font-size: 1.15rem;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease,
    border-color 0.2s ease, transform 0.1s ease;
}

.game-btn--xl {
  min-height: 72px;
  padding: var(--space-4) var(--space-6);
  font-size: 1.5rem;
}

/* Compact button for the shrunk corner code card. */
.game-btn--sm {
  min-height: 34px;
  padding: var(--space-1) var(--space-3);
  font-size: 0.9rem;
}

.game-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.game-btn--primary {
  color: var(--color-accent-contrast);
  background-color: var(--color-accent);
}

.game-btn--primary:hover:not(:disabled) {
  background-color: var(--color-accent-strong);
}

.game-btn--ghost {
  color: var(--color-text);
  background-color: var(--color-surface);
  border-color: var(--color-border);
}

.game-btn--ghost:hover:not(:disabled) {
  border-color: var(--color-muted);
}

.game-btn--danger {
  color: var(--color-accent-contrast);
  background-color: #7a7468;
}

.game-btn--danger:hover:not(:disabled) {
  background-color: var(--color-accent-strong);
}

.game-btn:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.game-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
