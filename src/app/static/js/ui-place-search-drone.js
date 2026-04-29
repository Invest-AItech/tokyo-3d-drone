const DEBOUNCE_MS = 250;

export function mountPlaceSearchDrone({ rootEl, api, onPick }) {
  const input = rootEl.querySelector('#ps-input');
  const suggest = rootEl.querySelector('#ps-suggest');
  let timer = null;

  // Event delegation: ONE click handler on parent (per memory: feedback_suggest_dropdown_event_delegation)
  suggest.addEventListener('click', async (e) => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    const placeId = item.dataset.placeId;
    if (!placeId) return;
    const details = await api.getDetails(placeId);
    if (details && details.in_tokyo23 === false) {
      // Out of Tokyo 23 ku — silent skip (UI message handled by caller via in_tokyo23 check)
      return;
    }
    if (details && details.lat != null && details.lon != null) {
      onPick({ lat: details.lat, lon: details.lon, name: details.name });
      input.value = '';
      suggest.innerHTML = '';
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) {
      suggest.innerHTML = '';
      return;
    }
    timer = setTimeout(async () => {
      const res = await api.autocomplete(q);
      if (!res || !Array.isArray(res.predictions)) {
        suggest.innerHTML = '';
        return;
      }
      suggest.innerHTML = res.predictions.map(p =>
        `<li class="suggest-item" data-place-id="${p.place_id}">${escapeHtml(p.description || '')}</li>`
      ).join('');
    }, DEBOUNCE_MS);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
