/* ═══════════════════════════════════════════════════════
   CHAMPION SYSTEM v8 — STATE / EVENT BUS
   ═══════════════════════════════════════════════════════ */

const BUS = (function () {
  const listeners = new Map();

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    listeners.get(event)?.delete(fn);
  }

  function emit(event, payload) {
    listeners.get(event)?.forEach(fn => {
      try { fn(payload); }
      catch (e) { console.error('[BUS]', event, e); }
    });
  }

  // Bridge: gli eventi window:'cs:*' diventano eventi bus
  ['cs:rev-saved', 'cs:weight-saved', 'cs:save-error', 'cs:saved', 'cs:route-change'].forEach(name => {
    window.addEventListener(name, (e) => emit(name, e.detail));
  });

  return { on, off, emit };
})();
