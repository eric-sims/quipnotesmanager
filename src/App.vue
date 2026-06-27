<template>
  <h1>QuipNotes Host</h1>
  <p v-if="isOffline" class="offline-badge">Offline mode — no server</p>

  <!-- Lobby: no active game yet -->
  <div v-if="!code" class="lobby">
    <p>Start a game, then share the code with your friends.</p>
    <button @click="startGame" class="gameButton" :disabled="busy">Start Game</button>
  </div>

  <!-- Hosting: a game is running -->
  <div v-else>
    <div class="code-bar">
      <span class="code-label">Game code</span>
      <span class="code-value">{{ code }}</span>
      <button @click="copyInvite" class="gameButton small">{{ copyLabel }}</button>
    </div>

    <p>Number of Notes: {{ responses.length }}</p>
    <div id="app" class="center">
      <ClickCard v-for="resp in responses" :key="resp" :content="resp" />
    </div>

    <div class="actions">
      <button @click="getNotes" class="gameButton">Get Notes</button>
      <button @click="clearNotes" class="gameButton">Clear Notes</button>
      <button @click="endGame" class="gameButton danger">End Game</button>
    </div>
  </div>
</template>

<script>
import ClickCard from "@/components/ClickCard.vue";
import { apiRequest, IS_OFFLINE } from "@/api";
import { copyText, shareMessage } from "@/clipboard";

const CODE_KEY = "quipnotes.manager.code";

export default {
  name: "App",
  components: {
    ClickCard,
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
        const res = await apiRequest("DELETE", `/games/${this.code}`, null, {
          "Content-Type": "application/json",
        });
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        this.code = "";
        this.responses = [];
        this.persistCode();
      } catch (error) {
        alert(`Could not end game: ${error.message}`);
      }
    },
    getNotes() {
      if (!this.code) return;
      apiRequest("GET", `/games/${this.code}/submitted-notes`, null, {
        "Content-Type": "application/json",
      })
        .then((response) => {
          if (!response.ok) {
            const msg =
              response.status === 404
                ? "Game not found"
                : `HTTP error! Status: ${response.status}`;
            throw new Error(msg);
          }
          return response.json();
        })
        .then((data) => {
          this.responses = data.notes;
        })
        .catch((error) => {
          alert(`Error fetching data: ${error.message}`);
        });
    },
    clearNotes() {
      if (!this.code) return;
      apiRequest("DELETE", `/games/${this.code}/submitted-notes`, null, {
        "Content-Type": "application/json",
      }).then((response) => {
        if (!response.ok) {
          alert(
            `Error clearing notes: ${
              response.status === 404 ? "Game not found" : response.status
            }`
          );
          return;
        }
        this.responses = [];
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
body {
  background-color: #10ac8f;
}
#app {
  font-family: "Lucida Console", "Courier New", monospace;
  font-weight: bold;
  font-size: x-large;
}
.center {
  margin: auto;
  width: 50%;
  padding: 10px;
}
.lobby {
  margin: 20px;
}
.code-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 16px;
  font-family: "Lucida Console", "Courier New", monospace;
}
.code-label {
  font-size: 16px;
  opacity: 0.8;
}
.code-value {
  font-size: 40px;
  font-weight: bold;
  letter-spacing: 6px;
  color: #fff;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.offline-badge {
  display: inline-block;
  padding: 4px 10px;
  font: 14px "Lucida Console", "Courier New", monospace;
  font-weight: bold;
  color: #fff;
  background-color: #b8860b;
  border-radius: 4px;
}
.gameButton {
  width: 200px; /* Set button width in pixels */
  height: 50px; /* Set button height in pixels */
  padding: 10px; /* Add padding around text */
  font-size: 18px; /* Adjust text size within the button */
}
.gameButton.small {
  width: auto;
  height: auto;
  padding: 6px 12px;
  font-size: 14px;
}
.gameButton.danger {
  background-color: #c0392b;
  color: #fff;
}
.gameButton:disabled {
  opacity: 0.5;
}
</style>
