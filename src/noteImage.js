// Renders the current prompt + submitted notes into a single, nicely-formatted
// PNG the host can save — the digital version of snapping a photo of a great
// Ransom Notes hand (a prompt card and the responses laid out around it).
//
// It draws to an offscreen <canvas> rather than screenshotting the DOM, so the
// keepsake is deterministic and self-contained: every note's words are shown
// regardless of its face-up/face-down flip state, and it always uses the light
// "paper" palette so the saved image looks the same for everyone (independent of
// the host's dark-mode setting or the flip animation mid-transition).

import { parseTile, isBreak } from './tiles.js';

// Fixed light "paper" palette — mirrors the light theme in App.vue so the export
// matches the on-screen look, but hardcoded so a dark-mode host still saves a
// bright, printable card.
const PALETTE = {
  bg: '#f3efe6',
  surface: '#ffffff',
  border: '#e4ddcf',
  text: '#2b2b2b',
  muted: '#7a7468',
  accent: '#c0392b',
  accentContrast: '#ffffff',
  slateTop: '#2c2f33',
  slateBottom: '#1c1e21',
  slateBorder: '#0f1012',
  tile: '#fffdf7',
  tileText: '#1a1a1a',
  tileBorder: '#e0d8c6',
};

// Layout constants (logical px; the canvas is drawn at `SCALE`× for crispness).
const L = {
  scale: 2,
  width: 1200,
  margin: 48,
  gutter: 32, // between note columns
  cardPad: 28, // slate inner padding
  badgeSpace: 30, // extra top room on the winner card for its badge
  tileFontSize: 26,
  tilePadX: 13,
  tilePadY: 9,
  colGap: 8, // between tiles in a row
  rowGap: 8, // between wrapped rows of one cluster
  clusterGap: 22, // between clusters (line breaks) of a note
  fontUi:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontTile: '"Courier New", ui-monospace, Menlo, monospace',
};

// A safe download filename for a game's round, e.g. quipnotes-round-3-4821.png.
export function buildFilename(code, round) {
  const safeCode = String(code || 'game').replace(/[^a-z0-9]/gi, '') || 'game';
  return `quipnotes-round-${Number(round) || 0}-${safeCode}.png`;
}

// Split a note's token list into clusters of words on each line break, dropping
// the break markers themselves. Pure and testable; the visual layout builds on
// top of this. E.g. ["1|a", "\n", "2|b", "3|c"] -> [["a"], ["b", "c"]].
export function splitClusters(tokens) {
  const clusters = [];
  let current = [];
  for (const token of tokens || []) {
    if (isBreak(token)) {
      if (current.length) clusters.push(current);
      current = [];
      continue;
    }
    current.push(parseTile(token).word);
  }
  if (current.length) clusters.push(current);
  return clusters;
}

// Measure a note and place its word tiles into centered rows, wrapping within
// `contentWidth` and keeping clusters visually apart. Returns the row list (with
// per-tile geometry) and the total content height. `tileFont` must already be
// set on `ctx` for measureText to be accurate.
function layoutNote(ctx, tokens, contentWidth) {
  const tileH = L.tileFontSize + L.tilePadY * 2;
  const clusters = splitClusters(tokens);

  // A gentle, deterministic hand-placed tilt that continues across the whole
  // note — matches the ±3° jitter NoteSlate.vue gives its magnets.
  let tileIndex = 0;
  const rows = [];
  clusters.forEach((words, ci) => {
    let row = [];
    let rowW = 0;
    let firstRowOfCluster = true;
    const flush = () => {
      rows.push({
        tiles: row,
        width: rowW,
        startCluster: firstRowOfCluster && ci > 0,
      });
      firstRowOfCluster = false;
      row = [];
      rowW = 0;
    };
    for (const word of words) {
      const w = ctx.measureText(word).width + L.tilePadX * 2;
      const tile = { text: word, w, h: tileH, rot: ((tileIndex * 37) % 7) - 3 };
      tileIndex += 1;
      const advance = row.length ? L.colGap + w : w;
      if (row.length && rowW + advance > contentWidth) flush();
      rowW += row.length ? L.colGap + w : w;
      row.push(tile);
    }
    if (row.length) flush();
  });

  // Stack the rows, applying the right gap before each and recording its y.
  let y = 0;
  rows.forEach((r, idx) => {
    const gap = idx === 0 ? 0 : r.startCluster ? L.clusterGap : L.rowGap;
    y += gap;
    r.y = y;
    y += tileH;
  });

  return { rows, height: y, tileH };
}

