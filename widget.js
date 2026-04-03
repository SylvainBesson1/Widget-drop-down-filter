document.addEventListener('DOMContentLoaded', () => {
  let allRecords = [];
  let selectedTags = {};
  let selectEls = {};
  const STORAGE_KEY = 'grist_filters_state';
  let tagColumns = {};
  let selectColumns = {};
  let visibleFilters = { tags: true };
  let columnsOrder = []; // ordre global : mélange tags + selects

  const tagContainer = document.getElementById('tag-filters');
  const selectContainer = document.getElementById('dynamic-filters');
  const globalSearch = document.getElementById('global-search');
  const resultsCount = document.getElementById('results-count');
  const resetButton = document.getElementById('reset-filters');
  const manageFiltersBtn = document.getElementById('manage-filters-btn');
  const filterModal = document.getElementById('filter-modal');
  const closeModalBtn = document.getElementById('close-modal');
  const filterCheckboxesContainer = document.getElementById('filter-checkboxes');
  const selectAllBtn = document.getElementById('select-all');
  const deselectAllBtn = document.getElementById('deselect-all');

  // Nettoie les valeurs Grist (retire le marqueur "L" des ChoiceList)
  const cleanVal = (v) => {
    if (Array.isArray(v)) return v.filter(x => x !== 'L' && x !== null && x !== undefined && x !== '');
    return v ? [String(v)] : [];
  };

  async function fetchColumnsAndTypes() {
    const colTable = await grist.docApi.fetchTable('_grist_Tables_column');
    const tableRef = await grist.docApi.fetchTable('_grist_Tables');

    let tableId;
    try {
      tableId = await grist.selectedTable.getTableId();
    } catch {
      try {
        tableId = await grist.getOption('tableId');
      } catch {
        console.error('Impossible de récupérer le tableId.');
        return;
      }
    }

    if (!tableId) { console.error('tableId est vide.'); return; }

    const tableIdx = tableRef.tableId.indexOf(tableId);
    if (tableIdx === -1) { console.error('Table non trouvée :', tableId); return; }
    const parentRef = tableRef.id[tableIdx];

    colTable.parentId.forEach((pid, i) => {
      if (pid !== parentRef) return;
      const colId = colTable.colId[i];
      const label = colTable.label[i] || colId;
      const type  = colTable.type[i];
      if (!colId || colId.startsWith('gristHelper') || colId === 'manualSort') return;

      if (type === 'Choice' || type.startsWith('Ref:')) {
        selectColumns[colId] = label;
      } else if (type === 'ChoiceList' || type.startsWith('RefList:')) {
        tagColumns[colId] = label;
      }
    });

    // Initialiser visibleFilters pour toutes les colonnes
    Object.keys(selectColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
    });
    Object.keys(tagColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
    });

    console.log('select:', selectColumns, 'tags:', tagColumns);
  }

  function countValues(records, col) {
    const counts = {};
    records.forEach(r => {
      cleanVal(r[col]).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    });
    return counts;
  }
  // Construit l'ordre initial si pas encore défini
  function initOrder() {
    const allCols = [
      ...Object.keys(tagColumns).map(col => ({ col, type: 'tag' })),
      ...Object.keys(selectColumns).map(col => ({ col, type: 'select' })),
    ];
    // Garder l'ordre sauvegardé, ajouter les nouvelles colonnes à la fin
    const savedOrder = visibleFilters.order || [];
    const existing = new Set(savedOrder.map(o => o.col));
    columnsOrder = [
      ...savedOrder.filter(o => allCols.some(c => c.col === o.col)), // conserver ceux qui existent encore
      ...allCols.filter(c => !existing.has(c.col)),                  // ajouter les nouveaux
    ];
    visibleFilters.order = columnsOrder;
  }

  function applyOrder() {
  initOrder();
  renderTags(allRecords);   // ✅ utilise allRecords explicitement
  renderSelects(allRecords); // ✅ idem
  updateFilterVisibility();  // ✅ applique la visibilité après le rendu
}

  function applyOrder() {
    initOrder();
    const container = document.getElementById('filters-container');
    container.innerHTML = '';
    selectEls = {};

    columnsOrder.forEach(({ col, type }) => {
      if (visibleFilters[col] === false) return;

      if (type === 'tag') {
        const label = tagColumns[col];
        if (!label) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'tag-group';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

        const title = document.createElement('div');
        title.className = 'tag-title';
        title.style.margin = '0';
        title.textContent = label;

        const btnAll = document.createElement('button');
        btnAll.textContent = 'Tout';
        btnAll.style.cssText = 'font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;background:var(--color-background-info);color:var(--color-text-info);border-color:var(--color-border-info);';

        const btnNone = document.createElement('button');
        btnNone.textContent = 'Aucun';
        btnNone.style.cssText = 'font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;background:var(--color-background-secondary);color:var(--color-text-secondary);border-color:var(--color-border-secondary);';

        header.appendChild(title);
        header.appendChild(btnAll);
        header.appendChild(btnNone);
        wrapper.appendChild(header);

        const row = document.createElement('div');
        row.className = 'tag-row';

        const uniqueValues = [...new Set(allRecords.flatMap(r => cleanVal(r[col])))];
        if (!selectedTags[col]) selectedTags[col] = [];

        const updateBtnStyles = () => {
          const allSelected = uniqueValues.every(v => selectedTags[col].includes(v));
          const noneSelected = selectedTags[col].length === 0;
          btnAll.style.fontWeight = allSelected ? '600' : '400';
          btnAll.style.opacity = allSelected ? '1' : '0.6';
          btnNone.style.fontWeight = noneSelected ? '600' : '400';
          btnNone.style.opacity = noneSelected ? '1' : '0.6';
        };

        uniqueValues.forEach(val => {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = val;
          if (selectedTags[col].includes(val)) tag.classList.add('active');
          tag.addEventListener('click', () => {
            if (selectedTags[col].includes(val)) {
              selectedTags[col] = selectedTags[col].filter(v => v !== val);
              tag.classList.remove('active');
            } else {
              selectedTags[col].push(val);
              tag.classList.add('active');
            }
            updateBtnStyles();
            applyFilters();
          });
          row.appendChild(tag);
        });

        btnAll.addEventListener('click', () => {
          selectedTags[col] = [...uniqueValues];
          row.querySelectorAll('.tag').forEach(t => t.classList.add('active'));
          updateBtnStyles();
          applyFilters();
        });

        btnNone.addEventListener('click', () => {
          selectedTags[col] = [];
          row.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
          updateBtnStyles();
          applyFilters();
        });

        updateBtnStyles();
        wrapper.appendChild(row);
        container.appendChild(wrapper);

      } else if (type === 'select') {
        const label = selectColumns[col];
        if (!label) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'filter-card';

        const title = document.createElement('div');
        title.className = 'filter-title';
        title.textContent = label;

        const select = document.createElement('select');
        select.className = 'filter-multi';
        select.appendChild(new Option('— Tous —', ''));

        const counts = countValues(allRecords, col);
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([val, count]) => select.appendChild(new Option(`${val} (${count})`, val)));

        select.addEventListener('change', applyFilters);
        wrapper.appendChild(title);
        wrapper.appendChild(select);
        container.appendChild(wrapper);
        selectEls[col] = select;
      }
    });
  }

  function updateDisabledOptions(filtered) {
    const container = document.getElementById('filters-container');

    Object.keys(tagColumns).forEach(col => {
      const counts = countValues(filtered, col);
      container.querySelectorAll('.tag-group').forEach(group => {
        if (group.querySelector('.tag-title')?.textContent !== tagColumns[col]) return;
        group.querySelectorAll('.tag').forEach(tag => {
          tag.classList.toggle('disabled', !counts[tag.textContent]);
        });
      });
    });

    Object.keys(selectColumns).forEach(col => {
      if (!selectEls[col]) return;
      const counts = countValues(filtered, col);
      Array.from(selectEls[col].options).forEach(opt => {
        if (!opt.value) return;
        opt.disabled = !counts[opt.value];
      });
    });
  }

  function serializeSelects() {
    const sel = {};
    Object.entries(selectEls).forEach(([col, selEl]) => { sel[col] = selEl.value; });
    return sel;
  }

  function updateFilterVisibility() {
    const container = document.getElementById('filters-container');

    container.querySelectorAll('.tag-group').forEach(group => {
      const groupLabel = group.querySelector('.tag-title')?.textContent;
      const col = Object.entries(tagColumns).find(([_, l]) => l === groupLabel)?.[0];
      if (col) group.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    container.querySelectorAll('.filter-card').forEach(card => {
      const titleText = card.querySelector('.filter-title')?.textContent;
      const col = Object.entries(selectColumns).find(([_, l]) => l === titleText)?.[0];
      if (col) card.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTags, selectEls: serializeSelects(), visibleFilters
    }));
  }

  function renderFilterCheckboxes() {
    filterCheckboxesContainer.innerHTML = '';

    const intro = document.createElement('div');
    intro.style.cssText = 'font-size:0.8em;color:var(--color-text-secondary);margin-bottom:10px;';
    intro.textContent = 'Glisse les éléments pour réordonner. Coche/décoche pour afficher.';
    filterCheckboxesContainer.appendChild(intro);

    columnsOrder.forEach(({ col, type }) => {
      const label = type === 'tag' ? tagColumns[col] : selectColumns[col];
      if (!label) return;

      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.dataset.col = col;
      div.dataset.type = type;
      div.draggable = true;
      div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:grab;border-radius:4px;border:1px solid transparent;transition:background 0.15s;';

      const handle = document.createElement('span');
      handle.textContent = '⠿';
      handle.style.cssText = 'color:var(--color-text-tertiary);font-size:1.1em;flex-shrink:0;';

      const badge = document.createElement('span');
      badge.textContent = type === 'tag' ? 'tag' : 'filtre';
      badge.style.cssText = `font-size:0.7em;padding:1px 5px;border-radius:3px;flex-shrink:0;
        background:${type === 'tag' ? 'var(--color-background-info)' : 'var(--color-background-secondary)'};
        color:${type === 'tag' ? 'var(--color-text-info)' : 'var(--color-text-secondary)'};`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `order-${col}`;
      checkbox.checked = visibleFilters[col] !== false;
      checkbox.addEventListener('change', e => {
        visibleFilters[col] = e.target.checked;
        renderTags(allRecords);
        updateFilterVisibility();
      });

      const labelEl = document.createElement('label');
      labelEl.htmlFor = `order-${col}`;
      labelEl.textContent = label;
      labelEl.style.cssText = 'flex:1;cursor:pointer;';

      div.appendChild(handle);
      div.appendChild(badge);
      div.appendChild(checkbox);
      div.appendChild(labelEl);
      filterCheckboxesContainer.appendChild(div);
    });

    // Drag and drop
    let dragEl = null;

    filterCheckboxesContainer.addEventListener('dragstart', e => {
      dragEl = e.target.closest('[draggable]');
      if (!dragEl) return;
      dragEl.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });

    filterCheckboxesContainer.addEventListener('dragend', e => {
      if (dragEl) dragEl.style.opacity = '1';
      dragEl = null;
      // Supprimer les indicateurs visuels
      filterCheckboxesContainer.querySelectorAll('[data-col]').forEach(el => {
        el.style.borderTop = '';
        el.style.background = '';
      });
    });

    filterCheckboxesContainer.addEventListener('dragover', e => {
      e.preventDefault();
      const target = e.target.closest('[data-col]');
      if (!target || target === dragEl) return;
      // Indicateur visuel
      filterCheckboxesContainer.querySelectorAll('[data-col]').forEach(el => {
        el.style.borderTop = '';
        el.style.background = '';
      });
      target.style.borderTop = '2px solid var(--color-text-info)';
    });

    filterCheckboxesContainer.addEventListener('drop', e => {
      e.preventDefault();
      const target = e.target.closest('[data-col]');
      if (!target || target === dragEl) return;

      const fromCol = dragEl.dataset.col;
      const toCol = target.dataset.col;

      const fromIdx = columnsOrder.findIndex(o => o.col === fromCol);
      const toIdx   = columnsOrder.findIndex(o => o.col === toCol);

      // Réordonner
      const [moved] = columnsOrder.splice(fromIdx, 1);
      columnsOrder.splice(toIdx, 0, moved);
      visibleFilters.order = columnsOrder;

      // Sauvegarder et re-rendre
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedTags, selectEls: serializeSelects(), visibleFilters
      }));

      renderFilterCheckboxes();
      applyOrder();
    });
  }

  function restoreState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const state = JSON.parse(saved);
      selectedTags = state.selectedTags || {};
      if (state.visibleFilters) visibleFilters = state.visibleFilters;
      Object.entries(state.selectEls || {}).forEach(([col, val]) => {
        if (selectEls[col]) selectEls[col].value = val;
      });
      updateFilterVisibility();
    } catch (e) {
      console.error('Erreur restauration état :', e);
    }
  }

    resetButton.addEventListener('click', () => {
    selectedTags = {};
    Object.values(selectEls).forEach(sel => sel.value = '');
    globalSearch.value = '';
    applyOrder(); // ✅ au lieu de renderTags + renderSelects séparément
    applyFilters();
  });

  manageFiltersBtn.addEventListener('click', () => {
    filterModal.style.display = 'flex';
    renderFilterCheckboxes();
  });

  closeModalBtn.addEventListener('click', () => {
    filterModal.style.display = 'none';
  });

  selectAllBtn.addEventListener('click', () => {
    visibleFilters.tags = true;
    Object.keys(selectColumns).forEach(col => { visibleFilters[col] = true; });
    Object.keys(tagColumns).forEach(col => { visibleFilters[col] = true; });
    renderTags(allRecords);
    updateFilterVisibility();
    renderFilterCheckboxes();
  });

  deselectAllBtn.addEventListener('click', () => {
    visibleFilters.tags = false;
    Object.keys(selectColumns).forEach(col => { visibleFilters[col] = false; });
    Object.keys(tagColumns).forEach(col => { visibleFilters[col] = false; });
    renderTags(allRecords);
    updateFilterVisibility();
    renderFilterCheckboxes();
  });


  globalSearch.addEventListener('input', applyFilters);

  grist.ready({ requiredAccess: 'full', allowSelectBy: true });

  grist.onRecords(async (records) => {
    allRecords = records;
    tagColumns = {};
    selectColumns = {};

    try {
      await fetchColumnsAndTypes();
    } catch (error) {
      console.error('Impossible de récupérer les métadonnées :', error);
    }

    initOrder();
    applyOrder();

    resultsCount.textContent = `🔢 Résultats: ${allRecords.length}`;
    grist.setSelectedRows(allRecords.map(r => r.id));

    restoreState();
  });
});