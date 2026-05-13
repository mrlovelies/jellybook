(function () {
  'use strict';
  console.log('[Jellybook] script loaded');

  const BUTTON_ID = 'jellybook-read-btn';
  const READER_ID = 'jellybook-reader';
  const STYLE_ID = 'jellybook-style';
  const POLL_MS = 500;
  const SUPPORTED_EXTS = ['.cbz', '.cbr'];

  const VIEW_MODES = ['single-fit', 'single-width', 'double'];
  const MODE_ICONS = {
    'single-fit':   'crop_portrait',
    'single-width': 'view_day',
    'double':       'auto_stories'
  };
  const MODE_LABELS = {
    'single-fit':   'Single (fit)',
    'single-width': 'Single (width)',
    'double':       'Two-page spread'
  };

  // ---------- styles ----------

  const CSS = `
#${READER_ID} {
  position: fixed; inset: 0; z-index: 99999;
  background: #0a0a0a; color: #e8e8e8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  display: flex; flex-direction: column;
  user-select: none; -webkit-user-select: none;
}
#${READER_ID} .jb-topbar {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0));
  z-index: 3;
  pointer-events: none;
}
#${READER_ID} .jb-topbar > * { pointer-events: auto; }
#${READER_ID} .jb-title {
  font-size: 15px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 50%;
}
#${READER_ID} .jb-counter { font-size: 13px; opacity: 0.7; font-variant-numeric: tabular-nums; }
#${READER_ID} .jb-controls { display: flex; gap: 6px; align-items: center; }
#${READER_ID} .jb-btn {
  background: none; border: none; color: #e8e8e8;
  cursor: pointer; padding: 6px 10px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
#${READER_ID} .jb-btn:hover { background: rgba(255,255,255,0.1); }
#${READER_ID} .jb-btn .material-icons { font-size: 22px; }
#${READER_ID} .jb-btn.jb-close .material-icons { font-size: 24px; }
#${READER_ID} .jb-stage {
  flex: 1; display: flex; align-items: center; justify-content: center;
  overflow: hidden; position: relative;
}
#${READER_ID} .jb-stage.mode-single-fit  .jb-img { max-width: 100%; max-height: 100%; object-fit: contain; }
#${READER_ID} .jb-stage.mode-single-fit  .jb-img-right { display: none; }
#${READER_ID} .jb-stage.mode-single-width {
  overflow-y: auto; align-items: flex-start; justify-content: center;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent;
}
#${READER_ID} .jb-stage.mode-single-width .jb-img { width: 100%; max-width: none; height: auto; max-height: none; }
#${READER_ID} .jb-stage.mode-single-width .jb-img-right { display: none; }
#${READER_ID} .jb-stage.mode-double { gap: 2px; padding: 0 24px; }
#${READER_ID} .jb-stage.mode-double .jb-img { max-width: 50%; max-height: 100%; object-fit: contain; }
#${READER_ID} .jb-stage.mode-double .jb-img-right.hidden { display: none; }
#${READER_ID} .jb-zone {
  position: absolute; top: 0; bottom: 0; cursor: pointer;
  z-index: 1;
}
#${READER_ID} .jb-zone-prev { left: 0; width: 33%; }
#${READER_ID} .jb-zone-next { right: 0; width: 67%; }
#${READER_ID} .jb-loading {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease 0.15s;
  z-index: 2;
}
#${READER_ID} .jb-loading.show { opacity: 1; }
#${READER_ID} .jb-spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(255,255,255,0.15);
  border-top-color: rgba(255,255,255,0.85);
  border-radius: 50%;
  animation: jb-spin 0.8s linear infinite;
}
@keyframes jb-spin { to { transform: rotate(360deg); } }
#${READER_ID} .jb-error { text-align: center; padding: 40px; color: #ff8080; }
`;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- reader ----------

  class JellybookReader {
    constructor(item) {
      this.item = item;
      this.manifest = null;
      this.pageIndex = 0;
      this.preloadCache = new Map();
      this.boundKeydown = this.onKeydown.bind(this);
      this.saveTimer = null;
      this.lastSavedValue = -1;
      this.viewMode = localStorage.getItem('jellybook:viewMode') || 'single-fit';
      if (!VIEW_MODES.includes(this.viewMode)) this.viewMode = 'single-fit';
    }

    authHeader() {
      return { 'Authorization': `MediaBrowser Token="${window.ApiClient.accessToken()}"` };
    }

    pageUrl(n) {
      const token = window.ApiClient.accessToken();
      const base = window.ApiClient.serverAddress();
      return `${base}/Jellybook/Book/${this.item.Id}/Page/${n}?api_key=${encodeURIComponent(token)}`;
    }

    async open() {
      ensureStyles();
      this.buildDom();
      document.body.appendChild(this.root);
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', this.boundKeydown);

      try {
        const base = window.ApiClient.serverAddress();
        const itemId = this.item.Id;
        const userId = window.ApiClient.getCurrentUserId();

        const [manifestResp, progressResp] = await Promise.all([
          fetch(`${base}/Jellybook/Book/${itemId}/Manifest`, { headers: this.authHeader() }),
          fetch(`${base}/Jellybook/Book/${itemId}/Progress?userId=${userId}`, { headers: this.authHeader() })
        ]);
        if (!manifestResp.ok) throw new Error(`manifest ${manifestResp.status}`);
        this.manifest = await manifestResp.json();
        if (!this.manifest.pageCount) {
          this.showError('No pages found in this archive.');
          return;
        }

        let start = 0;
        if (progressResp.ok) {
          const prog = await progressResp.json();
          if (typeof prog.pageIndex === 'number' && prog.pageIndex > 0 && prog.pageIndex < this.manifest.pageCount) {
            start = prog.pageIndex;
            this.lastSavedValue = prog.pageIndex;
          }
        }
        this.goto(start);
      } catch (err) {
        console.error('[Jellybook] open failed', err);
        this.showError('Failed to load: ' + err.message);
      }
    }

    close() {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.saveProgress();
      }
      window.removeEventListener('keydown', this.boundKeydown);
      document.body.style.overflow = '';
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }

    buildDom() {
      const root = document.createElement('div');
      root.id = READER_ID;
      root.innerHTML = `
        <div class="jb-topbar">
          <div class="jb-title"></div>
          <div class="jb-counter">— / —</div>
          <div class="jb-controls">
            <button class="jb-btn jb-view-mode" title="View mode (m)" aria-label="View mode">
              <span class="material-icons" aria-hidden="true">crop_portrait</span>
            </button>
            <button class="jb-btn jb-close" aria-label="Close">
              <span class="material-icons" aria-hidden="true">close</span>
            </button>
          </div>
        </div>
        <div class="jb-stage mode-single-fit">
          <div class="jb-loading"><div class="jb-spinner"></div></div>
          <img class="jb-img jb-img-left" alt="" />
          <img class="jb-img jb-img-right hidden" alt="" />
          <div class="jb-zone jb-zone-prev"></div>
          <div class="jb-zone jb-zone-next"></div>
        </div>
      `;
      this.root = root;
      this.titleEl = root.querySelector('.jb-title');
      this.counterEl = root.querySelector('.jb-counter');
      this.imgLeftEl = root.querySelector('.jb-img-left');
      this.imgRightEl = root.querySelector('.jb-img-right');
      this.loadingEl = root.querySelector('.jb-loading');
      this.stageEl = root.querySelector('.jb-stage');
      this.viewModeBtn = root.querySelector('.jb-view-mode');
      this.viewModeIcon = this.viewModeBtn.querySelector('.material-icons');

      this.titleEl.textContent = this.item.Name || '';
      this.applyViewMode(); // sets stage class + button icon

      root.querySelector('.jb-close').addEventListener('click', () => this.close());
      root.querySelector('.jb-zone-prev').addEventListener('click', () => this.prev());
      root.querySelector('.jb-zone-next').addEventListener('click', () => this.next());
      this.viewModeBtn.addEventListener('click', () => this.cycleViewMode());
    }

    applyViewMode() {
      this.stageEl.className = 'jb-stage mode-' + this.viewMode;
      this.viewModeIcon.textContent = MODE_ICONS[this.viewMode];
      this.viewModeBtn.title = MODE_LABELS[this.viewMode] + ' (press m)';
    }

    cycleViewMode() {
      const idx = VIEW_MODES.indexOf(this.viewMode);
      this.viewMode = VIEW_MODES[(idx + 1) % VIEW_MODES.length];
      localStorage.setItem('jellybook:viewMode', this.viewMode);
      this.applyViewMode();
      if (this.manifest) this.render(this.pageIndex, /*force*/ true);
    }

    goto(n) {
      if (!this.manifest) return;
      const pc = this.manifest.pageCount;
      n = Math.max(0, Math.min(n, pc - 1));
      if (this.viewMode === 'double') n = Math.floor(n / 2) * 2; // snap to even
      this.render(n, false);
    }

    render(n, force) {
      const pc = this.manifest.pageCount;
      if (!force && n === this.pageIndex && this.imgLeftEl.src) return;
      this.pageIndex = n;

      const right = this.viewMode === 'double' && n + 1 < pc ? n + 1 : null;
      if (right === null) {
        this.imgRightEl.classList.add('hidden');
        this.counterEl.textContent = `${n + 1} / ${pc}`;
      } else {
        this.imgRightEl.classList.remove('hidden');
        this.counterEl.textContent = `${n + 1}-${right + 1} / ${pc}`;
      }

      this.loadingEl.classList.add('show');
      let leftLoaded = false, rightLoaded = right === null;
      const maybeHideLoader = () => {
        if (leftLoaded && rightLoaded) this.loadingEl.classList.remove('show');
      };

      this.imgLeftEl.onload = () => { leftLoaded = true; maybeHideLoader(); };
      this.imgLeftEl.onerror = () => { leftLoaded = true; maybeHideLoader(); };
      this.imgLeftEl.src = this.pageUrl(n);

      if (right !== null) {
        this.imgRightEl.onload = () => { rightLoaded = true; maybeHideLoader(); };
        this.imgRightEl.onerror = () => { rightLoaded = true; maybeHideLoader(); };
        this.imgRightEl.src = this.pageUrl(right);
      } else {
        this.imgRightEl.removeAttribute('src');
      }

      // reset scroll for single-width
      if (this.viewMode === 'single-width') this.stageEl.scrollTop = 0;

      // preload neighbors based on stride
      const stride = this.viewMode === 'double' ? 2 : 1;
      this.preload(n + stride);
      this.preload(n + stride * 2);
      this.preload(n - stride);

      this.scheduleSave();
    }

    preload(n) {
      if (!this.manifest || n < 0 || n >= this.manifest.pageCount) return;
      if (this.preloadCache.has(n)) return;
      const im = new Image();
      im.src = this.pageUrl(n);
      this.preloadCache.set(n, im);
      if (this.preloadCache.size > 10) {
        const k = this.preloadCache.keys().next().value;
        this.preloadCache.delete(k);
      }
    }

    next() {
      const stride = this.viewMode === 'double' ? 2 : 1;
      this.goto(this.pageIndex + stride);
    }
    prev() {
      const stride = this.viewMode === 'double' ? 2 : 1;
      this.goto(this.pageIndex - stride);
    }

    onKeydown(e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); this.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prev(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'Home') { e.preventDefault(); this.goto(0); }
      else if (e.key === 'End') { e.preventDefault(); this.goto(this.manifest ? this.manifest.pageCount - 1 : 0); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); this.cycleViewMode(); }
    }

    showError(msg) {
      const e = document.createElement('div');
      e.className = 'jb-error';
      e.textContent = msg;
      this.stageEl.appendChild(e);
      this.loadingEl.classList.remove('show');
    }

    scheduleSave() {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.saveProgress();
      }, 1500);
    }

    saveProgress() {
      if (!this.manifest || this.pageIndex === this.lastSavedValue) return;
      this.lastSavedValue = this.pageIndex;
      const base = window.ApiClient.serverAddress();
      const userId = window.ApiClient.getCurrentUserId();
      const url = `${base}/Jellybook/Book/${this.item.Id}/Progress?userId=${userId}&pageIndex=${this.pageIndex}&pageCount=${this.manifest.pageCount}`;
      fetch(url, { method: 'POST', headers: this.authHeader() }).catch(err => {
        console.warn('[Jellybook] progress save failed', err);
      });
    }
  }

  // ---------- button injection ----------

  function onDetailsPage() {
    return (window.location.hash || '').startsWith('#/details');
  }

  function getItemIdFromHash() {
    const hash = window.location.hash || '';
    const match = hash.match(/[?&]id=([a-f0-9]{32})/i);
    return match ? match[1] : null;
  }

  async function maybeInjectButton() {
    if (!onDetailsPage()) return;
    if (document.getElementById(BUTTON_ID)) return;
    if (!window.ApiClient) return;

    const buttonsRow =
      document.querySelector('.detailButtons-content') ||
      document.querySelector('.detailButtons') ||
      document.querySelector('.mainDetailButtons');
    if (!buttonsRow) return;

    const itemId = getItemIdFromHash();
    if (!itemId) return;

    let item;
    try {
      item = await window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), itemId);
    } catch (_) { return; }
    if (item.Type !== 'Book') return;

    const path = (item.Path || '').toLowerCase();
    if (!SUPPORTED_EXTS.some(ext => path.endsWith(ext))) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = 'button-flat btnPlay detailButton emby-button';
    btn.innerHTML =
      '<div class="detailButton-content">' +
      '<span class="material-icons detailButton-icon menu_book" aria-hidden="true">menu_book</span>' +
      '<span class="button-text detailButton-text">Read</span>' +
      '</div>';
    btn.addEventListener('click', () => new JellybookReader(item).open());
    buttonsRow.appendChild(btn);
    console.log('[Jellybook] read button injected for', item.Name);
  }

  function tick() { try { maybeInjectButton(); } catch (err) { console.error('[Jellybook] tick', err); } }

  setInterval(tick, POLL_MS);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
})();
