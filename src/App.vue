<template>
  <div class="app">
    <!-- Host rail: the app chrome once a game is loaded. It replaces the
         masthead (branding costs ~150px of the room's sightline) and collects
         every host-only control — code, invite, draw, end — into one strip, so
         the prompt and notes own the screen below it. -->
    <header v-if="code" class="host-rail">
      <div class="host-rail__context">
        <template v-if="round > 0">
          <span class="rail-round">Round {{ round }}</span>
          <span v-if="judgeId" class="judge-line">
            <span class="judge-line__label">Judge</span> {{ judgeId }}
          </span>
        </template>
        <span v-else class="rail-waiting">Waiting for players…</span>
        <span v-if="isOffline" class="offline-badge">Offline</span>
      </div>

      <!-- Controls. The code + invite + draw only ride here during a round; at
           round 0 the centered hero owns the code and the big Draw button. -->
      <div class="host-rail__actions">
        <template v-if="round > 0">
          <span class="rail-code">{{ code }}</span>
          <button
            @click="copyInvite"
            class="game-btn game-btn--ghost game-btn--sm"
          >
            {{ copyLabel }}
          </button>
          <button
            @click="drawPrompt"
            class="game-btn game-btn--primary game-btn--sm"
            :disabled="drawing"
          >
            {{ drawing ? 'Drawing…' : 'Next prompt' }}
          </button>
        </template>
        <button @click="endGame" class="game-btn game-btn--danger game-btn--sm">
          End Game
        </button>
      </div>
    </header>

    <div class="stage" :class="{ 'stage--hosting': code }">
      <header v-if="!code" class="masthead">
        <h1 class="app-title">quipNotes</h1>
        <p class="app-subtitle">Host screen</p>
        <p v-if="isOffline" class="offline-badge">Offline mode — no server</p>
      </header>

      <!-- Lobby: no active game yet -->
      <section v-if="!code" class="lobby">
        <p class="lobby__lede">Start a game, then share the code with your friends.</p>

        <!-- Family-friendly toggle: set before starting; fixed once the game runs. -->
        <label class="family-toggle" :class="{ 'family-toggle--on': familyFriendly }">
          <input
            type="checkbox"
            class="family-toggle__input"
            v-model="familyFriendly"
          />
          <span class="family-toggle__switch" aria-hidden="true"></span>
          <span class="family-toggle__text">
            <span class="family-toggle__title">Family-friendly mode</span>
            <span class="family-toggle__hint">
              Skip prompts that are explicit, suggestive, or sexual.
            </span>
          </span>
        </label>

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
        <!-- Waiting room (no prompt drawn yet): nobody's playing yet, so the
             code is the whole point — a giant centered hero with the QR. -->
        <template v-if="round === 0">
          <div class="code-card">
            <span class="code-label">Join at the code</span>
            <span class="code-value">{{ code }}</span>
            <!-- QR deep link — only in the roomy hero; the rail badge is too
                 small to scan. Points at the client with the code prefilled. -->
            <template v-if="qrDataUrl">
              <img :src="qrDataUrl" class="code-qr" alt="QR code to join the game" />
              <span class="code-qr-hint">Scan to join</span>
            </template>
            <button @click="copyInvite" class="game-btn game-btn--ghost">
              {{ copyLabel }}
            </button>
          </div>

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

        <!-- Active round: a real two-column grid — scoreboard rail on the left,
             prompt + notes filling the rest. A grid (rather than the fixed
             overlays this replaces) means the roster reserves its own gutter
             instead of floating over the board's first column. -->
        <div v-else class="round-layout">
          <aside class="round-layout__side">
            <PlayerRoster
              v-if="players.length"
              :players="players"
              :judge-id="judgeId"
              compact
            />
          </aside>

          <main class="round-layout__main">
            <PromptCard :prompt="prompt" />

            <!-- The round's reveal: who won, once the judge picks. -->
            <p v-if="winnerId" class="winner-banner">
              🏆 {{ winnerId }} wins the round!
            </p>

            <!-- One strip for everything about the board: judging status, the
                 counts, and the keepsake export. Three stacked rows of this used
                 to cost ~165px above the notes. -->
            <div class="board-meta">
              <span v-if="judgingOpen && !winnerId" class="board-meta__lede">
                Judging!{{ judgeId ? ` ${judgeId} picks a favorite.` : '' }}
              </span>
              <span class="note-count">{{ responses.length }} notes</span>
              <span class="note-count">
                Answered {{ submissionCount }} / {{ answerTotal }}
              </span>
              <!-- Save the prompt + notes as a shareable keepsake image (the
                   digital version of snapping a photo of a great hand). -->
              <button
                @click="saveImage"
                class="game-btn game-btn--ghost game-btn--sm"
                :disabled="responses.length === 0 || savingImage"
              >
                {{ savingImage ? 'Saving…' : '📸 Save image' }}
              </button>
            </div>

            <p v-if="responses.length === 0" class="board-empty">
              No notes yet. They'll appear here as players submit.
            </p>

            <div v-else class="board">
              <NoteSlate
                v-for="note in responses"
                :key="note.id"
                :tokens="note.tokens"
                :flipped="note.flipped"
                :flippable="canFlip"
                :winner="note.id === favoriteNoteId"
                @flip="flipNote(note.id)"
              />
            </div>
          </main>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import NoteSlate from "@/components/NoteSlate.vue";
import PromptCard from "@/components/PromptCard.vue";
import PlayerRoster from "@/components/PlayerRoster.vue";
import QRCode from "qrcode";
import {
  apiRequest,
  startRound,
  getRound,
  getPlayers,
  flipNote as apiFlipNote,
  IS_OFFLINE,
} from "@/api";
import { createGameSocket } from "@/socket";
import { copyText, shareMessage } from "@/clipboard";
import { joinUrl } from "@/joinUrl";
import { saveNotesImage } from "@/noteImage";

const CODE_KEY = "quipnotes.manager.code";
const ROUND_KEY = "quipnotes.manager.round";
const PROMPT_KEY = "quipnotes.manager.prompt";
const FAMILY_KEY = "quipnotes.manager.familyFriendly";

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
      savingImage: false,
      // Family-friendly mode: when on, the game is created with only
      // family-friendly prompts (no explicit/suggestive content). Chosen in the
      // lobby before starting; fixed for the life of the game. Persisted so the
      // host's preference sticks across sessions.
      familyFriendly: false,
      copyLabel: "Copy invite",
      // Data-URL of the QR code that deep-links players to the client with the
      // code prefilled. Rendered client-side (no network) whenever code changes.
      qrDataUrl: "",
      // Round / prompt state.
      round: 0,
      prompt: "",
      submissionCount: 0,
      // Players expected to answer this round (judge excluded), as reported by
      // the server; 0 until the first submission/round sync.
      submissionTotal: 0,
      // Roster of joined players ({ id, score } objects). Fed by the `players`
      // event + snapshot online, and by fetchPlayers on mount/restore. Scores
      // update live when the judge picks a favorite.
      players: [],
      // Judging state for the active round. The judge flips notes from their
      // phone (this screen mirrors each flip via note_flipped) and picks the
      // favorite; this screen may flip too once judging is open.
      judgeId: "",
      judgingOpen: false,
      favoriteNoteId: 0, // 1-based id of the winning note (0 = none yet)
      winnerId: "",
    };
  },
  watch: {
    // Regenerate the join QR whenever the active code changes (start, restore,
    // return-to-lobby clears it). Watchers don't fire for the initial restore,
    // so mounted() calls renderQr() directly for that case.
    code(newCode) {
      this.renderQr(newCode);
    },
    // Persist the family-friendly preference so it sticks across sessions.
    familyFriendly(on) {
      try {
        window.localStorage.setItem(FAMILY_KEY, on ? "1" : "0");
      } catch {
        // localStorage can throw in private-mode / sandboxed contexts; ignore.
      }
    },
  },
  computed: {
    // How many answers the round expects: the server's count (judge excluded)
    // once it has reported one, else derived from the roster so the indicator
    // isn't 0/0 right after a draw.
    answerTotal() {
      if (this.submissionTotal > 0) return this.submissionTotal;
      return Math.max(this.players.length - (this.judgeId ? 1 : 0), 0);
    },
    // Whether this screen may flip cards: once judging is open, or freely in a
    // judge-less round (mirrors the server's rule — earlier flips would 409).
    canFlip() {
      return this.judgingOpen || !this.judgeId;
    },
  },
  mounted() {
    try {
      this.code = window.localStorage.getItem(CODE_KEY) || "";
      this.round = Number(window.localStorage.getItem(ROUND_KEY)) || 0;
      this.prompt = window.localStorage.getItem(PROMPT_KEY) || "";
      this.familyFriendly = window.localStorage.getItem(FAMILY_KEY) === "1";
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
    resetResponses() {
      this.responses = [];
    },
    // Take a fresh notes list from the server: [{ id, tokens, flipped }] in the
    // server's shuffled display order — the same order the judge's phone shows,
    // so "the third card" means the same note on both screens.
    setResponses(notes) {
      this.responses = notes || [];
    },
    // Reset everything scoped to one round's judging phase.
    resetJudging() {
      this.judgingOpen = false;
      this.favoriteNoteId = 0;
      this.winnerId = "";
      this.submissionCount = 0;
      this.submissionTotal = 0;
    },
    // Apply a RoundState payload (from POST /rounds, GET /round, or a restore).
    // Sets every round/judging field but leaves the note board alone — on a
    // restore this runs concurrently with getNotes(), and the board is reset
    // only where a round actually advances (drawPrompt / round_started).
    applyRoundState(state) {
      if (!state) return;
      this.round = state.round;
      this.prompt = state.prompt;
      this.judgeId = state.judgeId || "";
      this.judgingOpen = !!state.judgingOpen;
      this.submissionCount = Number(state.count) || 0;
      this.submissionTotal = Number(state.total) || 0;
      this.favoriteNoteId = Number(state.favoriteNoteId) || 0;
      this.winnerId = state.winnerId || "";
      this.persistRound();
    },
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
      this.resetResponses();
      this.resetJudging();
      this.round = 0;
      this.prompt = "";
      this.judgeId = "";
      this.players = [];
      this.persistCode();
      this.persistRound();
      if (message) alert(message);
    },
    async startGame() {
      if (this.busy) return;
      this.busy = true;
      try {
        const res = await apiRequest(
          "POST",
          "/games",
          { familyFriendly: this.familyFriendly },
          { "Content-Type": "application/json" }
        );
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        const data = await res.json();
        this.code = data.code;
        this.resetResponses();
        this.resetJudging();
        this.round = 0;
        this.prompt = "";
        this.judgeId = "";
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
        this.applyRoundState(data);
        // The server cleared the previous round's notes; clear the board too.
        this.resetResponses();
      } catch (error) {
        alert(`Could not draw a prompt: ${error.message}`);
      } finally {
        this.drawing = false;
      }
    },
    // Re-sync the current round (judge, judging progress, winner included)
    // from the server. Used on restore/reconnect.
    async syncRound() {
      if (!this.code) return;
      try {
        const res = await getRound(this.code);
        if (!res.ok) return;
        const data = await res.json();
        this.applyRoundState(data);
      } catch {
        // Non-fatal: the poll/socket or a later action will re-sync.
      }
    },
    // Called when the event socket can't (re)connect: probe whether the game
    // still exists. A 404 means the server no longer knows this code (it
    // likely restarted), so recover to the lobby — which also closes the
    // socket and ends its reconnect loop.
    async checkGameAlive() {
      if (!this.code) return;
      try {
        const res = await getRound(this.code);
        if (res.status === 404) {
          this.returnToLobby(
            "That game no longer exists — the server may have restarted. Back to the lobby."
          );
        }
      } catch {
        // Server unreachable: the socket keeps backing off and retrying.
      }
    },
    // Flip a note face-up from the host screen (the judge's phone is the usual
    // driver). Flip locally on success too, so this screen doesn't wait for its
    // own note_flipped echo.
    async flipNote(noteId) {
      if (!this.code || !this.canFlip) return;
      try {
        const res = await apiFlipNote(this.code, noteId);
        if (!res.ok) return; // e.g. 409 while judging is still closed
        this.markFlipped(noteId);
      } catch {
        // Non-fatal: the judge's flip (or a re-fetch) will catch the board up.
      }
    },
    markFlipped(noteId) {
      const note = this.responses.find((n) => n.id === Number(noteId));
      if (note) note.flipped = true;
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
      this.socket = createGameSocket(this.code, (evt) => this.handleEvent(evt), {
        // The socket can't tell "server briefly down" from "game gone" (the
        // server restarted and wiped it). After a few failed reconnects,
        // check over HTTP — a dead code should send us to the lobby, not
        // leave the socket retrying forever.
        onUnreachable: () => this.checkGameAlive(),
      });
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
          // A new round resets the board and judging phase; the same round can
          // be re-announced with a replacement judge (the previous one left),
          // which must keep the board intact.
          if (evt.round !== this.round) {
            this.resetResponses();
            this.resetJudging();
          }
          this.round = evt.round;
          this.prompt = evt.prompt;
          this.judgeId = evt.judgeId || "";
          this.persistRound();
          break;
        case "submission":
          this.submissionCount = evt.count;
          this.submissionTotal = evt.total || 0;
          // Pull the latest board so notes appear (face-down) as they come in.
          this.getNotes();
          break;
        case "judging_ready":
          // All notes are in (or the judge forced it): cards may flip now.
          // Re-fetch the board too — on a reconnect this snapshot event is the
          // cue to catch up on any flips missed while offline.
          this.judgingOpen = true;
          this.getNotes();
          break;
        case "note_flipped":
          // The judge turned a card over on their phone — mirror it here.
          this.markFlipped(evt.noteId);
          break;
        case "favorite_picked":
          // The reveal: highlight the winning note and name its author. The
          // refreshed scores arrive in the players broadcast that follows.
          this.favoriteNoteId = Number(evt.noteId) || 0;
          this.winnerId = evt.winnerId || "";
          this.markFlipped(evt.noteId);
          break;
        case "players":
          // Live roster with scores (join/leave, connect snapshot, post-pick).
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
          if (data) this.setResponses(data.notes);
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
    // Save the current prompt + notes as a formatted PNG keepsake. Renders all
    // notes' words regardless of flip state, and highlights the round's favorite
    // (and its winning author) when the judge has picked one.
    async saveImage() {
      if (this.savingImage || this.responses.length === 0) return;
      this.savingImage = true;
      try {
        const ok = await saveNotesImage({
          code: this.code,
          round: this.round,
          prompt: this.prompt,
          notes: this.responses,
          favoriteNoteId: this.favoriteNoteId,
          winnerId: this.winnerId,
        });
        if (!ok) alert("Couldn't create the image on this browser.");
      } catch (error) {
        alert(`Could not save the image: ${error.message}`);
      } finally {
        this.savingImage = false;
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

/* @media (prefers-color-scheme: dark) {
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
} */

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
  /* Roomy in the lobby; the hosting view overrides this to claw back the
     vertical space the notes need. */
  padding: var(--space-6) var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}

/* --- Host rail: the chrome while a game is loaded ---
   Sticky rather than fixed so it occupies its own height instead of needing the
   stage to reserve a matching offset — and it stays on screen if a very full
   board does end up scrolling. */
.host-rail {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-2) var(--space-4);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-tile);
}

.host-rail__context,
.host-rail__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.rail-round {
  font-family: var(--font-tile);
  font-size: clamp(0.9rem, 1.4vw, 1.1rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--color-muted);
}

/* The invite code, still accent-red and monospaced — small enough to be chrome,
   big enough that a latecomer can read it off the screen. */
.rail-code {
  font-family: var(--font-tile);
  font-size: clamp(1.5rem, 2.6vw, 2.1rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--color-accent);
}

.rail-waiting {
  font-size: clamp(1rem, 1.8vw, 1.3rem);
  font-weight: 700;
}

/* --- Masthead (lobby only — dropped once a game loads, so the room's
   sightline isn't spent on branding) --- */
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

/* --- Family-friendly toggle (lobby) --- */
.family-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  max-width: 440px;
  padding: var(--space-4) var(--space-5);
  text-align: left;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-tile);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.family-toggle--on {
  border-color: var(--color-accent);
}

