<template>
  <div class="prompt-card">
    <span class="prompt-round">Round {{ round }}</span>
    <p class="prompt-text">{{ prompt }}</p>
  </div>
</template>

<script>
export default {
  name: 'PromptCard',
  props: {
    round: {
      type: Number,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
  },
};
</script>

<style scoped>
/* The big prompt display — readable from across the room, sits above the code
   card. Shares the surface/border vocabulary with .code-card in App.vue. */
.prompt-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 900px;
  padding: var(--space-5) var(--space-6);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.prompt-round {
  font-family: var(--font-tile);
  font-size: clamp(0.9rem, 1.4vw, 1.1rem);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--color-muted);
}

.prompt-text {
  margin: 0;
  font-family: var(--font-ui);
  font-size: clamp(1.8rem, 4.5vw, 3.2rem);
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-accent);
}
</style>
