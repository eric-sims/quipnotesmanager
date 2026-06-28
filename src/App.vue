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
      <div class="code-card">
        <span class="code-label">Join at the code</span>
        <span class="code-value">{{ code }}</span>
        <button @click="copyInvite" class="game-btn game-btn--ghost">
          {{ copyLabel }}
        </button>
      </div>

      <div class="board-head">
        <h2 class="board-title">Submitted notes</h2>
        <span class="note-count">Number of Notes: {{ responses.length }}</span>
      </div>

      <p v-if="responses.length === 0" class="board-empty">
        No notes yet. Press <strong>Get Notes</strong> to pull them in.
      </p>

      <div v-else class="board">
        <NoteSlate v-for="resp in responses" :key="resp" :content="resp" />
      </div>

      <div class="actions">
        <button @click="getNotes" class="game-btn game-btn--primary">Get Notes</button>
        <button @click="clearNotes" class="game-btn game-btn--ghost">Clear Notes</button>
        <button @click="endGame" class="game-btn game-btn--danger">End Game</button>
      </div>
    </section>
  </div>
</template>

<script>
import NoteSlate from "@/components/NoteSlate.vue";
import { apiRequest, IS_OFFLINE } from "@/api";
import { copyText, shareMessage } from "@/clipboard";

const CODE_KEY = "quipnotes.manager.code";

export default {
  name: "App",
  components: {
    NoteSlate,
  },
  data() {
    return {
      code: "",
      responses: [],
      isOffline: IS_OFFLINE,
      busy: false,
      copyLabel: "Copy invite",
    };
  },
  mounted() {
    try {
      this.code = window.localStorage.getItem(CODE_KEY) || "";
    } catch {
      this.code = "";
    }
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
    // Drop the active game and go back to the lobby. Used both when the host
    // ends a game and when the server tells us the game is gone (e.g. it
    // restarted and wiped its in-memory games), so the host is never stranded
    // on a dead code.
    returnToLobby(message) {
      this.code = "";
      this.responses = [];
      this.persistCode();
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
        this.persistCode();
      } catch (error) {
        alert(`Could not start game: ${error.message}`);
      } finally {
        this.busy = false;
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
    clearNotes() {
      if (!this.code) return;
      apiRequest("DELETE", `/games/${this.code}/submitted-notes`, null, {
        "Content-Type": "application/json",
      })
        .then((response) => {
          if (response.status === 404) {
            this.returnToLobby(
              "That game no longer exists — the server may have restarted. Back to the lobby."
            );
            return;
          }
          if (!response.ok) {
            alert(`Error clearing notes: ${response.status}`);
            return;
          }
          this.responses = [];
        })
        .catch((error) => {
          alert(`Error clearing notes: ${error.message}`);
        });
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
}

.code-label {
  font-size: clamp(0.9rem, 1.4vw, 1.1rem);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--color-muted);
}

.code-value {
  font-family: var(--font-tile);
  font-size: clamp(4rem, 14vw, 9rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--color-accent);
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
