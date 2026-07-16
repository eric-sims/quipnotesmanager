<template>
  <div class="prompt-card">
    <p class="prompt-text">{{ prompt }}</p>
  </div>
</template>

<script>
export default {
  name: 'PromptCard',
  props: {
    // The round's prompt. The round *number* is the host rail's job — printing
    // it here too cost a whole row above the notes for a fact already on screen.
    prompt: {
      type: String,
      required: true,
    },
  },
};
</script>

<style scoped>
/* The prompt display — the loudest thing on the host screen after the notes
   themselves. Shares the surface/border vocabulary with .code-card in App.vue.
   Sized to stay readable across a room while leaving the notes room to breathe:
   the notes are what everyone is actually reading. */
.prompt-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 900px;
  padding: var(--space-4) var(--space-5);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.prompt-text {
  margin: 0;
  font-family: var(--font-ui);
  font-size: clamp(1.5rem, 3.2vw, 2.4rem);
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-accent);
}
</style>
