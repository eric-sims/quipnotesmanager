// Clipboard helper for sharing a game's invite text. The async Clipboard API
// only works in a secure context (https or localhost), so fall back to a
// hidden <textarea> + execCommand('copy') when it's unavailable.

// shareMessage builds the text a host pastes into a group chat to invite players.
export function shareMessage(code) {
  return `Join my QuipNotes game! Code: ${code}`;
}

// copyText copies text to the clipboard and resolves to true on success.
export async function copyText(text) {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  return legacyCopy(text);
}

function legacyCopy(text) {
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
