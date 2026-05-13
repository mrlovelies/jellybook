(function () {
  'use strict';
  console.log('[Jellybook] script loaded');

  const BUTTON_ID = 'jellybook-read-btn';
  const READER_ID = 'jellybook-reader';
  const STYLE_ID = 'jellybook-style';
  const POLL_MS = 500;

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
  z-index: 2;
  transition: opacity 0.25s ease;
}
#${READER_ID} .jb-title {
  font-size: 15px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 60%;
}
#${READER_ID} .jb-counter {
  font-size: 13px; opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
#${READER_ID} .jb-close {
  background: none; border: none; color: #e8e8e8;
  font-size: 24px; line-height: 1; cursor: pointer; padding: 4px 8px;
  border-radius: 6px;
}
#${READER_ID} .jb-close:hover { background: rgba(255,255,255,0.1); }
#${READER_ID} .jb-stage {
  flex: 1; display: flex; align-items: center; justify-content: center;
  overflow: hidden; position: relative;
}
#${READER_ID} .jb-img {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
  box-shadow: 0 4px 30px rgba(0,0,0,0.6);
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
  background: rgba(0,0,0,0.4);
  z-index: 0;
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
#${READER_ID} .jb-error {
  text-align: center; padding: 40px; color: #ff8080;
}
#${BUTTON_ID} .jb-icon { font-style: normal; }
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
      this.pageIndex = 0;
      this.manifest = null;
      this.preloadCache = new Map();
      this.boundKeydown = this.onKeydown.bind(this);
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
        const url = `${window.ApiClient.serverAddress()}/Jellybook/Book/${this.item.Id}/Manifest`;
        const resp = await fetch(url, {
          headers: { 'Authorization': `MediaBrowser Token="${window.ApiClient.accessToken()}"` }
        });
        if (!resp.ok) throw new Error(`manifest ${resp.status}`);
        this.manifest = await resp.json();
        if (!this.manifest.pageCount) {
          this.showError('No pages found in this archive.');
          return;
        }
        this.goto(0);
      } catch (err) {
        console.error('[Jellybook] manifest fetch failed', err);
        this.showError('Failed to load: ' + err.message);
      }
    }

    close() {
      window.removeEventListener('keydown', this.boundKeydown);
      document.body.style.overflow = '';
      if (this.root && this.root.parentNode) {
        this.root.parentNode.removeChild(this.root);
      }
    }

    buildDom() {
      const root = document.createElement('div');
      root.id = READER_ID;
      root.innerHTML = `
        <div class="jb-topbar">
          <div class="jb-title"></div>
          <div class="jb-counter">— / —</div>
          <button class="jb-close" aria-label="Close">✕</button>
        </div>
        <div class="jb-stage">
          <div class="jb-loading"><div class="jb-spinner"></div></div>
          <img class="jb-img" alt="" />
          <div class="jb-zone jb-zone-prev"></div>
          <div class="jb-zone jb-zone-next"></div>
        </div>
      `;
      this.root = root;
      this.titleEl = root.querySelector('.jb-title');
      this.counterEl = root.querySelector('.jb-counter');
      this.imgEl = root.querySelector('.jb-img');
      this.loadingEl = root.querySelector('.jb-loading');
      this.stageEl = root.querySelector('.jb-stage');

      this.titleEl.textContent = this.item.Name || '';

      root.querySelector('.jb-close').addEventListener('click', () => this.close());
      root.querySelector('.jb-zone-prev').addEventListener('click', () => this.prev());
      root.querySelector('.jb-zone-next').addEventListener('click', () => this.next());
    }

    goto(n) {
      if (!this.manifest) return;
      const pc = this.manifest.pageCount;
      n = Math.max(0, Math.min(n, pc - 1));
      this.pageIndex = n;
      this.counterEl.textContent = `${n + 1} / ${pc}`;
      this.loadingEl.classList.add('show');
      const url = this.pageUrl(n);
      this.imgEl.onload = () => this.loadingEl.classList.remove('show');
      this.imgEl.onerror = () => {
        this.loadingEl.classList.remove('show');
        console.warn('[Jellybook] page failed to load', n);
      };
      this.imgEl.src = url;
      this.preload(n + 1);
      this.preload(n + 2);
      this.preload(n - 1);
    }

    preload(n) {
      if (!this.manifest || n < 0 || n >= this.manifest.pageCount) return;
      if (this.preloadCache.has(n)) return;
      const im = new Image();
      im.src = this.pageUrl(n);
      this.preloadCache.set(n, im);
      if (this.preloadCache.size > 8) {
        const oldestKey = this.preloadCache.keys().next().value;
        this.preloadCache.delete(oldestKey);
      }
    }

    next() { this.goto(this.pageIndex + 1); }
    prev() { this.goto(this.pageIndex - 1); }

    onKeydown(e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); this.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prev(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'Home') { e.preventDefault(); this.goto(0); }
      else if (e.key === 'End') { e.preventDefault(); this.goto(this.manifest ? this.manifest.pageCount - 1 : 0); }
    }

    showError(msg) {
      const e = document.createElement('div');
      e.className = 'jb-error';
      e.textContent = msg;
      this.stageEl.appendChild(e);
      this.loadingEl.classList.remove('show');
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

    // Only inject for CBZ for now (Spike 1 — CBR comes in Spike 2)
    const path = (item.Path || '').toLowerCase();
    if (!path.endsWith('.cbz')) return;

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

  function tick() {
    try { maybeInjectButton(); } catch (err) { console.error('[Jellybook] tick', err); }
  }

  setInterval(tick, POLL_MS);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
})();
