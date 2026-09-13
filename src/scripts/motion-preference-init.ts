// Run in the head before any motion owner can initialize.
(() => {
  const sync = () => {
    try {
      if (localStorage.getItem('open-desk-motion') === 'off') {
        document.documentElement.dataset.motionOff = 'true';
      } else {
        delete document.documentElement.dataset.motionOff;
      }
    } catch { /* System preference remains the default when storage is unavailable. */ }
  };
  sync();
  window.addEventListener('pageshow', sync);
  window.addEventListener('storage', event => {
    if (event.key === 'open-desk-motion' || event.key === null) sync();
  });
})();
