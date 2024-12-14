<template>
  <div class="card" @click="toggleReveal">
    <p v-if="revealed">{{ content }}</p>
    <p v-else>Click to reveal</p>
  </div>
</template>

<script>

export default {
  name: "ClickCard",
  props: {
    content: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      revealed: false,
    };
  },
  methods: {
    toggleReveal() {
      this.revealed = !this.revealed;
    },
  },
};
</script>

<style scoped>
.card {
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  background-color: #f9f9f9;
  transition: box-shadow 0.1s;
  margin: 10px;
}
.card:hover {
  box-shadow: 0 5px 12px rgba(0, 0, 0, 0.5);
}
</style>
