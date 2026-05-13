(function () {
  'use strict';
  console.log('[Jellybook] script loaded');

  const BUTTON_ID = 'jellybook-read-btn';
  const READER_ID = 'jellybook-reader';
  const STYLE_ID = 'jellybook-style';
  const POLL_MS = 500;
  const SUPPORTED_EXTS = ['.cbz', '.cbr', '.epub'];

  // ---------- styles ----------

  const CSS = `
#${READER_ID} {
  position: fixed; inset: 0; z-index: 99999;
  background: #0a0a0a; color: #e8e8e8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  display: flex; flex-direction: column;
  user-select: none; -webkit-user-select: none;
}
#${READER_ID}.jb-mode-ebook { background: #f4f1ea; color: #1c1c1c; }
#${READER_ID}.jb-mode-ebook.jb-theme-sepia { background: #f4ecd8; color: #3a2e1f; }
#${READER_ID}.jb-mode-ebook.jb-theme-dark { background: #1a1a1a; color: #d8d4cc; }
#${READER_ID} .jb-topbar {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  z-index: 3;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
#${READER_ID} .jb-topbar > * { pointer-events: auto; }
#${READER_ID}.jb-mode-comic .jb-topbar {
  background: linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0));
}
#${READER_ID}.jb-mode-ebook .jb-topbar {
  background: linear-gradient(to bottom, rgba(244,241,234,0.95), rgba(244,241,234,0));
}
#${READER_ID}.jb-mode-ebook.jb-theme-sepia .jb-topbar {
  background: linear-gradient(to bottom, rgba(244,236,216,0.95), rgba(244,236,216,0));
}
#${READER_ID}.jb-mode-ebook.jb-theme-dark .jb-topbar {
  background: linear-gradient(to bottom, rgba(26,26,26,0.95), rgba(26,26,26,0));
}
#${READER_ID} .jb-title {
  font-size: 15px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 50%;
}
#${READER_ID} .jb-counter { font-size: 13px; opacity: 0.7; font-variant-numeric: tabular-nums; }
#${READER_ID} .jb-controls { display: flex; gap: 6px; align-items: center; }
#${READER_ID} .jb-btn {
  background: none; border: none; color: inherit;
  font-size: 18px; line-height: 1; cursor: pointer; padding: 6px 10px;
  border-radius: 6px;
}
#${READER_ID} .jb-btn:hover { background: rgba(127,127,127,0.18); }
#${READER_ID} .jb-stage {
  flex: 1; display: flex; align-items: center; justify-content: center;
  overflow: hidden; position: relative;
}
#${READER_ID} .jb-img {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
  box-shadow: 0 4px 30px rgba(0,0,0,0.6);
}
#${READER_ID} .jb-epub-host {
  position: absolute; inset: 56px 8px 32px 8px;
}
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
  border: 3px solid rgba(127,127,127,0.18);
  border-top-color: currentColor;
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

  // ---------- script loader ----------

  const loadedScripts = new Set();
  function loadScript(src) {
    if (loadedScripts.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => { loadedScripts.add(src); resolve(); };
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
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
      this.mode = null; // 'comic' | 'ebook'
      this.rendition = null;
      this.ebookPercentage = 0;
      this.theme = localStorage.getItem('jellybook:theme') || 'light';
    }

    authHeader() {
      return { 'Authorization': `MediaBrowser Token="${window.ApiClient.accessToken()}"` };
    }

    apiUrl(path) {
      return `${window.ApiClient.serverAddress()}${path}?api_key=${encodeURIComponent(window.ApiClient.accessToken())}`;
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

        let progress = { pageIndex: 0 };
        if (progressResp.ok) progress = await progressResp.json();

        this.mode = this.manifest.type;
        this.root.classList.add(this.mode === 'ebook' ? 'jb-mode-ebook' : 'jb-mode-comic');
        if (this.mode === 'ebook') this.root.classList.add('jb-theme-' + this.theme);

        if (this.mode === 'comic') {
          await this.initComic(progress);
        } else if (this.mode === 'ebook') {
          await this.initEbook(progress);
        } else {
          throw new Error('unsupported manifest type: ' + this.mode);
        }
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
      if (this.rendition) {
        try { this.rendition.destroy(); } catch (_) {}
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
            <button class="jb-btn jb-theme-toggle" title="Theme" aria-label="Theme" style="display:none">☾</button>
            <button class="jb-btn jb-close" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="jb-stage">
          <div class="jb-loading"><div class="jb-spinner"></div></div>
          <img class="jb-img" alt="" style="display:none" />
          <div class="jb-epub-host" style="display:none"></div>
          <div class="jb-zone jb-zone-prev"></div>
          <div class="jb-zone jb-zone-next"></div>
        </div>
      `;
      this.root = root;
      this.titleEl = root.querySelector('.jb-title');
      this.counterEl = root.querySelector('.jb-counter');
      this.imgEl = root.querySelector('.jb-img');
      this.epubHostEl = root.querySelector('.jb-epub-host');
      this.loadingEl = root.querySelector('.jb-loading');
      this.stageEl = root.querySelector('.jb-stage');
      this.themeBtn = root.querySelector('.jb-theme-toggle');

      this.titleEl.textContent = this.item.Name || '';

      root.querySelector('.jb-close').addEventListener('click', () => this.close());
      root.querySelector('.jb-zone-prev').addEventListener('click', () => this.prev());
      root.querySelector('.jb-zone-next').addEventListener('click', () => this.next());
      this.themeBtn.addEventListener('click', () => this.cycleTheme());
    }

    // ----- comic mode -----

    async initComic(progress) {
      this.imgEl.style.display = '';
      if (!this.manifest.pageCount) {
        this.showError('No pages found in this archive.');
        return;
      }
      let start = 0;
      if (typeof progress.pageIndex === 'number' && progress.pageIndex > 0 && progress.pageIndex < this.manifest.pageCount) {
        start = progress.pageIndex;
        this.lastSavedValue = progress.pageIndex;
      }
      this.goto(start);
    }

    pageUrl(n) {
      return this.apiUrl(`/Jellybook/Book/${this.item.Id}/Page/${n}`);
    }

    goto(n) {
      if (this.mode !== 'comic' || !this.manifest) return;
      const pc = this.manifest.pageCount;
      n = Math.max(0, Math.min(n, pc - 1));
      if (n === this.pageIndex && this.imgEl.src) return;
      this.pageIndex = n;
      this.counterEl.textContent = `${n + 1} / ${pc}`;
      this.loadingEl.classList.add('show');
      this.imgEl.onload = () => this.loadingEl.classList.remove('show');
      this.imgEl.onerror = () => this.loadingEl.classList.remove('show');
      this.imgEl.src = this.pageUrl(n);
      this.preload(n + 1); this.preload(n + 2); this.preload(n - 1);
      this.scheduleSave();
    }

    preload(n) {
      if (!this.manifest || n < 0 || n >= this.manifest.pageCount) return;
      if (this.preloadCache.has(n)) return;
      const im = new Image();
      im.src = this.pageUrl(n);
      this.preloadCache.set(n, im);
      if (this.preloadCache.size > 8) {
        const k = this.preloadCache.keys().next().value;
        this.preloadCache.delete(k);
      }
    }

    // ----- ebook mode -----

    async initEbook(progress) {
      this.epubHostEl.style.display = '';
      this.themeBtn.style.display = '';
      this.loadingEl.classList.add('show');

      const base = window.ApiClient.serverAddress();
      // epub.js depends on global JSZip — load jszip first, then epubjs
      await loadScript(`${base}/Jellybook/web/vendor/jszip.js`);
      await loadScript(`${base}/Jellybook/web/vendor/epubjs.js`);

      const epubUrl = this.apiUrl(`/Jellybook/Book/${this.item.Id}/Epub`);
      // eslint-disable-next-line no-undef
      const book = ePub(epubUrl);
      this.book = book;

      const rendition = book.renderTo(this.epubHostEl, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'auto',
        manager: 'default'
      });
      this.rendition = rendition;
      this.applyEpubTheme();

      // Restore progress: stored as basis points 0..10000 in pageIndex
      let start = undefined;
      if (typeof progress.pageIndex === 'number' && progress.pageIndex > 0) {
        const pct = progress.pageIndex / 10000;
        this.lastSavedValue = progress.pageIndex;
        try {
          await book.ready;
          const loc = book.locations.cfiFromPercentage ? book.locations.cfiFromPercentage(pct) : null;
          if (loc) start = loc;
        } catch (_) {}
      }

      rendition.on('relocated', (location) => {
        const pct = location && location.start && typeof location.start.percentage === 'number'
          ? location.start.percentage : 0;
        this.ebookPercentage = pct;
        const display = Math.round(pct * 100);
        this.counterEl.textContent = `${display}%`;
        this.scheduleSave();
      });
      rendition.on('rendered', () => this.loadingEl.classList.remove('show'));

      await rendition.display(start);

      // Generate locations so percentage tracking works (in background, doesn't block first paint)
      book.ready.then(() => book.locations.generate(1024)).catch(() => {});
    }

    cycleTheme() {
      const order = ['light', 'sepia', 'dark'];
      const idx = order.indexOf(this.theme);
      this.theme = order[(idx + 1) % order.length];
      localStorage.setItem('jellybook:theme', this.theme);
      this.root.classList.remove('jb-theme-light', 'jb-theme-sepia', 'jb-theme-dark');
      this.root.classList.add('jb-theme-' + this.theme);
      this.applyEpubTheme();
    }

    applyEpubTheme() {
      if (!this.rendition) return;
      const themes = {
        light: { body: { background: '#f4f1ea', color: '#1c1c1c' } },
        sepia: { body: { background: '#f4ecd8', color: '#3a2e1f' } },
        dark:  { body: { background: '#1a1a1a', color: '#d8d4cc' } }
      };
      const t = themes[this.theme] || themes.light;
      this.rendition.themes.override('background', t.body.background);
      this.rendition.themes.override('color', t.body.color);
    }

    next() {
      if (this.mode === 'comic') this.goto(this.pageIndex + 1);
      else if (this.rendition) this.rendition.next();
    }

    prev() {
      if (this.mode === 'comic') this.goto(this.pageIndex - 1);
      else if (this.rendition) this.rendition.prev();
    }

    onKeydown(e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); this.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prev(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (this.mode === 'comic' && e.key === 'Home') { e.preventDefault(); this.goto(0); }
      else if (this.mode === 'comic' && e.key === 'End') { e.preventDefault(); this.goto(this.manifest.pageCount - 1); }
    }

    showError(msg) {
      const e = document.createElement('div');
      e.className = 'jb-error';
      e.textContent = msg;
      this.stageEl.appendChild(e);
      this.loadingEl.classList.remove('show');
    }

    // ----- progress save (unified for both modes) -----

    scheduleSave() {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.saveProgress();
      }, 1500);
    }

    saveProgress() {
      if (!this.manifest) return;
      let value, total;
      if (this.mode === 'comic') {
        value = this.pageIndex;
        total = this.manifest.pageCount;
      } else if (this.mode === 'ebook') {
        // Store percentage in basis points so we keep ints
        value = Math.max(0, Math.min(9999, Math.floor(this.ebookPercentage * 10000)));
        total = 10000;
      } else {
        return;
      }
      if (value === this.lastSavedValue) return;
      this.lastSavedValue = value;

      const base = window.ApiClient.serverAddress();
      const userId = window.ApiClient.getCurrentUserId();
      const url = `${base}/Jellybook/Book/${this.item.Id}/Progress?userId=${userId}&pageIndex=${value}&pageCount=${total}`;
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
    } catch (err) {
      return;
    }
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
