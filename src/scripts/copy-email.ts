for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy-email]",
)) {
  const status =
    button.parentElement?.querySelector<HTMLElement>("[role=status]");
  if (!status || button.dataset.copyMounted === 'true') continue;
  button.dataset.copyMounted = 'true';
  button.hidden = false;
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    const hadFocus = document.activeElement === button;
    button.disabled = true;
    button.dataset.copyState = 'pending';
    status.textContent = button.dataset.pending ?? "";
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(button.dataset.copyEmail ?? "");
      button.dataset.copyState = 'success';
      status.textContent = button.dataset.success ?? "";
    } catch {
      button.dataset.copyState = 'failure';
      status.textContent = button.dataset.failure ?? "";
      const manualEmail = button.parentElement?.querySelector<HTMLDetailsElement>('[data-manual-email]');
      if (manualEmail) manualEmail.open = true;
    } finally {
      button.disabled = false;
      // Disabling a focused button may return focus to the body. Restore only
      // when the reader has not moved to another control while copying.
      if (hadFocus && document.activeElement === document.body) button.focus({ preventScroll: true });
    }
  });
}
