<template>
  <button
    type="button"
    class="slate"
    :class="{ 'slate--flipped': revealed }"
    :aria-pressed="revealed"
    :aria-label="revealed ? content : 'Hidden note — click to reveal'"
    @click="toggleReveal"
  >
    <span class="slate__inner">
      <!-- Front: the blank black slate, waiting to be flipped. -->
      <span class="slate__face slate__face--front">
        <span class="slate__hint">Click to reveal</span>
      </span>

      <!-- Back: the note, laid out as magnetic word tiles on the slate. -->
      <span class="slate__face slate__face--back">
        <span class="slate__note">
          <span
            v-for="(word, i) in words"
            :key="i"
            class="magnet"
            :style="{ '--rot': rotations[i] + 'deg' }"
            >{{ word }}</span
          >
        </span>
      </span>
    </span>
  </button>
</template>

<script>
export default {
  name: 'NoteSlate',
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
  computed: {
    // Each word becomes its own magnetic tile, like the real game.
    words() {
      return this.content.split(/\s+/).filter(Boolean);
    },
    // A stable, gentle hand-placed jitter per tile (deterministic so it
    // doesn't twitch on re-render).
    rotations() {
      return this.words.map((_, i) => ((i * 37) % 7) - 3);
    },
  },
  methods: {
    toggleReveal() {
      this.revealed = !this.revealed;
    },
  },
};
</script>

<style scoped>
.slate {
  /* The 3D stage for the flip. */
  perspective: 1200px;
  display: block;
  width: 100%;
  min-height: 150px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.slate:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 4px;
  border-radius: var(--radius-md);
}

.slate__inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 150px;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.slate--flipped .slate__inner {
  transform: rotateY(180deg);
}

.slate__face {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

/* The back (the note) sits in normal flow so the slate grows to fit longer
   notes; the front overlays it so the two faces share that height. */
.slate__face--front {
  position: absolute;
  inset: 0;
}

/* --- Front: a real chalk/slate board --- */
.slate__face--front {
  color: rgba(255, 255, 255, 0.78);
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.06), transparent 60%),
    linear-gradient(160deg, #2c2f33 0%, #1c1e21 100%);
  border: 4px solid #0f1012;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.04),
    inset 0 2px 14px rgba(0, 0, 0, 0.6),
    var(--shadow-card);
}

.slate__hint {
  font-family: var(--font-ui);
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
}

.slate:hover .slate__hint {
  opacity: 1;
}

/* --- Back: the slate frame, now holding magnet tiles --- */
.slate__face--back {
  transform: rotateY(180deg);
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.05), transparent 60%),
    linear-gradient(160deg, #2c2f33 0%, #1c1e21 100%);
  border: 4px solid #0f1012;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.04),
    inset 0 2px 14px rgba(0, 0, 0, 0.6),
    var(--shadow-card);
}

.slate__note {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
}

/* A single magnetic word tile, ransom-note style. */
.magnet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-tile);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-tile-text);
  background-color: var(--color-tile);
  border: 1px solid var(--color-tile-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-tile);
  transform: rotate(var(--rot, 0deg));
}

@media (prefers-reduced-motion: reduce) {
  .slate__inner {
    transition: none;
  }
}
</style>