/* Visually-hidden native checkbox — still focusable and screen-reader-labeled,
   the visible switch below reflects its state. */
.family-toggle__input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* The pill track + knob. */
.family-toggle__switch {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 30px;
  background-color: var(--color-border);
  border-radius: 999px;
  transition: background-color 0.2s ease;
}

.family-toggle__switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  background-color: var(--color-surface);
  border-radius: 50%;
  box-shadow: var(--shadow-tile);
  transition: transform 0.2s ease;
}

.family-toggle--on .family-toggle__switch {
  background-color: var(--color-accent);
}

.family-toggle--on .family-toggle__switch::after {
  transform: translateX(22px);
}

.family-toggle__input:focus-visible + .family-toggle__switch {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.family-toggle__text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.family-toggle__title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
}

.family-toggle__hint {
  font-size: 0.95rem;
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

/* Once a game is loaded the stage tightens up: the rail already provides a
   comfortable top edge, and every pixel here is one the notes don't get. */
.stage--hosting {
  padding: var(--space-4) var(--space-5) var(--space-5);
  gap: var(--space-4);
}

/* The big "join here" card — readable from across a room. Waiting room only;
   during a round the code lives in the rail. Vertical padding is kept tight so
   the whole waiting room (code + QR + draw + roster) clears a laptop viewport
   without a scrollbar. */
.code-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 640px;
  padding: var(--space-4) var(--space-6);
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

/* --- Active-round layout: scoreboard column + prompt/notes column ---
   A real grid, so the roster reserves its own gutter. The fixed-overlay roster
   this replaces sat on top of the board's first column and only looked fine
   because the board started ~690px down the page. */
.round-layout {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(170px, 220px) 1fr;
  gap: var(--space-4);
  align-items: start;
}

.round-layout__main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  min-width: 0; /* let the board grid shrink instead of overflowing the column */
}

