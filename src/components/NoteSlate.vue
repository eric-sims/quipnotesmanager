<template>
  <button
    type="button"
    class="slate"
    :class="{ 'slate--flipped': flipped, 'slate--winner': winner }"
    :aria-pressed="flipped"
    :aria-label="flipped ? ariaText : 'Hidden note'"
    :disabled="!flipped && !flippable"
    @click="onClick"
  >
    <span class="slate__inner">
      <!-- Front: the blank black slate, waiting to be flipped. -->
      <span class="slate__face slate__face--front">
        <span class="slate__hint">{{
          flippable ? 'Click to reveal' : 'Waiting for the judge…'
        }}</span>
      </span>

      <!-- Back: the note, laid out as magnetic word tiles on the slate. Each
           cluster the player separated with a line break is its own row, the
           way tiles spaced apart on a magnetic slate read as distinct
           expressions. -->
      <span class="slate__face slate__face--back">
        <span v-if="winner" class="slate__winner-badge">Favorite!</span>
        <span class="slate__note">
          <span
            v-for="(line, li) in lines"
            :key="li"
            class="slate__line"
          >
            <span
              v-for="word in line"
              :key="word.key"
              class="magnet"
              :style="{ '--rot': word.rot + 'deg' }"
              >{{ word.text }}</span
            >
          </span>
        </span>
      </span>
    </span>
  </button>
</template>

<script>
import { parseTile, isBreak } from '../tiles.js';

export default {
  name: 'NoteSlate',
  props: {
    // The note as its ordered token list: tile keys ("42|banana") plus
    // BREAK_TILE markers between clusters.
    tokens: {
      type: Array,
      required: true,
    },
    // Face-up state is server-owned now: the judge flips from their phone and
    // note_flipped events drive this prop, so the room follows along. Clicking
    // the face-down slate emits `flip` (the host may flip too); flips are
    // one-way, so a face-up slate ignores clicks.
    flipped: {
      type: Boolean,
      default: false,
    },
    // Whether this screen may flip the card yet (judging open, or a judge-less
    // round). Face-down and unflippable renders as "Waiting for the judge…".
    flippable: {
      type: Boolean,
      default: true,
    },
    // True for the judge's picked favorite: highlighted with a badge.
    winner: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['flip'],
  computed: {
    // Split the token list into clusters on each break, then parse every tile
    // into a magnet. A running index drives a stable, gentle hand-placed jitter
    // (deterministic so it doesn't twitch on re-render) that continues across
    // lines, so the whole note keeps one consistent scatter.
    lines() {
      const out = [];
      let current = [];
      let i = 0;
      for (const token of this.tokens) {
        if (isBreak(token)) {
          if (current.length) out.push(current);
          current = [];
          continue;
        }
        const { word } = parseTile(token);
        current.push({ key: i, text: word, rot: ((i * 37) % 7) - 3 });
        i += 1;
      }
      if (current.length) out.push(current);
      return out;
    },
    // Screen-reader text: words joined by spaces, clusters by a pause.
    ariaText() {
      return this.lines.map((line) => line.map((w) => w.text).join(' ')).join('. ');
    },
  },
  methods: {
    onClick() {
      if (!this.flipped && this.flippable) this.$emit('flip');
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

/* Face-down but not flippable yet: the card is informational, not a control. */
.slate:disabled {
  cursor: default;
}

/* The picked favorite glows in the accent color. */
.slate--winner .slate__face--back {
  border-color: var(--color-accent);
  box-shadow:
    0 0 0 4px var(--color-accent),
    inset 0 2px 14px rgba(0, 0, 0, 0.6),
    var(--shadow-card);
}

.slate__winner-badge {
  position: absolute;
  top: calc(-1 * var(--space-3));
  left: 50%;
  transform: translateX(-50%) rotate(-3deg);
  z-index: 1;
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-tile);
  font-size: 1rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-accent-contrast);
  background-color: var(--color-accent);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-tile);
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
  position: relative; /* anchors the winner badge */
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
  flex-direction: column;
  /* Clusters sit clearly apart so a line break reads as a distinct expression,
     not just another wrapped row within a long cluster. */
  gap: var(--space-6);
  align-items: center;
  justify-content: center;
  width: 100%;
}

/* One cluster of tiles (an "expression"): its own centered row of magnets. A
   long cluster wraps, but with a tight row-gap so its wrapped rows stay visibly
   closer together than the space between clusters. */
.slate__line {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-2);
  row-gap: var(--space-1);
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
