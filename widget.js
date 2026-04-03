document.addEventListener('DOMContentLoaded', () => {
  let allRecords = [];
  let selectedTags = {};
  let selectEls = {};
  const STORAGE_KEY = 'grist_filters_state';
  let tagColumns = {};
  let selectColumns = {};
  let visibleFilters = { tags: true };

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

  function renderTags(records) {
    tagContainer.innerHTML = '';

    Object.entries(tagColumns).forEach(([col, label]) => {
      // Visibilité du groupe entier
      if (visibleFilters[col] === false) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'tag-group';

      // En-tête
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

      const title = document.createElement('div');
      title.className = 'tag-title';
      title.style.margin = '0';
      title.textContent = label;

      const btnAll = document.createElement('button');
      btnAll.textContent = 'Tout';
      btnAll.style.cssText = `
        font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;
        background:var(--color-background-info);color:var(--color-text-info);
        border-color:var(--color-border-info);
      `;

      const btnNone = document.createElement('button');
      btnNone.textContent = 'Aucun';
      btnNone.style.cssText = `
        font-size:0.75em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid;
        background:var(--color-background-secondary);color:var(--color-text-secondary);
        border-color:var(--color-border-secondary);
      `;

      header.appendChild(title);
      header.appendChild(btnAll);
      header.appendChild(btnNone);
      wrapper.appendChild(header);

      const row = document.createElement('div');
      row.className = 'tag-row';

      const uniqueValues = [...new Set(records.flatMap(r => cleanVal(r[col])))];

      // ✅ Ne PAS réinitialiser selectedTags ici — conserver l'état existant
      if (!selectedTags[col]) selectedTags[col] = [];

      // Compteur actif pour le bouton Tout/Aucun
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
        tag.dataset.col = col;
        tag.dataset.val = val;

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

      // État initial des boutons
      updateBtnStyles();

      wrapper.appendChild(row);
      tagContainer.appendChild(wrapper);
    });
  }

  function renderSelects(records) {
    selectContainer.innerHTML = '';
    selectEls = {};

    Object.entries(selectColumns).forEach(([col, label]) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'filter-card';

      const title = document.createElement('div');
      title.className = 'filter-title';
      title.textContent = label;

      const select = document.createElement('select');
      select.className = 'filter-multi';
      select.appendChild(new Option('— Tous —', ''));

      const counts = countValues(records, col);
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([val, count]) => select.appendChild(new Option(`${val} (${count})`, val)));

      select.addEventListener('change', applyFilters);
      wrapper.appendChild(title);
      wrapper.appendChild(select);
      selectContainer.appendChild(wrapper);
      selectEls[col] = select;
    });
  }

  // ✅ Une seule définition de applyFilters, avec cleanVal
  function applyFilters() {
    let filtered = [...allRecords];

    Object.keys(selectedTags).forEach(col => {
      const vals = selectedTags[col];
      if (vals && vals.length > 0) {
        filtered = filtered.filter(r => cleanVal(r[col]).some(v => vals.includes(v)));
      }
    });

    Object.keys(selectEls).forEach(col => {
      const val = selectEls[col]?.value;
      if (val) {
        filtered = filtered.filter(r => cleanVal(r[col]).includes(val));
      }
    });

    const search = globalSearch.value.toLowerCase().trim();
    if (search) {
      filtered = filtered.filter(r =>
        Object.values(r).some(v => {
          if (!v) return false;
          if (Array.isArray(v)) return v.some(x => String(x).toLowerCase().includes(search));
          return String(v).toLowerCase().includes(search);
        })
      );
    }

    resultsCount.textContent = `🔢 Résultats: ${filtered.length}`;
    grist.setSelectedRows(filtered.map(r => r.id));
    updateDisabledOptions(filtered);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTags, selectEls: serializeSelects(), visibleFilters
    }));
  }

  function updateDisabledOptions(filtered) {
    Object.keys(tagColumns).forEach(col => {
      const counts = countValues(filtered, col);
      tagContainer.querySelectorAll('.tag-group').forEach(group => {
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
    tagContainer.style.display = visibleFilters.tags ? 'block' : 'none';

    // Visibilité des groupes de tags individuels
    tagContainer.querySelectorAll('.tag-group').forEach(group => {
      const groupLabel = group.querySelector('.tag-title')?.textContent;
      const col = Object.entries(tagColumns).find(([_, label]) => label === groupLabel)?.[0];
      if (col) group.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    // Visibilité des selects
    document.querySelectorAll('.filter-card').forEach(card => {
      const titleText = card.querySelector('.filter-title')?.textContent;
      const col = Object.entries(selectColumns).find(([_, label]) => label === titleText)?.[0];
      if (col) card.style.display = visibleFilters[col] !== false ? 'block' : 'none';
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTags, selectEls: serializeSelects(), visibleFilters
    }));
  }

  function renderFilterCheckboxes() {
    filterCheckboxesContainer.innerHTML = '';

    // Section tags
    if (Object.keys(tagColumns).length > 0) {
      const section = document.createElement('div');
      section.innerHTML = '<div style="font-weight:500;margin-bottom:6px;">Groupes de tags</div>';

      Object.entries(tagColumns).forEach(([col, label]) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
          <input type="checkbox" id="show-tag-${col}" ${visibleFilters[col] !== false ? 'checked' : ''}>
          <label for="show-tag-${col}">${label}</label>
        `;
        div.querySelector('input').addEventListener('change', e => {
          visibleFilters[col] = e.target.checked;
          renderTags(allRecords);
          updateFilterVisibility();
        });
        section.appendChild(div);
      });
      filterCheckboxesContainer.appendChild(section);
    }

    // Section selects
    if (Object.keys(selectColumns).length > 0) {
      const section = document.createElement('div');
      section.innerHTML = '<div style="font-weight:500;margin:12px 0 6px;">Filtres</div>';

      Object.entries(selectColumns).forEach(([col, label]) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
          <input type="checkbox" id="show-sel-${col}" ${visibleFilters[col] !== false ? 'checked' : ''}>
          <label for="show-sel-${col}">${label}</label>
        `;
        div.querySelector('input').addEventListener('change', e => {
          visibleFilters[col] = e.target.checked;
          updateFilterVisibility();
        });
        section.appendChild(div);
      });
      filterCheckboxesContainer.appendChild(section);
    }
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
    renderTags(allRecords);
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

    renderTags(records);
    renderSelects(records);

    resultsCount.textContent = `🔢 Résultats: ${allRecords.length}`;
    grist.setSelectedRows(allRecords.map(r => r.id));

    restoreState();
  });
});