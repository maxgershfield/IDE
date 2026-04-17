/**
 * OASIS game UI — minimal API for generated games.
 * Expects DOM: #oasis-game-viewport, #oasis-game-hud (see README).
 */
(function () {
  const OGameUI = {
    _toastTimer: null,

    /**
     * @param {{ title?: string, subtitle?: string, theme?: 'oasis' | 'tokyo-night' | 'ember' }} opts
     */
    init(opts = {}) {
      const html = document.documentElement;
      html.classList.add('oasis-game-ui');
      document.body.setAttribute('data-oasis-ui-theme', opts.theme || 'oasis');

      const titleEl = document.getElementById('oui-title');
      const subEl = document.getElementById('oui-subtitle');
      if (titleEl && opts.title) titleEl.textContent = opts.title;
      if (subEl && opts.subtitle) subEl.textContent = opts.subtitle;

      document.querySelectorAll('[data-oasis-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-oasis-action');
          document.dispatchEvent(
            new CustomEvent('oasis-game-ui:action', { detail: { action } })
          );
        });
      });
    },

    setTitle(title) {
      const el = document.getElementById('oui-title');
      if (el) el.textContent = title;
    },

    /**
     * @param {{ health?: number, stamina?: number, level?: number }} stats
     */
    setStats(stats) {
      const h = document.getElementById('oui-stat-health');
      const s = document.getElementById('oui-stat-stamina');
      const l = document.getElementById('oui-stat-level');
      if (h && stats.health != null) h.textContent = String(stats.health);
      if (s && stats.stamina != null) s.textContent = String(stats.stamina);
      if (l && stats.level != null) l.textContent = String(stats.level);
    },

    setQuest(line, hint) {
      const q = document.getElementById('oui-quest-line');
      const small = document.querySelector('#oui-quest-panel small');
      if (q) q.textContent = line || '';
      if (small) small.textContent = hint || '';
    },

    toast(message, ms = 3200) {
      let root = document.getElementById('oui-toasts');
      if (!root) {
        root = document.createElement('div');
        root.id = 'oui-toasts';
        root.className = 'oui-toasts';
        document.body.appendChild(root);
      }
      const t = document.createElement('div');
      t.className = 'oui-toast';
      t.textContent = message;
      root.appendChild(t);
      setTimeout(() => {
        t.remove();
      }, ms);
    }
  };

  window.OGameUI = OGameUI;
})();
