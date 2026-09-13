// Component entry belongs to component-motion; these are only local count pulses.
if (document.documentElement.dataset.microDetailsMounted !== 'true') {
  const cleanup: (() => void)[] = [];
  const countValues = new Map<HTMLElement, string>();
  const animations = new Map<HTMLElement, { animation: Animation; generation: number; revision: number }>();
  let generation = 0;
  let paused = document.hidden;
  let printing = false;
  const listen = (target: EventTarget, name: string, handler: EventListener) => {
    target.addEventListener(name, handler);
    cleanup.push(() => target.removeEventListener(name, handler));
  };
  const stop = (count: HTMLElement) => {
    const current = animations.get(count);
    animations.delete(count);
    current?.animation.cancel();
  };
  const stopAnimations = () => { Array.from(animations.keys()).forEach(stop); };

  try {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const print = matchMedia('print');
    const motionOff = () => document.documentElement.dataset.motionOff === 'true';
    const offObserver = new MutationObserver(() => { if (motionOff()) stopAnimations(); });
    offObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion-off'] });
    cleanup.push(() => offObserver.disconnect());
    document.querySelectorAll<HTMLElement>('[data-project-count]').forEach(count => {
      countValues.set(count, count.textContent ?? '');
    });
    listen(reduced, 'change', () => { if (reduced.matches) stopAnimations(); });
    listen(print, 'change', () => { if (print.matches) stopAnimations(); });
    listen(document, 'visibilitychange', () => {
      paused = document.hidden;
      if (paused) stopAnimations();
    });
    listen(window, 'pagehide', () => { paused = true; stopAnimations(); });
    listen(window, 'pageshow', () => { paused = document.hidden; });
    listen(window, 'beforeprint', () => { printing = true; stopAnimations(); });
    listen(window, 'afterprint', () => { printing = false; });
    listen(document, 'featured:change', event => {
      const detail = (event as CustomEvent<{ instanceId?: string; revision?: number }>).detail;
      if (!detail || typeof detail.instanceId !== 'string' || !Number.isSafeInteger(detail.revision)) return;
      const wrapper = document.getElementById(detail.instanceId);
      if (!wrapper?.matches('[data-featured-projects][data-enhanced="true"]') || wrapper.dataset.featuredRevision !== String(detail.revision)) return;
      const count = wrapper.querySelector<HTMLElement>('[data-project-count]');
      if (!count) return;
      const text = count.textContent ?? '';
      const changed = countValues.get(count) !== text;
      countValues.set(count, text);
      if (!changed) return;
      stop(count);
      if (reduced.matches || print.matches || printing || motionOff() || paused || document.hidden || typeof count.animate !== 'function') return;
      try {
        const animation = count.animate([
          { transform: 'translateY(0)' },
          { transform: 'translateY(-2px)', offset: 0.35 },
          { transform: 'translateY(0)' },
        ], { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        const ownGeneration = ++generation;
        animations.set(count, { animation, generation: ownGeneration, revision: detail.revision! });
        const release = () => {
          const current = animations.get(count);
          if (current?.animation === animation && current.generation === ownGeneration && current.revision === detail.revision) animations.delete(count);
        };
        void animation.finished.then(release, release);
      } catch {
        stop(count);
      }
    });
    document.documentElement.dataset.microDetailsMounted = 'true';
  } catch {
    cleanup.reverse().forEach(remove => remove());
    stopAnimations();
    delete document.documentElement.dataset.microDetailsMounted;
  }
}
