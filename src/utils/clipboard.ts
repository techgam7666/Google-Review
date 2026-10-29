export interface ClipboardCopyResult {
  ok: boolean;
  errorMessage?: string;
}

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  if (!text || !text.trim()) {
    return {
      ok: false,
      errorMessage: 'Nothing to copy yet. Generate or enter your review text first.',
    };
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
  } catch {
    // Fall through to legacy selection copy in restricted iframe sandboxes
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (succeeded) {
      return { ok: true };
    }
    return {
      ok: false,
      errorMessage:
        'Clipboard access was blocked by your browser. Please select the review text above and copy it manually (Ctrl+C or Cmd+C).',
    };
  } catch {
    return {
      ok: false,
      errorMessage:
        'Clipboard access is unavailable in this browser context. Please highlight the review text and copy manually.',
    };
  }
}