// Wrap `text` to `maxWidth` at the currently-set ctx.font, returning lines.
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Build the full keepsake canvas for a round. Returns an HTMLCanvasElement.
export function renderNotesImage({
  code,
  round,
  prompt,
  notes,
  favoriteNoteId,
  winnerId,
} = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const list = notes || [];

  const contentWidth = L.width - L.margin * 2;
  const promptFont = 'bold 46px ' + L.fontUi;
  const promptLineH = 56;
  const roundFont = 'bold 20px ' + L.fontTile;
  const winnerFont = 'bold 30px ' + L.fontUi;
  const headerPad = 36;
  const tileFont = `bold ${L.tileFontSize}px ${L.fontTile}`;

  // --- Measure the header card (round label + wrapped prompt + winner line) ---
  ctx.font = promptFont;
  const promptLines = wrapText(ctx, prompt || '', contentWidth - headerPad * 2);
  let headerInner = 26 /*round label*/ + 14 + promptLines.length * promptLineH;
  if (winnerId) headerInner += 16 + 34;
  const headerHeight = headerInner + headerPad * 2;

  // --- Measure every note and lay them out into masonry columns ---
  const cols = list.length <= 1 ? 1 : 2;
  const columnWidth = (contentWidth - (cols - 1) * L.gutter) / cols;
  const cardContentWidth = columnWidth - L.cardPad * 2;

  ctx.font = tileFont;
  const placed = list.map((note) => {
    const layout = layoutNote(ctx, note.tokens, cardContentWidth);
    const isWinner = favoriteNoteId && note.id === favoriteNoteId;
    const badgeSpace = isWinner ? L.badgeSpace : 0;
    const cardHeight = badgeSpace + L.cardPad + layout.height + L.cardPad;
    return { note, layout, isWinner, badgeSpace, cardHeight };
  });

  const colHeights = new Array(cols).fill(0);
  const colX = [];
  for (let c = 0; c < cols; c += 1) {
    colX.push(L.margin + c * (columnWidth + L.gutter));
  }
  for (const card of placed) {
    let target = 0;
    for (let c = 1; c < cols; c += 1) {
      if (colHeights[c] < colHeights[target]) target = c;
    }
    card.x = colX[target];
    card.yInBoard = colHeights[target];
    colHeights[target] += card.cardHeight + L.gutter;
  }
  const boardHeight = Math.max(0, ...colHeights) - (list.length ? L.gutter : 0);

  // --- Vertical assembly ---
  const wordmarkH = 40;
  const footerH = 44;
  const boardTop = L.margin + wordmarkH + 20 + headerHeight + 28;
  const emptyNote = list.length ? 0 : 60;
  const totalHeight =
    boardTop + Math.max(boardHeight, emptyNote) + 28 + footerH + L.margin;

  // --- Size the canvas (this resets the context) and draw at SCALE× ---
  canvas.width = L.width * L.scale;
  canvas.height = Math.round(totalHeight) * L.scale;
  ctx.scale(L.scale, L.scale);

  // Background paper.
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, L.width, totalHeight);

  // Wordmark.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px ' + L.fontTile;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('quipNotes', L.margin, L.margin + 30);
  ctx.textAlign = 'right';
  ctx.font = '16px ' + L.fontUi;
  ctx.fillStyle = PALETTE.muted;
  if (code) ctx.fillText(`Code ${code}`, L.width - L.margin, L.margin + 28);

  // Header card: round label + prompt (+ winner line).
  const headerY = L.margin + wordmarkH + 20;
  ctx.fillStyle = PALETTE.surface;
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  roundRect(ctx, L.margin, headerY, contentWidth, headerHeight, 20);
  ctx.fill();
  ctx.stroke();

  const centerX = L.width / 2;
  ctx.textAlign = 'center';
  let ty = headerY + headerPad + 20;
  ctx.font = roundFont;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(`ROUND ${Number(round) || 0}`.toUpperCase(), centerX, ty);
  ty += 14 + promptLineH - 12;
  ctx.font = promptFont;
  ctx.fillStyle = PALETTE.accent;
  for (const line of promptLines) {
    ctx.fillText(line, centerX, ty);
    ty += promptLineH;
  }
  if (winnerId) {
    ty += 6;
    ctx.font = winnerFont;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`🏆 ${winnerId} wins the round!`, centerX, ty);
  }

  // Notes, or an empty-state line.
  if (!list.length) {
    ctx.font = '22px ' + L.fontUi;
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'center';
    ctx.fillText('No notes were submitted this round.', centerX, boardTop + 34);
  } else {
    for (const card of placed) {
      drawCard(ctx, card, boardTop, columnWidth, tileFont);
    }
  }

  // Footer.
  ctx.font = '15px ' + L.fontUi;
  ctx.fillStyle = PALETTE.muted;
  ctx.textAlign = 'center';
  ctx.fillText(
    'Snapped from quipNotes',
    centerX,
    totalHeight - L.margin + 4
  );

  return canvas;
}

