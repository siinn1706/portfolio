// One owner for decoration. Semantic controls and their hitboxes never move.
(() => {
  const root = document.documentElement;
  if (root.dataset.glassMotionMounted) return;
  root.dataset.glassMotionMounted = 'true';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const printing = matchMedia('print');
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const handles = new Map<HTMLElement, Animation>();
  const shells = [...document.querySelectorAll<HTMLElement>('.header-controls, .project-choices')];
  const selectors = [...document.querySelectorAll<HTMLElement>('[data-glass-selector]')];
  type Box = { x: number; y: number; width: number; height: number };
  const selectedBoxes = new Map<HTMLElement, Box>();
  const removers: (() => void)[] = [];
  let suspended = false;
  let failed = false;
  let generation = 0;
  let revision = 0;
  let press: { nodes: HTMLElement[]; input: 'pointer' | 'keyboard' } | undefined;
  let resize: ResizeObserver | undefined;
  let preference: MutationObserver | undefined;
  let navigationBox: DOMRect | undefined;
  let closedFlow = false;
  const enabled = () => !failed && !suspended && !document.hidden && !printing.matches && !reduced.matches && root.dataset.motionOff !== 'true' && root.dataset.materialEffective === 'expressive-css';
  const stop = (node: HTMLElement) => { handles.get(node)?.cancel(); handles.delete(node); };
  const stopAll = () => {
    for (const node of handles.keys()) stop(node);
    shells.forEach(shell => shell.querySelectorAll<HTMLElement>('[data-glass-backing],[data-glass-rim]').forEach(node => node.style.removeProperty('transform')));
    press = undefined;
  };
  const fail = (event?: Event) => {
    if (failed) return;
    failed = true;
    root.dataset.glassMotionFailed = 'true';
    const heldInput = press?.input;
    stopAll();
    resize?.disconnect();
    preference?.disconnect();
    removers.reverse().forEach(remove => remove());
    for (const plate of selectors) {
      plate.hidden = true;
      plate.parentElement?.removeAttribute('data-glass-selection-ready');
    }
    const flow = () => {
      // Without geometry observation, growing text must use normal flow.
      root.dataset.glassFlow = 'true';
      root.style.removeProperty('--glass-header-height');
      root.style.removeProperty('--glass-anchor-offset');
    };
    if (heldInput || event?.type === 'pointerdown' || event?.type === 'keydown') {
      // Moving a pressed control before pointerup can cancel its native click.
      // Wait for input completion, then apply the static fallback after dispatch.
      const endings = ['pointerup', 'pointercancel', 'keyup', 'click', 'blur', 'pagehide'];
      const finish = (ending: Event) => {
        endings.forEach(name => window.removeEventListener(name, finish, true));
        if (document.hidden || ending.type === 'blur' || ending.type === 'pagehide') flow();
        else requestAnimationFrame(flow);
      };
      endings.forEach(name => window.addEventListener(name, finish, { capture: true, passive: true }));
    } else if (event?.type === 'pointerup' || event?.type === 'keyup') {
      requestAnimationFrame(flow);
    } else flow();
  };
  const guarded = (callback: () => void) => () => {
    if (!failed) { try { callback(); } catch { fail(); } }
  };
  const duration = (name: string) => {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    const milliseconds = parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 450) throw new Error('Invalid glass duration');
    return milliseconds;
  };
  const listen = (target: EventTarget, name: string, callback: (event: Event) => void, options?: AddEventListenerOptions) => {
    const handler = (event: Event) => {
      if (!failed) { try { callback(event); } catch { fail(event); } }
    };
    target.addEventListener(name, handler, options);
    removers.push(() => target.removeEventListener(name, handler, options));
  };
  const animate = (node: HTMLElement, keyframes: Keyframe[], milliseconds: number, kind: string) => {
    stop(node);
    if (!enabled()) return;
    const startedAt = performance.now();
    const animation = node.animate(keyframes, { duration: milliseconds, easing: 'cubic-bezier(.22,1,.36,1)' });
    animation.id = `glass-motion:${kind}:${revision}:${++generation}`;
    handles.set(node, animation);
    const clear = () => {
      if (handles.get(node) === animation) { handles.delete(node); animation.cancel(); }
    };
    animation.finished.then(clear, clear);
    // Start at invocation; the browser's deferred ready frame must not add time.
    animation.startTime = startedAt;
  };
  const effectiveMaterial = () => {
    const requested = root.dataset.material === 'b' ? 'baseline-b' : root.dataset.material || 'expressive-css';
    const supported = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
    const effective = requested === 'solid' || !supported || printing.matches || forced.matches || transparency.matches ? 'solid' : requested === 'baseline-b' ? 'baseline-b' : 'expressive-css';
    root.dataset.materialEffective = effective;
    root.dataset.materialFallback = effective === requested ? 'none' : requested === 'expressive-refractive' && effective === 'expressive-css' ? 'refraction-not-integrated' : 'solid-preference-or-capability';
    root.dataset.materialEffectiveVerified = 'true';
    if (!enabled()) stopAll();
  };
  const selection = (travel: boolean, scope?: Element) => {
    for (const selector of selectors) {
      if (scope && !scope.contains(selector)) continue;
      const shell = selector.parentElement!;
      const choice = shell.querySelector<HTMLElement>('[data-project-choice][aria-disabled="true"]');
      if (!choice) { selector.hidden = true; shell.removeAttribute('data-glass-selection-ready'); continue; }
      const shellBox = shell.getBoundingClientRect(), box = choice.getBoundingClientRect();
      const next = { x: box.x - shellBox.x - shell.clientLeft, y: box.y - shellBox.y - shell.clientTop, width: box.width, height: box.height };
      if (!next.width || !next.height) continue;
      // Start an interrupted selection at its current displayed position.
      const displayed = selector.hidden ? undefined : selector.getBoundingClientRect();
      const previous = selectedBoxes.get(selector);
      stop(selector);
      Object.assign(selector.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px` });
      selector.hidden = false;
      shell.dataset.glassSelectionReady = 'true';
      if (travel && previous && displayed && (next.x !== previous.x || next.y !== previous.y || next.width !== previous.width || next.height !== previous.height)) {
        animate(selector, [{ transform: `translate(${displayed.x - box.x}px, ${displayed.y - box.y}px) scale(${displayed.width / next.width}, ${displayed.height / next.height})` }, { transform: 'none' }], duration('--glass-selection-duration'), 'selection');
      }
      selectedBoxes.set(selector, next);
    }
  };
  const reconcileGeometry = () => {
    const header = document.querySelector<HTMLElement>('.site-header');
    const height = header?.getBoundingClientRect().height || 0;
    const pickerHeight = Math.max(0, ...[...document.querySelectorAll<HTMLElement>('.project-chooser')].map(node => node.getBoundingClientRect().height));
    // A reachable open menu must not jump to its offscreen document position.
    if (!header?.hasAttribute('data-menu-open')) closedFlow = height + pickerHeight > innerHeight * .42;
    root.dataset.glassFlow = String(innerHeight <= 600 || closedFlow);
    root.style.setProperty('--glass-header-height', `${height}px`);
    root.style.setProperty('--glass-anchor-offset', `${height + pickerHeight + 16}px`);
    selection(false);
    navigationBox = document.querySelector('.header-controls')?.getBoundingClientRect();
  };
  const beginPress = (event: Event) => {
    if (!enabled() || press || !(event.target instanceof Element)) return;
    if (event instanceof KeyboardEvent && (!['Enter', ' '].includes(event.key) || event.repeat)) return;
    if (event instanceof PointerEvent && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    const control = event.target.closest('a,button');
    const shell = control?.closest('.header-controls,.project-choices');
    if (!shell || control?.getAttribute('aria-disabled') === 'true') return;
    const nodes = [...shell.querySelectorAll<HTMLElement>('[data-glass-backing],[data-glass-rim]')];
    press = { nodes, input: event instanceof PointerEvent ? 'pointer' : 'keyboard' };
    for (const node of nodes) {
      node.style.transform = 'scale(.988)';
      animate(node, [{ transform: 'none' }, { transform: 'scale(.988)' }], duration('--glass-press-duration'), 'press');
    }
  };
  const release = () => {
    const held = press;
    press = undefined;
    if (!held) return;
    for (const node of held.nodes) {
      const from = getComputedStyle(node).transform;
      node.style.removeProperty('transform');
      animate(node, [{ transform: from }, { transform: 'none' }], duration('--glass-settle-duration'), 'settle');
    }
  };
  try {
    effectiveMaterial();
    listen(document, 'featured:change', event => {
      const detail = (event as CustomEvent<{ origin: string; revision: number }>).detail;
      revision = detail?.revision || 0;
      selection(detail?.origin === 'project', event.target instanceof Element ? event.target : undefined);
    });
    listen(document, 'navigation:change', () => {
      release();
      const shell = document.querySelector('.header-controls');
      const previous = navigationBox;
      const next = shell?.getBoundingClientRect();
      // The backing stays full size beneath newly committed menu labels.
      if (previous && next && next.width && next.height) for (const node of shell!.querySelectorAll<HTMLElement>('[data-glass-rim]')) {
        node.style.transformOrigin = 'top right';
        animate(node, [{ transform: `scale(${previous.width / next.width},${previous.height / next.height})` }, { transform: 'none' }], duration('--glass-settle-duration'), 'menu');
      }
      reconcileGeometry();
    });
    listen(document, 'pointerdown', beginPress, { passive: true });
    listen(document, 'keydown', beginPress);
    for (const name of ['pointerup', 'pointercancel', 'keyup', 'dragstart', 'contextmenu']) listen(document, name, release, { passive: true });
    for (const shell of shells) {
      listen(shell, 'pointerleave', release, { passive: true });
      listen(shell, 'focusout', release);
    }
    listen(window, 'blur', stopAll);
    listen(window, 'pagehide', () => { suspended = true; stopAll(); resize?.disconnect(); });
    listen(window, 'pageshow', () => { suspended = false; shells.forEach(shell => resize?.observe(shell)); effectiveMaterial(); reconcileGeometry(); });
    listen(document, 'visibilitychange', () => { if (document.hidden) stopAll(); });
    listen(window, 'beforeprint', () => { suspended = true; stopAll(); effectiveMaterial(); });
    listen(window, 'afterprint', () => { suspended = false; effectiveMaterial(); reconcileGeometry(); });
    listen(reduced, 'change', stopAll);
    listen(printing, 'change', stopAll);
    preference = new MutationObserver(guarded(() => { if (!enabled()) stopAll(); selection(false); }));
    preference.observe(root, { attributes: true, attributeFilter: ['data-motion-off'] });
    resize = new ResizeObserver(guarded(reconcileGeometry));
    shells.forEach(shell => resize?.observe(shell));
    listen(window, 'resize', reconcileGeometry, { passive: true });
    reconcileGeometry();
  } catch { fail(); }
  // CSS preferences remain live after a terminal decoration fault. Their passive
  // reporting has no animation callbacks and must not claim stale capabilities.
  for (const query of [printing, transparency, forced]) query.addEventListener('change', effectiveMaterial);
  window.addEventListener('pageshow', effectiveMaterial);
  const materialPreference = new MutationObserver(effectiveMaterial);
  materialPreference.observe(root, { attributes: true, attributeFilter: ['data-material'] });
})();