/* Too narrow for a side-by-side: the columns stack rather than squeezing the
   notes into a sliver. The scoreboard drops *below* the board — stacked above
   it, a full-width roster costs ~290px before you reach a single note, which is
   the exact problem this layout exists to fix. */
@media (max-width: 900px) {
  .round-layout {
    grid-template-columns: 1fr;
  }

  .round-layout__side {
    order: 2;
  }
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

/* One strip under the prompt carrying the whole state of the board: judging
   status, counts, and the export. The "Submitted notes" heading it replaces was
   labelling the obvious — the notes are the thing you're looking at. */
.board-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2) var(--space-3);
}

.board-meta__lede {
  font-size: clamp(1rem, 1.6vw, 1.2rem);
  font-weight: 600;
  color: var(--color-text);
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

/* Who holds the gavel this round — a rail item, next to the round number. */
.judge-line {
  display: inline-flex;
  align-items: center;
  margin: 0;
  font-family: var(--font-tile);
  font-size: clamp(1rem, 1.6vw, 1.25rem);
  font-weight: 700;
}

.judge-line__label {
  margin-right: var(--space-2);
  padding: var(--space-1) var(--space-2);
  font-size: 0.7em;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--color-accent-contrast);
  background-color: var(--color-accent);
  border-radius: var(--radius-sm);
}

/* The round's reveal — big enough to read across the room. */
.winner-banner {
  margin: 0;
  padding: var(--space-2) var(--space-5);
  font-family: var(--font-tile);
  font-size: clamp(1.3rem, 3vw, 2.2rem);
  font-weight: 700;
  color: var(--color-accent-contrast);
  background-color: var(--color-accent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
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

/* --- Buttons (shared vocabulary with the client) --- */
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
