<template>
  <h1>Turned In Ransom Notes</h1>
  <p v-if="isOffline" class="offline-badge">Offline mode — no server</p>
  <p>Number of Notes: {{responses.length}}</p>
  <div id="app" class="center">
    <ClickCard v-for="resp in responses" :key="resp" :content="resp"/>
  </div>

  <button @click="getNotes" class="gameButton"> Get Notes </button>
  <button @click="clearNotes" class="gameButton"> Clear Notes</button>
</template>

<script>
import ClickCard from "@/components/ClickCard.vue";
import {apiRequest, IS_OFFLINE} from "@/api";

export default {
  name: "App",
  components: {
    ClickCard,
  },
  data() {
    return {
      responses: [],
      isOffline: IS_OFFLINE,
    };
  },
  methods: {
    getNotes() {
      apiRequest("GET", "/game/submitted-notes", null, {'Content-Type': 'application/json'})
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            this.responses = data.notes;
          }).catch(error => {
        alert(`Error fetching data: ${error.message}`);
      })
    },
    clearNotes() {
      apiRequest("DELETE", "/game/submitted-notes", null, {'Content-Type': 'application/json'})
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
            this.responses = [];
          })
    }
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
</style>