// Keep this coordinator synchronous: readable HTML is enhanced before first paint.
// The DOM marker survives a replay of this script; failed attempts restore the baseline.
for (const wrapper of document.querySelectorAll<HTMLElement>('[data-featured-projects]')) {
  if (wrapper.dataset.enhanced === 'true') continue;
  const cleanup: (() => void)[] = [];
  const anchors = Array.from(wrapper.querySelectorAll<HTMLAnchorElement>('a[data-project-choice]'));
  const buttons: HTMLButtonElement[] = [];
  const count = wrapper.querySelector<HTMLElement>('[data-project-count]');
  const status = wrapper.querySelector<HTMLElement>('[data-project-status]');
  const originalCount = count?.textContent ?? '';
  const originalStatus = status?.textContent ?? '';
  const changedElements = [wrapper, ...wrapper.querySelectorAll<HTMLElement>('[data-open-desk], [data-desk-tabs], [data-panel], [data-desk-panel]')];
  const baseline = changedElements.map(element => ({
    element,
    attributes: Array.from(element.attributes, attribute => [attribute.name, attribute.value] as const),
  }));
  const listen = (target: EventTarget, name: string, handler: EventListener) => {
    target.addEventListener(name, handler);
    cleanup.push(() => target.removeEventListener(name, handler));
  };

  try {
    const articles = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-open-desk]'));
    const ids = Array.from(wrapper.querySelectorAll<HTMLElement>('[id]'), element => element.id);
    ids.push(wrapper.id);
    const idCounts = new Map<string, number>();
    document.querySelectorAll('[id]').forEach(element => idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1));
    if (!articles.length || ids.some(id => !id || idCounts.get(id) !== 1)) throw new Error('Invalid featured IDs');
    const projectIds = articles.map(article => article.dataset.projectId);
    if (projectIds.some(id => !id) || new Set(projectIds).size !== projectIds.length) throw new Error('Invalid featured projects');
    if (anchors.length !== (articles.length > 1 ? articles.length : 0) || !status || (articles.length > 1 && !count)) throw new Error('Invalid featured controls');

    const desks = articles.map(article => {
      const tablist = article.querySelector<HTMLElement>('[data-desk-tabs]');
      const tabs = Array.from(article.querySelectorAll<HTMLButtonElement>('[data-panel]'));
      const panels = Array.from(article.querySelectorAll<HTMLElement>('[data-desk-panel]'));
      const title = article.querySelector<HTMLElement>('.desk-title h2');
      if (!tablist || !title || tabs.length !== 3 || panels.length !== 3 ||
        ['context', 'decisions', 'output'].some(layer =>
          tabs.filter(tab => tab.dataset.panel === layer).length !== 1 ||
          panels.filter(panel => panel.dataset.deskPanel === layer).length !== 1)) throw new Error('Invalid desk sections');
      return { article, tablist, tabs, panels, title };
    });
    anchors.forEach((anchor, index) => {
      if (anchor.dataset.projectChoice !== projectIds[index] || anchor.getAttribute('href') !== `#${articles[index].id}`) throw new Error('Invalid project link');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = anchor.className;
      button.dataset.projectChoice = anchor.dataset.projectChoice;
      button.textContent = anchor.textContent;
      button.setAttribute('aria-controls', articles[index].id);
      buttons.push(button);
    });

    let selected = 0;
    let committed = false;
    let revision = Number(wrapper.dataset.featuredRevision) || 0;
    let signature = '';
    const publish = (origin: 'init' | 'project' | 'tab' | 'fragment') => {
      if (!committed) return;
      const projectId = projectIds[selected]!;
      const layer = desks[selected].panels.find(panel => !panel.hidden)!.dataset.deskPanel!;
      const next = `${projectId}:${layer}`;
      if (next === signature) return;
      signature = next;
      wrapper.dataset.featuredRevision = String(++revision);
      wrapper.dispatchEvent(new CustomEvent('featured:change', {
        bubbles: true, detail: { instanceId: wrapper.id, projectId, layer, origin, revision },
      }));
    };
    const selectLayer = (index: number, layer: string, notify = false) => {
      const desk = desks[index];
      desk.tabs.forEach(tab => {
        const active = tab.dataset.panel === layer;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      desk.panels.forEach(panel => { panel.hidden = panel.dataset.deskPanel !== layer; });
      if (notify) publish('tab');
    };
    const showProject = (index: number, layer = 'output', announce = false, origin: 'init' | 'project' | 'fragment' = 'project') => {
      selectLayer(index, layer);
      desks.forEach((desk, position) => { desk.article.hidden = position !== index; });
      buttons.forEach((button, position) => {
        if (position === index) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      });
      selected = index;
      if (count) count.textContent = `${index + 1} / ${desks.length}`;
      if (announce) status.textContent = `${desks[index].title.textContent}, ${index + 1} / ${desks.length}, ${desks[index].tabs.find(tab => tab.dataset.panel === layer)!.textContent}.`;
      publish(origin);
    };
    const fragment = (hash = location.hash) => {
      let id: string;
      try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
      if (!id) return;
      const target = document.getElementById(id);
      if (!target || !wrapper.contains(target)) return;
      const index = desks.findIndex(desk => desk.article === target || desk.article.contains(target));
      if (index < 0) return;
      const panel = target.closest<HTMLElement>('[data-desk-panel]');
      const tab = target.closest<HTMLElement>('[data-panel]');
      return { target, index, layer: panel?.dataset.deskPanel ?? tab?.dataset.panel ?? 'output' };
    };
    // Native fragment navigation can blur even an outside link before hashchange.
    // Remember only that navigation's focusout, never a stale earlier focus.
    let handledHash = location.hash;
    let fragmentFocus: { element: HTMLElement; hash: string; nativeTarget: EventTarget | null } | undefined;
    listen(document, 'focusout', event => {
      const focusEvent = event as FocusEvent;
      const destination = fragment();
      fragmentFocus = location.hash !== handledHash && destination &&
        (!focusEvent.relatedTarget || focusEvent.relatedTarget === destination.target) &&
        focusEvent.target instanceof HTMLElement
        ? { element: focusEvent.target, hash: location.hash, nativeTarget: focusEvent.relatedTarget } : undefined;
    });
    listen(document, 'focusin', event => {
      if (fragmentFocus?.hash === location.hash && event.target === fragmentFocus.nativeTarget) return;
      fragmentFocus = undefined;
    });
    const revealFragment = (scroll: boolean, nativeFocus?: typeof fragmentFocus, hash = location.hash) => {
      const destination = fragment(hash);
      if (!destination) return false;
      const currentFocus = document.activeElement;
      const previousFocus = (currentFocus === document.body || currentFocus === document.documentElement || currentFocus === nativeFocus?.nativeTarget) && nativeFocus?.element.isConnected
        ? nativeFocus.element : currentFocus;
      showProject(destination.index, destination.layer, false, 'fragment');
      if (previousFocus instanceof HTMLElement && wrapper.contains(previousFocus) && previousFocus.closest('[hidden]')) {
        const target = destination.target;
        const focusTarget = target.matches('a[href], button, [tabindex]') ? target :
          target.querySelector<HTMLElement>('h2, h3') ?? desks[destination.index].title;
        if (!focusTarget.hasAttribute('tabindex') && !focusTarget.matches('a[href], button')) {
          focusTarget.setAttribute('tabindex', '-1');
          const remove = () => {
            focusTarget.removeAttribute('tabindex');
            focusTarget.removeEventListener('blur', remove);
          };
          focusTarget.addEventListener('blur', remove, { once: true });
          if (wrapper.dataset.enhanced !== 'true') cleanup.push(remove);
        }
        focusTarget.focus({ preventScroll: true });
      } else if (previousFocus instanceof HTMLElement && previousFocus !== currentFocus && !previousFocus.closest('[hidden]')) {
        previousFocus.focus({ preventScroll: true });
      }
      // Instant scrolling preserves native fragments even when the browser first found a hidden target.
      if (scroll) destination.target.scrollIntoView({ behavior: 'instant', block: 'start' });
      return true;
    };

    desks.forEach((desk, index) => {
      desk.tabs.forEach((tab, position) => {
        const panel = desk.panels.find(panel => panel.dataset.deskPanel === tab.dataset.panel)!;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        panel.tabIndex = 0;
        listen(tab, 'click', () => selectLayer(index, tab.dataset.panel!, true));
        listen(tab, 'keydown', event => {
          const key = (event as KeyboardEvent).key;
          let next: number | undefined;
          if (key === 'ArrowRight') next = (position + 1) % desk.tabs.length;
          if (key === 'ArrowLeft') next = (position + desk.tabs.length - 1) % desk.tabs.length;
          if (key === 'Home') next = 0;
          if (key === 'End') next = desk.tabs.length - 1;
          if (next !== undefined) {
            event.preventDefault();
            desk.tabs.forEach((tab, position) => { tab.tabIndex = position === next ? 0 : -1; });
            desk.tabs[next].focus();
            selectLayer(index, desk.tabs[next].dataset.panel!, true);
          }
        });
      });
      listen(desk.tablist, 'focusout', event => {
        if (!desk.tablist.contains((event as FocusEvent).relatedTarget as Node | null)) {
          desk.tabs.forEach(tab => { tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1; });
        }
      });
      desk.tablist.setAttribute('role', 'tablist');
      selectLayer(index, 'output');
    });
    buttons.forEach((button, index) => listen(button, 'click', () => {
      if (selected === index) return;
      showProject(index, 'output', true);
      // Native pointer activation differs by browser; retain focus on the selected control.
      button.focus({ preventScroll: true });
    }));
    listen(window, 'hashchange', () => {
      const previousFocus = fragmentFocus?.hash === location.hash ? fragmentFocus : undefined;
      fragmentFocus = undefined;
      handledHash = location.hash;
      revealFragment(true, previousFocus);
    });
    // Reveal before the browser follows any native same-document featured link.
    // This also covers an unchanged hash after the picker selected another project.
    listen(document, 'click', event => {
      const click = event as MouseEvent;
      if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
      const anchor = (click.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
      revealFragment(false, undefined, url.hash);
    });

    showProject(0);
    anchors.forEach((anchor, index) => {
      const focused = document.activeElement === anchor;
      anchor.replaceWith(buttons[index]);
      if (focused) buttons[index].focus({ preventScroll: true });
    });
    desks.forEach(desk => {
      desk.article.dataset.enhanced = 'true';
      desk.tablist.hidden = false;
    });
    revealFragment(false);
    wrapper.dataset.enhanced = 'true';
    committed = true;
    publish('init');
  } catch {
    cleanup.reverse().forEach(remove => remove());
    buttons.forEach((button, index) => {
      if (!button.isConnected) return;
      const focused = document.activeElement === button;
      button.replaceWith(anchors[index]);
      if (focused) anchors[index].focus({ preventScroll: true });
    });
    baseline.forEach(({ element, attributes }) => {
      Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));
      attributes.forEach(([name, value]) => element.setAttribute(name, value));
    });
    if (count) count.textContent = originalCount;
    if (status) status.textContent = originalStatus;
  }
}
