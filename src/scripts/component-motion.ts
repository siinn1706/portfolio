// HTML/CSS owns the readable final state; this enhancement owns transforms only.
if (document.documentElement.dataset.componentMotionMounted !== 'true') {
  const root = document.documentElement;
  type Owned = { node: HTMLElement; animation: Animation; generation: number; revision: number; kind: string; region: Element | string };
  type Entry = { anchor: HTMLElement; nodes: HTMLElement[]; kind: string; consumed: boolean; owner?: HTMLElement };
  type Snapshot = { instanceId: string; projectId: string; layer: string; revision: number; origin: string };
  const handles = new Map<HTMLElement, Owned>();
  const entries: Entry[] = [];
  const pending = new Set<Entry>();
  const snapshots = new Map<HTMLElement, Snapshot>();
  const removers: (() => void)[] = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 640px), (pointer: coarse)');
  const printing = matchMedia('print');
  let observer: IntersectionObserver | undefined;
  let preferenceObserver: MutationObserver | undefined;
  let generation = 0;
  let suspended = false;
  let failed = false;
  let releaseFrame = 0;
  let press: { pointerId: number; held: Owned[]; remove: () => void } | undefined;
  const enabled = () => !failed && !suspended && !document.hidden && !reduced.matches && !printing.matches && root.dataset.motionOff !== 'true';
  // Identity includes node, animation, generation and committed revision.
  const current = (owned: Owned) => handles.get(owned.node) === owned;
  const stop = (owned: Owned) => {
    if (!current(owned)) return;
    handles.delete(owned.node);
    owned.animation.cancel();
  };
  const cancelWithin = (container: Element) => {
    for (const owned of handles.values()) if (container === owned.node || container.contains(owned.node)) stop(owned);
  };
  const disconnect = () => { observer?.disconnect(); observer = undefined; };
  const release = (immediate = false) => {
    if (releaseFrame) cancelAnimationFrame(releaseFrame);
    releaseFrame = 0;
    const held = press;
    if (!held) return;
    held.remove();
    const finish = () => {
      releaseFrame = 0;
      if (press !== held) return;
      press = undefined;
      held.held.forEach(stop);
    };
    if (immediate) finish();
    else releaseFrame = requestAnimationFrame(finish);
  };
  const consume = (entry: Entry) => {
    entry.consumed = true;
    pending.delete(entry);
    observer?.unobserve(entry.anchor);
    if (entries.every(entry => entry.consumed)) disconnect();
  };
  const settleAll = (consumePending: boolean) => {
    release(true);
    for (const owned of handles.values()) stop(owned);
    if (consumePending) entries.forEach(consume);
    pending.clear();
    disconnect();
  };
  const listen = (target: EventTarget, name: string, handler: EventListener, capture = false) => {
    target.addEventListener(name, handler, capture);
    removers.push(() => target.removeEventListener(name, handler, capture));
  };
  const fail = () => {
    failed = true;
    settleAll(true);
    preferenceObserver?.disconnect();
    removers.reverse().forEach(remove => remove());
    root.dataset.componentMotionFailed = 'true';
  };
  const visible = (node: HTMLElement) => {
    if (node.closest('[hidden]')) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
  };
  const regionFor = (node: HTMLElement, kind: string): Element | string => node.closest('.hero')
    ? (kind === 'portrait' ? 'hero-portrait' : 'hero-text')
    : node.closest('[data-featured-projects], .about-story, .about-projects, .about-direction, .work-list, .main-nav') ?? node;
  const milliseconds = (value: string, fallback: number) => {
    const trimmed = value.trim();
    const parsed = parseFloat(trimmed) * (trimmed.endsWith('ms') ? 1 : 1000);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const pose = (kind: string, direction = 1): [string, number, number] => {
    const small = narrow.matches;
    const y = (distance: number) => `translateY(${distance}px)`;
    switch (kind) {
      case 'identity': return [y(12), 360, 0];
      case 'headline': return [y(small ? 16 : 28), small ? 400 : 520, 0];
      case 'support': return [y(small ? 12 : 18), small ? 340 : 420, small ? 60 : 80];
      case 'portrait': return [small ? 'translateY(24px) rotate(1.5deg)' : 'translate(32px, 20px) rotate(3deg)', small ? 440 : 620, small ? 60 : 80];
      case 'featured': return [small ? y(18) : 'translateY(32px) rotate(-.7deg)', 480, 0];
      case 'project': return [`translate(${direction * (small ? 16 : 32)}px, ${small ? 0 : 6}px)`, small ? 300 : 380, 0];
      case 'tab': return [`translateX(${direction * (small ? 12 : 18)}px)`, 240, 0];
      case 'menu-label': return [y(-8), 180, 0];
      case 'contact-copy': return [y(small ? 12 : 24), small ? 320 : 400, 0];
      case 'contact-platforms': return [y(small ? 10 : 16), small ? 320 : 360, 60];
      case 'about-portrait': return [small ? y(12) : 'translateY(24px) rotate(-2deg)', small ? 320 : 480, 0];
      case 'story': return [y(small ? 12 : 24), small ? 320 : 460, 0];
      case 'topic': return [y(small ? 12 : 24), small ? 320 : 420, 0];
      case 'row': return [y(small ? 12 : 24), small ? 320 : 360, 0];
      default: return [y(small ? 12 : 24), small ? 320 : 400, 0];
    }
  };
  const animate = (nodes: HTMLElement[], kind: string, scope: string, revision: number, direction = 1, stagger = 0, committedAt?: number) => {
    if (!enabled()) return;
    const active = nodes.filter(node => !node.closest('[hidden]'));
    if (!active.length || !active.some(visible)) return;
    // An entry arriving after focus must not move the already-focused control.
    if (revision === 0 && active.some(node => node.contains(document.activeElement))) return;
    if (revision > 0) {
      // Direct input takes priority over an older arrival elsewhere in view.
      const incoming = new Set(active.map(node => regionFor(node, kind)));
      const older = [...new Set(Array.from(handles.values()).filter(owned => visible(owned.node) && !incoming.has(owned.region)).map(owned => owned.region))];
      while (older.length + incoming.size > 2) {
        const region = older.shift();
        for (const owned of handles.values()) if (owned.region === region) stop(owned);
      }
    }
    const ownedGeneration = ++generation;
    const mark = `component-motion:${scope}:${revision}`;
    const [transform, posedDuration, delay] = pose(kind, direction);
    const aboutEntry = revision === 0 && (kind === 'story' || kind === 'topic' || kind.startsWith('about-'));
    const tabStyles = kind === 'tab' ? getComputedStyle(root) : undefined;
    const duration = tabStyles ? milliseconds(tabStyles.getPropertyValue('--duration-fast'), 240) : posedDuration;
    const easing = aboutEntry
      ? 'linear'
      : kind === 'project'
        ? 'cubic-bezier(.2,.75,.2,1)'
        : tabStyles
          ? (tabStyles.getPropertyValue('--ease-smooth-out').trim() || 'cubic-bezier(.22,1,.36,1)')
          : 'cubic-bezier(.22,1,.36,1)';
    const owned: Owned[] = [];
    try {
      performance.mark(`${mark}:start`);
      for (const node of active) {
        const previous = handles.get(node);
        if (previous) stop(previous);
        const startedAt = aboutEntry ? performance.now() : committedAt;
        const animation = node.animate([{ transform }, { transform: 'none' }], {
          duration, delay: delay + stagger, fill: 'backwards', easing,
        });
        // Use the default document clock; browser setup must not restart this interval.
        // About spreads its travel across the interval so later first paint still moves.
        if (startedAt !== undefined) animation.startTime = startedAt;
        animation.id = `component-motion:${kind}:${ownedGeneration}:${revision}`;
        const handle = { node, animation, generation: ownedGeneration, revision, kind, region: regionFor(node, kind) };
        handles.set(node, handle);
        owned.push(handle);
      }
      void Promise.all(owned.map(handle => handle.animation.finished.then(() => true, () => false))).then(results => {
        performance.mark(`${mark}:${owned.every(current) && results.every(Boolean) ? 'settled' : 'cancelled'}`);
        // A stale callback may not clear a newer node/handle/revision.
        owned.forEach(stop);
        drainEntries();
      });
    } catch { fail(); }
  };
  const articleNodes = (wrapper: HTMLElement) => Array.from(wrapper.querySelectorAll<HTMLElement>('[data-open-desk]:not([hidden]) [data-component-motion^="article-"]')).filter(node => !node.closest('[hidden]'));
  const playEntry = (entry: Entry, stagger: number) => {
    consume(entry);
    if (entry.kind === 'featured') entry.nodes = articleNodes(entry.owner!);
    animate(entry.nodes, entry.kind, `entry-${entries.indexOf(entry)}-${entry.kind}`, 0, 1, stagger);
  };
  const drainEntries = () => {
    if (!enabled()) return;
    const ongoing = Array.from(handles.values()).filter(owned => visible(owned.node));
    const regions = new Set(ongoing.map(owned => owned.region));
    const counts = new Map<string, number>([['row', ongoing.filter(owned => owned.kind === 'row').length]]);
    for (const entry of pending) {
      if (entry.consumed || !visible(entry.anchor)) { consume(entry); continue; }
      const region = regionFor(entry.anchor, entry.kind);
      const count = counts.get(entry.kind) ?? 0;
      if ((!regions.has(region) && regions.size >= 2) || entry.kind === 'row' && count >= 3) continue;
      regions.add(region);
      counts.set(entry.kind, count + 1);
      const stagger = ['row', 'topic', 'about-project', 'about-block'].includes(entry.kind) ? Math.min(count, 2) * (narrow.matches ? 30 : 45) : 0;
      playEntry(entry, stagger);
    }
  };
  const playBatch = (batch: Entry[]) => {
    for (const entry of batch) { pending.add(entry); observer?.unobserve(entry.anchor); }
    // Capacity is released by owned completion promises, never a polling loop.
    drainEntries();
  };
  const settleTarget = (target: Element) => {
    for (const entry of entries) if ([entry.anchor, ...entry.nodes].some(node => node === target || node.contains(target) || target.contains(node))) consume(entry);
    for (const owned of handles.values()) if (owned.node === target || owned.node.contains(target) || target.contains(owned.node)) stop(owned);
  };
  const hashTarget = () => {
    try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { return null; }
  };
  const watch = (restored = false) => {
    disconnect();
    if (!enabled()) return;
    try {
      observer = new IntersectionObserver(records => {
        if (!enabled()) return;
        playBatch(records.flatMap(record => {
          const entry = entries.find(entry => entry.anchor === record.target);
          return entry && !entry.consumed && record.isIntersecting ? [entry] : [];
        }));
        if (entries.every(entry => entry.consumed)) disconnect();
      }, { threshold: .12, rootMargin: '0px 0px -15% 0px' });
      for (const entry of entries) {
        if (entry.consumed) continue;
        const box = entry.anchor.getBoundingClientRect();
        if (box.bottom <= 0 || restored && box.top < innerHeight) consume(entry);
        else observer.observe(entry.anchor);
      }
      if (entries.every(entry => entry.consumed)) disconnect();
    } catch { fail(); }
  };
  try {
    if (typeof Element.prototype.animate !== 'function' || typeof IntersectionObserver !== 'function') throw new Error('Motion enhancement unavailable');
    const groups = new Map<string | HTMLElement, Entry>();
    for (const node of document.querySelectorAll<HTMLElement>('[data-component-motion]')) {
      const kind = node.dataset.componentMotion!;
      if (kind.startsWith('article-') || kind === 'menu-label') continue;
      const key = kind === 'support' || kind === 'story' ? kind : node;
      let entry = groups.get(key);
      if (!entry) {
        entry = { anchor: node, nodes: [], kind, consumed: false };
        groups.set(key, entry);
        entries.push(entry);
      }
      entry.nodes.push(node);
    }
    for (const wrapper of document.querySelectorAll<HTMLElement>('[data-featured-projects]')) {
      const article = wrapper.querySelector<HTMLElement>('[data-open-desk]:not([hidden])');
      entries.push({ anchor: article?.querySelector<HTMLElement>('.desk-title') ?? wrapper, owner: wrapper, nodes: [], kind: 'featured', consumed: wrapper.dataset.enhanced !== 'true' });
      snapshots.set(wrapper, { instanceId: wrapper.id, projectId: article?.dataset.projectId ?? '', layer: article?.querySelector<HTMLElement>('[data-desk-panel]:not([hidden])')?.dataset.deskPanel ?? '', revision: Number(wrapper.dataset.featuredRevision) || 0, origin: 'init' });
    }
    listen(document, 'featured:change', event => {
      const detail = (event as CustomEvent<Snapshot>).detail;
      const wrapper = event.target;
      if (!(wrapper instanceof HTMLElement) || !wrapper.matches('[data-featured-projects][data-enhanced="true"]') || !detail || detail.instanceId !== wrapper.id || detail.revision !== Number(wrapper.dataset.featuredRevision)) return;
      const previous = snapshots.get(wrapper);
      if (previous && detail.revision <= previous.revision) return;
      snapshots.set(wrapper, detail);
      cancelWithin(wrapper);
      const entry = entries.find(entry => entry.owner === wrapper);
      if (entry) consume(entry);
      if (detail.origin !== 'project' && detail.origin !== 'tab') return;
      const projects = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-open-desk]'), article => article.dataset.projectId);
      const layers = ['context', 'decisions', 'output'];
      const direction = detail.origin === 'project'
        ? Math.sign(projects.indexOf(detail.projectId) - projects.indexOf(previous?.projectId)) || 1
        : Math.sign(layers.indexOf(detail.layer) - layers.indexOf(previous?.layer ?? 'output')) || 1;
      const nodes = articleNodes(wrapper).filter(node => detail.origin !== 'tab' || node.dataset.componentMotion === 'article-panel');
      // The producer creates this event synchronously after the semantic commit.
      animate(nodes, detail.origin, wrapper.id, detail.revision, direction, 0, event.timeStamp);
    });
    listen(document, 'navigation:change', event => {
      const header = event.target;
      if (!(header instanceof HTMLElement) || !header.matches('.site-header')) return;
      const detail = (event as CustomEvent<{ open: boolean; revision: number }>).detail;
      cancelWithin(header);
      if (detail?.open) animate(Array.from(header.querySelectorAll<HTMLElement>('[data-component-motion="menu-label"]')), 'menu-label', 'menu', detail.revision, 1, 0, event.timeStamp);
    });
    listen(document, 'pointerdown', event => {
      const pointer = event as PointerEvent;
      if (press || !(pointer.target instanceof Element)) return;
      const link = pointer.target.closest('a[href]');
      if (!link) return;
      const held = Array.from(handles.values()).filter(owned => owned.node === link || owned.node.contains(link) || link.contains(owned.node));
      if (!held.length) return;
      held.forEach(owned => owned.animation.pause());
      const terminal = (event: Event) => {
        if (event instanceof PointerEvent && event.pointerId !== pointer.pointerId) return;
        release();
      };
      const names = ['pointerup', 'pointercancel', 'click', 'auxclick', 'dragend', 'contextmenu'];
      names.forEach(name => document.addEventListener(name, terminal, true));
      press = { pointerId: pointer.pointerId, held, remove: () => names.forEach(name => document.removeEventListener(name, terminal, true)) };
    }, true);
    listen(document, 'focusin', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (press?.held.some(owned => current(owned) && (owned.node.contains(target) || target.contains(owned.node)))) return;
      settleTarget(target);
    }, true);
    listen(document, 'click', event => {
      const click = event as MouseEvent;
      if (click.defaultPrevented || click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey || !(click.target instanceof Element)) return;
      const link = click.target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.download || link.target && link.target !== '_self') return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
      try { const target = document.getElementById(decodeURIComponent(url.hash.slice(1))); if (target) settleTarget(target); } catch { /* Native malformed fragment has no target. */ }
    });
    listen(window, 'hashchange', () => { const target = hashTarget(); if (target) settleTarget(target); });
    listen(window, 'blur', () => release(true));
    listen(window, 'pagehide', () => { suspended = true; settleAll(false); });
    listen(window, 'pageshow', event => { suspended = false; if ((event as PageTransitionEvent).persisted) watch(true); });
    listen(document, 'visibilitychange', () => { if (document.hidden) settleAll(false); else watch(true); });
    listen(window, 'beforeprint', () => { suspended = true; settleAll(true); });
    listen(window, 'afterprint', () => { suspended = false; });
    const preference = () => { if (!enabled()) settleAll(true); };
    listen(reduced, 'change', preference);
    listen(printing, 'change', preference);
    listen(narrow, 'change', () => { settleAll(false); watch(true); });
    preferenceObserver = new MutationObserver(preference);
    preferenceObserver.observe(root, { attributes: true, attributeFilter: ['data-motion-off'] });
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const late = performance.getEntriesByType('paint').some(entry => entry.name === 'first-contentful-paint') || scrollY > 0 || navigation?.type === 'back_forward' || document.activeElement !== document.body;
    const target = hashTarget();
    if (target) settleTarget(target);
    root.dataset.componentMotionMounted = 'true';
    if (!enabled()) settleAll(true);
    else {
      const initial = entries.filter(entry => !entry.consumed && visible(entry.anchor));
      if (late || location.hash) initial.forEach(consume);
      else playBatch(initial);
      watch();
    }
  } catch { fail(); }
}
