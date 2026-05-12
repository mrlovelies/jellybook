(function () {
  'use strict';
  console.log('[Jellybook] script loaded');

  const BUTTON_ID = 'jellybook-read-btn';
  const POLL_MS = 500;

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
      console.warn('[Jellybook] failed to fetch item', err);
      return;
    }

    if (item.Type !== 'Book') return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = 'button-flat btnPlay detailButton emby-button';
    btn.innerHTML =
      '<div class="detailButton-content">' +
      '<span class="material-icons detailButton-icon menu_book" aria-hidden="true">menu_book</span>' +
      '<span class="button-text detailButton-text">Read</span>' +
      '</div>';
    btn.addEventListener('click', () => {
      window.alert(
        'Jellybook says hello!\n\n' +
        'Name: ' + item.Name + '\n' +
        'Type: ' + item.Type + '\n' +
        'Path: ' + (item.Path || 'n/a')
      );
    });

    buttonsRow.appendChild(btn);
    console.log('[Jellybook] read button injected for', item.Name);
  }

  function tick() {
    try {
      maybeInjectButton();
    } catch (err) {
      console.error('[Jellybook] tick error', err);
    }
  }

  setInterval(tick, POLL_MS);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
})();
