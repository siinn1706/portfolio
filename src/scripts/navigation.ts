// Commit the native menu before notifying its optional visual consumer.
for (const header of document.querySelectorAll<HTMLElement>('.site-header')) {
  const toggle = header.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const nav = header.querySelector<HTMLElement>('#site-navigation');
  if (!toggle || !nav || header.dataset.navigationMounted === 'true') continue;
  const cleanup: (() => void)[] = [];
  const baseline = [header, toggle, nav].map(element => ({
    element,
    attributes: Array.from(element.attributes, attribute => [attribute.name, attribute.value] as const),
  }));
  const listen = (target: EventTarget, name: string, handler: EventListener) => {
    target.addEventListener(name, handler);
    cleanup.push(() => target.removeEventListener(name, handler));
  };

  try {
    const mobile = matchMedia('(max-width: 640px)');
    let revision = Number(header.dataset.navigationRevision) || 0;
    let mounted = false;
    const commit = (requestedOpen: boolean, returnFocus = false) => {
      const open = mobile.matches && requestedOpen;
      const changed = Boolean(header.dataset.menuOpen) !== open;
      toggle.hidden = !mobile.matches;
      nav.hidden = mobile.matches && !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) header.dataset.menuOpen = 'true';
      else delete header.dataset.menuOpen;
      if (returnFocus && !toggle.hidden) toggle.focus({ preventScroll: true });
      if (mounted && changed) {
        header.dataset.navigationRevision = String(++revision);
        header.dispatchEvent(new CustomEvent('navigation:change', {
          bubbles: true, detail: { open, revision },
        }));
      }
    };
    listen(toggle, 'click', () => commit(!header.dataset.menuOpen));
    listen(header, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape' && header.dataset.menuOpen) {
        event.preventDefault();
        commit(false, true);
      }
    });
    listen(nav, 'click', event => {
      if ((event.target as Element | null)?.closest('a')) commit(false);
    });
    const resize = () => {
      const focused = document.activeElement;
      const hideFocusedNav = mobile.matches && !!focused && nav.contains(focused);
      commit(false, hideFocusedNav);
      if (!mobile.matches && focused === toggle) nav.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
    };
    listen(mobile, 'change', resize);
    resize();
    header.dataset.enhanced = 'true';
    header.dataset.navigationMounted = 'true';
    mounted = true;
  } catch {
    cleanup.reverse().forEach(remove => remove());
    baseline.forEach(({ element, attributes }) => {
      Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));
      attributes.forEach(([name, value]) => element.setAttribute(name, value));
    });
  }
}
