// ============================================================
// Searchable Combobox — pencarian real-time per-huruf
// Mengganti <select> biasa menjadi input teks + dropdown hasil
// filter yang update setiap kali user mengetik (tanpa Enter).
//
// CARA PAKAI di EJS:
//   <div class="combo-wrap" data-name="pelanggan_id">
//     <input type="text" class="input-field combo-input" placeholder="Cari pelanggan...">
//     <input type="hidden" name="pelanggan_id" class="combo-value">
//     <div class="combo-dropdown hidden"></div>
//   </div>
//   <script>
//     initCombobox(document.querySelector('[data-name="pelanggan_id"]'), [
//       { id: '...', label: 'PL-000001 · Budi (konsumen)', searchText: 'PL-000001 budi konsumen', kategori: 'konsumen' }
//     ], {
//       emptyAction: {
//         label: 'Tambah Pelanggan Baru',
//         buildUrl: (query) => `/master/pelanggan/tambah?nama=${encodeURIComponent(query)}`
//       }
//     });
//   </script>
// ============================================================

function initCombobox(wrapEl, items, opts = {}) {
  const input = wrapEl.querySelector('.combo-input');
  const hiddenInput = wrapEl.querySelector('.combo-value');
  const dropdown = wrapEl.querySelector('.combo-dropdown');
  const onSelect = opts.onSelect || function () {};
  const maxResults = opts.maxResults || 50;
  const emptyAction = opts.emptyAction || null;

  let filtered = [];
  let activeIndex = -1;
  let lastQuery = '';

  function normalize(str) {
    return (str || '').toString().toLowerCase();
  }

  function render() {
    if (filtered.length === 0) {
      const emptyMessage = (emptyAction && emptyAction.message) || 'Tidak ditemukan';
      let html = `<div class="combo-empty">${emptyMessage}</div>`;
      if (emptyAction) {
        const url = emptyAction.buildUrl(lastQuery);
        html += `<a href="${url}" class="combo-empty-action">${emptyAction.label}</a>`;
      }
      dropdown.innerHTML = html;
    } else {
      dropdown.innerHTML = filtered
        .slice(0, maxResults)
        .map((item, idx) => `<div class="combo-item ${idx === activeIndex ? 'combo-item-active' : ''}" data-idx="${idx}">${item.label}</div>`)
        .join('');
    }
    dropdown.classList.remove('hidden');
  }

  function filterItems(query) {
    lastQuery = query || '';
    const q = normalize(query);
    if (!q) {
      filtered = items.slice(0, maxResults);
    } else {
      filtered = items.filter(item => normalize(item.searchText || item.label).includes(q));
    }
    activeIndex = -1;
    render();
  }

  function selectItem(item) {
    input.value = item.label;
    hiddenInput.value = item.id;
    dropdown.classList.add('hidden');
    onSelect(item);
  }

  input.addEventListener('input', () => {
    hiddenInput.value = ''; // reset pilihan kalau user mengetik ulang
    filterItems(input.value);
  });

  input.addEventListener('focus', () => {
    filterItems(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (dropdown.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
      render();
      scrollActiveIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
      scrollActiveIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) {
        selectItem(filtered[activeIndex]);
      } else if (filtered.length === 0 && emptyAction) {
        window.location.href = emptyAction.buildUrl(lastQuery);
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  });

  function scrollActiveIntoView() {
    const activeEl = dropdown.querySelector('.combo-item-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  dropdown.addEventListener('mousedown', (e) => {
    const itemEl = e.target.closest('.combo-item');
    if (itemEl) {
      e.preventDefault();
      const idx = Number(itemEl.dataset.idx);
      selectItem(filtered[idx]);
      return;
    }
    // Tombol "Tambah Pelanggan Baru" dibiarkan navigasi normal (tidak preventDefault)
  });

  document.addEventListener('click', (e) => {
    if (!wrapEl.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  // Tombol "Tambah X Baru" di empty state ada di dalam wrapEl, jadi
  // listener di atas tidak akan menutupnya sebelum navigasi terjadi.
  // Tambahan pengaman: pastikan link tetap bisa diklik walau dropdown
  // sempat tersembunyi sesaat akibat blur pada input.
  dropdown.addEventListener('click', (e) => {
    const actionEl = e.target.closest('.combo-empty-action');
    if (actionEl) {
      window.location.href = actionEl.getAttribute('href');
    }
  });

  // Pre-fill jika ada nilai awal (mode edit)
  if (opts.initialId) {
    const found = items.find(i => i.id === opts.initialId);
    if (found) {
      input.value = found.label;
      hiddenInput.value = found.id;
    }
  }

  return {
    setItems(newItems) { items = newItems; },
    clear() { input.value = ''; hiddenInput.value = ''; },
  };
}
