<template>
  <div class="roster" :class="{ 'roster--compact': compact }">
    <div class="roster__head">
      <h2 class="roster__title">Players</h2>
      <span class="roster__count">{{ players.length }}</span>
    </div>

    <ul class="roster__list">
      <li
        v-for="p in players"
        :key="p.id"
        class="player-chip"
        :class="{ 'player-chip--judge': p.id === judgeId }"
      >
        <span class="player-chip__name">{{ p.id }}</span>
        <span
          v-if="p.id === judgeId"
          class="player-chip__judge"
          title="This round's judge"
          >⚖</span
        >
        <span class="player-chip__score">{{ p.score || 0 }}</span>
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'PlayerRoster',
  props: {
    // Roster entries as { id, score } objects — the running scoreboard. Scores
    // update live via the players event when the judge picks a favorite.
    players: {
      type: Array,
      required: true,
    },
    // This round's judge, marked with a gavel badge ("" = no judge).
    judgeId: {
      type: String,
      default: '',
    },
    // Compact variant: a small side panel used during an active round so the
    // prompt and notes stay the focus. The prominent card is used while waiting.
    compact: {
      type: Boolean,
      default: false,
    },
  },
};
</script>

<style scoped>
.roster {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 640px;
  padding: var(--space-4) var(--space-5);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.roster__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.roster__title {
  margin: 0;
  font-size: clamp(1.1rem, 2vw, 1.6rem);
  font-weight: 700;
}

.roster__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2ch;
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-tile);
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-accent-contrast);
  background-color: var(--color-accent);
  border-radius: var(--radius-sm);
}

.roster__list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A single player, styled like a magnetic name tile. */
.player-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-tile);
  font-size: clamp(1rem, 1.5vw, 1.2rem);
  font-weight: 700;
  color: var(--color-tile-text);
  background-color: var(--color-tile);
  border: 1px solid var(--color-tile-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-tile);
}

.player-chip__name {
  line-height: 1;
}

.player-chip__judge {
  line-height: 1;
  font-size: 0.9em;
}

/* Running score, styled like the count badge so numbers read as numbers. */
.player-chip__score {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2ch;
  padding: 1px var(--space-1);
  font-size: 0.85em;
  line-height: 1.2;
  color: var(--color-accent-contrast);
  background-color: var(--color-accent);
  border-radius: var(--radius-sm);
}

.player-chip--judge {
  border-color: var(--color-accent);
}

/* --- Compact variant: a small corner scoreboard during a round. Narrow, with
   players stacked vertically so a full lobby stays a tidy column. --- */
.roster--compact {
  align-items: stretch;
  gap: var(--space-2);
  width: auto;
  min-width: 128px;
  max-width: 200px;
  padding: var(--space-2) var(--space-3);
}

.roster--compact .roster__head {
  justify-content: space-between;
  width: 100%;
}

.roster--compact .roster__title {
  font-size: 0.95rem;
}

.roster--compact .roster__count {
  font-size: 0.8rem;
  padding: 1px var(--space-1);
}

.roster--compact .roster__list {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: var(--space-1);
}

.roster--compact .player-chip {
  justify-content: flex-start;
  padding: var(--space-1) var(--space-2);
  font-size: 0.9rem;
}

/* In the stacked column, right-align every score so the panel reads as a
   scoreboard. */
.roster--compact .player-chip__score {
  margin-left: auto;
}
</style>
