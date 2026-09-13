const readingStatus = document.querySelector<HTMLElement>('[data-reading-status]');
if (readingStatus) {
  let request = 0;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-fragment]')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const revision = ++request;
      readingStatus.textContent = '';
      document.querySelectorAll('[data-copy-feedback]').forEach(node => { node.textContent = ''; });
      const feedback = button.closest('.heading-group, .figure-actions')?.querySelector<HTMLElement>('[data-copy-feedback]');
      const report = (message: string) => {
        if (revision !== request) return;
        readingStatus.textContent = message;
        if (feedback) feedback.textContent = message;
      };
      const url = new URL(location.href);
      url.hash = button.dataset.copyFragment ?? '';
      try {
        await navigator.clipboard.writeText(url.href);
        report(readingStatus.dataset.success ?? '');
      } catch {
        report(readingStatus.dataset.failure ?? '');
      }
    });
  }
}
