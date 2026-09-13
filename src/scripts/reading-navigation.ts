const tools = document.querySelector<HTMLElement>('[data-reading-map]');
if (tools) {
  const pairs: Record<string, string> = JSON.parse(tools.dataset.readingMap || '{}');
  const article = tools.closest('article');
  const localeLink = document.querySelector<HTMLAnchorElement>('.locale-nav a[hreflang]:not([aria-current])');
  const counterpart = localeLink?.getAttribute('href');
  const links = Array.from(article?.querySelectorAll<HTMLAnchorElement>('[data-reading-toc] a') ?? []);
  const targets = Array.from(article?.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id], .evidence-figure[id]') ?? []);
  const sidebar = article?.querySelector<HTMLElement>('.case-toc');
  const details = sidebar?.querySelector('details');
  let observer: IntersectionObserver | undefined;
  let offset = 0;
  let explicit: string | null = null;
  const hashId = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; } };

  function mark(id: string) {
    // No navigation interception: Enter, modifier-click and new tabs use href.
    const translated = Object.hasOwn(pairs, id) && typeof pairs[id] === 'string' ? pairs[id] : '';
    if (localeLink && counterpart) localeLink.href = counterpart + (translated ? `#${encodeURIComponent(translated)}` : '');
    let tocId = id;
    if (!links.some(link => link.hash.slice(1) === encodeURIComponent(id) || decodeURIComponent(link.hash.slice(1)) === id)) {
      const target = targets.find(node => node.id === id);
      const before = target ? targets.filter(node => node === target || Boolean(node.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) : [];
      tocId = [...before].reverse().find(node => links.some(link => decodeURIComponent(link.hash.slice(1)) === node.id))?.id ?? '';
    }
    for (const link of links) {
      if (decodeURIComponent(link.hash.slice(1)) === tocId) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  function locate() {
    if (explicit !== null) { mark(explicit); return; }
    let current = targets[0];
    for (const target of targets) {
      if (target.getBoundingClientRect().top <= offset + 2) current = target;
      else break;
    }
    if (current) mark(current.id);
  }
  function configure() {
    const next = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glass-anchor-offset')) || 32;
    if (details && sidebar) sidebar.toggleAttribute('data-inline', details.getBoundingClientRect().height + next + 24 > innerHeight);
    if (observer && next === offset) return;
    offset = Math.min(next, Math.max(0, innerHeight - 1));
    observer?.disconnect();
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(locate, { rootMargin: `-${offset}px 0px 0px 0px`, threshold: [0, 1] });
      targets.forEach(target => observer!.observe(target));
    }
    locate();
  }
  function readHash() { explicit = location.hash ? hashId() : null; configure(); locate(); }
  // A chosen fragment has priority until the reader starts moving again.
  const release = () => { explicit = null; };
  addEventListener('wheel', release, { passive: true });
  addEventListener('touchmove', release, { passive: true });
  addEventListener('keydown', event => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) release(); });
  addEventListener('hashchange', readHash);
  addEventListener('pageshow', event => {
    if (event.persisted) { explicit = null; configure(); locate(); }
    else readHash();
  });
  // Scrollbar dragging, browser Find and assistive navigation may scroll without
  // wheel/touch/key events. Reconcile after that native scroll has settled.
  addEventListener('scrollend', () => { explicit = null; locate(); });
  addEventListener('resize', () => { configure(); locate(); });
  document.addEventListener('navigation:change', configure);
  if ('ResizeObserver' in window) {
    const resize = new ResizeObserver(configure);
    const header = document.querySelector('.site-header');
    if (header) resize.observe(header);
    if (details) resize.observe(details);
  }
  new MutationObserver(configure).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-glass-layout'] });
  readHash();
}