// Draw one note slate (dark board + magnet tiles + optional winner badge).
function drawCard(ctx, card, boardTop, columnWidth, tileFont) {
  const { layout, isWinner, badgeSpace } = card;
  const x = card.x;
  const y = boardTop + card.yInBoard;

  // Slate: a dark board with a vertical gradient and a thick frame.
  const grad = ctx.createLinearGradient(x, y, x + columnWidth, y + card.cardHeight);
  grad.addColorStop(0, PALETTE.slateTop);
  grad.addColorStop(1, PALETTE.slateBottom);
  roundRect(ctx, x, y + badgeSpace, columnWidth, card.cardHeight - badgeSpace, 14);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = isWinner ? 4 : 3;
  ctx.strokeStyle = isWinner ? PALETTE.accent : PALETTE.slateBorder;
  ctx.stroke();

  // Word tiles, centered per row, each with its gentle tilt.
  const contentX = x + L.cardPad;
  const contentTop = y + badgeSpace + L.cardPad;
  ctx.font = tileFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cardContentWidth = columnWidth - L.cardPad * 2;
  for (const row of layout.rows) {
    let tx = contentX + (cardContentWidth - row.width) / 2;
    for (const tile of row.tiles) {
      const cx = tx + tile.w / 2;
      const cy = contentTop + row.y + tile.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((tile.rot * Math.PI) / 180);
      roundRect(ctx, -tile.w / 2, -tile.h / 2, tile.w, tile.h, 6);
      ctx.fillStyle = PALETTE.tile;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = PALETTE.tileBorder;
      ctx.stroke();
      ctx.fillStyle = PALETTE.tileText;
      ctx.fillText(tile.text, 0, 1);
      ctx.restore();
      tx += tile.w + L.colGap;
    }
  }

  // Winner badge — an accent pill straddling the top edge.
  if (isWinner) {
    const label = 'FAVORITE!';
    ctx.font = 'bold 16px ' + L.fontTile;
    const bw = ctx.measureText(label).width + 28;
    const bx = x + columnWidth / 2 - bw / 2;
    const by = y;
    roundRect(ctx, bx, by, bw, 30, 8);
    ctx.fillStyle = PALETTE.accent;
    ctx.fill();
    ctx.fillStyle = PALETTE.accentContrast;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + columnWidth / 2, by + 16);
  }
}

// Render and trigger a download of the keepsake PNG. Resolves true on success.
export function saveNotesImage(opts) {
  const canvas = renderNotesImage(opts);
  const filename = buildFilename(opts && opts.code, opts && opts.round);
  return new Promise((resolve) => {
    const finish = (dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (dataUrl.revoke) URL.revokeObjectURL(dataUrl.url);
      resolve(true);
    };
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        finish({ url: URL.createObjectURL(blob), revoke: true });
      }, 'image/png');
    } else {
      // Fallback for environments without toBlob.
      finish({ url: canvas.toDataURL('image/png'), revoke: false });
    }
  });
}
