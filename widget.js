document.addEventListener('DOMContentLoaded', () => {
  let allRecords = [];
  let selectedTags = {};
  let selectEls = {};
  const STORAGE_KEY = 'grist_filters_state';
  let tagColumns = {};
  let selectColumns = {};
  let visibleFilters = {
  tags: true, // Visibilité globale des tags
  ...Object.keys(selectColumns).reduce((acc, col) => ({ ...acc, [col]: true }), {}),
  ...Object.keys(tagColumns).reduce((acc, col) => ({ ...acc, [col]: true }), {}),
};

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

    if (!tableId) {
      console.error('tableId est vide.');
      return;
    }

    const tableIdx = tableRef.tableId.indexOf(tableId);
    if (tableIdx === -1) {
      console.error('Table non trouvée dans _grist_Tables :', tableId);
      return;
    }
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

    // Initialiser visibleFilters pour les nouvelles colonnes
    Object.keys(selectColumns).forEach(col => {
      if (visibleFilters[col] === undefined) visibleFilters[col] = true;
    });

    console.log('Colonnes select :', selectColumns);
    console.log('Colonnes tags :', tagColumns);
  }

// Remplace countValues par :
function countValues(records, col) {
  const counts = {};
  records.forEach(r => {
    let val = r[col];
    if (!val) return;
    const values = Array.isArray(val)
      ? val.filter(x => x !== 'L' && x !== null && x !== undefined && x !== '')
      : [val];
    values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  });
  return counts;
}

// Remplace applyFilters par :
function applyFilters() {
  let filtered = [...allRecords];

  const cleanVal = (v) => {
    if (Array.isArray(v)) return v.filter(x => x !== 'L' && x !== null && x !== undefined && x !== '');
    return v ? [String(v)] : [];
  };

  Object.keys(selectedTags).forEach(col => {
    const vals = selectedTags[col];
    if (vals && vals.length > 0) {
      filtered = filtered.filter(r => cleanVal(r[col]).some(v => vals.includes(v)));
    }
  });

  Object.keys(selectEls).forEach(col => {
    const selectEl = selectEls[col];
    if (!selectEl) return;
    const val = selectEl.value;
    if (val) {
      filtered = filtered.filter(r => cleanVal(r[col]).includes(val) || String(r[col]) === val);
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
    selectedTags,
    selectEls: serializeSelects(),
    visibleFilters
  }));
}

  function renderTags(records) {
    tagContainer.innerHTML = '';
    Object.entries(tagColumns).forEach(([col, label]) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'tag-group';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';

      const title = document.createElement('div');
      title.className = 'tag-title';
      title.style.margin = '0';
      title.textContent = label;

      const btnAll = document.createElement('button');
      btnAll.textContent = 'Tout';
      btnAll.style.cssText = 'font-size:0.75em;padding:1px 6px;cursor:pointer;';

      const btnNone = document.createElement('button');
      btnNone.textContent = 'Aucun';
      btnNone.style.cssText = 'font-size:0.75em;padding:1px 6px;cursor:pointer;';

      header.appendChild(title);
      header.appendChild(btnAll);
      header.appendChild(btnNone);
      wrapper.appendChild(header);

      const row = document.createElement('div');
      row.className = 'tag-row';

      // Nettoyage du marqueur interne Grist ["L", "val1", "val2"]
      const cleanVal = (v) => {
        if (Array.isArray(v)) return v.filter(x => x !== 'L' && x !== null && x !== undefined && x !== '');
        return v ? [v] : [];
      };

      const uniqueValues = [...new Set(records.flatMap(r => cleanVal(r[col])))];

      if (!selectedTags[col]) selectedTags[col] = [];

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
          applyFilters();
        });

        row.appendChild(tag);
      });

      btnAll.addEventListener('click', () => {
        selectedTags[col] = [...uniqueValues];
        row.querySelectorAll('.tag').forEach(t => t.classList.add('active'));
        applyFilters();
      });

      btnNone.addEventListener('click', () => {
        selectedTags[col] = [];
        row.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
        applyFilters();
      });

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

      // Option vide = "pas de filtre"
      const emptyOpt = new Option('— Tous —', '');
      select.appendChild(emptyOpt);

      const counts = countValues(records, col);
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([val, count]) => {
          select.appendChild(new Option(`${val} (${count})`, val));
        });

      select.addEventListener('change', applyFilters);

      wrapper.appendChild(title);
      wrapper.appendChild(select);
      selectContainer.appendChild(wrapper);
      selectEls[col] = select;
    });
  }

  function applyFilters() {
    let filtered = [...allRecords];

    Object.keys(selectedTags).forEach(col => {
      const vals = selectedTags[col];
      if (vals && vals.length > 0) {
        filtered = filtered.filter(r => {
          const val = r[col];
          if (Array.isArray(val)) return val.some(v => vals.includes(v));
          return vals.includes(val);
        });
      }
    });

    Object.keys(selectEls).forEach(col => {
      const selectEl = selectEls[col];
      if (!selectEl) return;
      const val = selectEl.value;
      if (val) {
        filtered = filtered.filter(r => {
          const rv = r[col];
          if (Array.isArray(rv)) return rv.includes(val);
          return String(rv) === val;
        });
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
      selectedTags,
      selectEls: serializeSelects(),
      visibleFilters
    }));
  }

  function updateDisabledOptions(filtered) {
    Object.keys(tagColumns).forEach(col => {
      const counts = countValues(filtered, col);
      tagContainer.querySelectorAll('.tag-group').forEach(group => {
        const groupLabel = group.querySelector('.tag-title')?.textContent;
        if (groupLabel !== tagColumns[col]) return;
        group.querySelectorAll('.tag').forEach(tag => {
          const text = tag.textContent;
          tag.classList.toggle('disabled', !counts[text]);
        });
      });
    });

    Object.keys(selectColumns).forEach(col => {
      if (!selectEls[col]) return;
      const counts = countValues(filtered, col);
      Array.from(selectEls[col].options).forEach(opt => {
        if (!opt.value) return; // garder "— Tous —" toujours actif
        opt.disabled = !counts[opt.value];
      });
    });
  }

  function serializeSelects() {
    const sel = {};
    Object.entries(selectEls).forEach(([col, selEl]) => {
      sel[col] = selEl.value;
    });
    return sel;
  }

  function updateFilterVisibility() {
    tagContainer.style.display = visibleFilters.tags ? 'block' : 'none';

    document.querySelectorAll('.filter-card').forEach(card => {
      const titleText = card.querySelector('.filter-title')?.textContent;
      const col = Object.entries(selectColumns).find(([_, label]) => label === titleText)?.[0];
      if (col) card.style.display = visibleFilters[col] ? 'block' : 'none';
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTags,
      selectEls: serializeSelects(),
      visibleFilters
    }));
  }

  function renderFilterCheckboxes() {
    filterCheckboxesContainer.innerHTML = '';

    // Checkbox pour afficher/masquer tous les tags
    const tagCheckbox = document.createElement('div');
    tagCheckbox.className = 'checkbox-item';
    tagCheckbox.innerHTML = `
      <input type="checkbox" id="show-tags" ${visibleFilters.tags ? 'checked' : ''}>
      <label for="show-tags">Filtres par tags</label>
    `;
    tagCheckbox.querySelector('input').addEventListener('change', (e) => {
      visibleFilters.tags = e.target.checked;
      updateFilterVisibility();
    });
    filterCheckboxesContainer.appendChild(tagCheckbox);

    // Checkbox pour chaque colonne de type "select"
    Object.entries(selectColumns).forEach(([col, label]) => {
      const checkbox = document.createElement('div');
      checkbox.className = 'checkbox-item';
      checkbox.innerHTML = `
        <input type="checkbox" id="show-${col}" ${visibleFilters[col] ? 'checked' : ''}>
        <label for="show-${col}">${label}</label>
      `;
      checkbox.querySelector('input').addEventListener('change', (e) => {
        visibleFilters[col] = e.target.checked;
        updateFilterVisibility();
      });
      filterCheckboxesContainer.appendChild(checkbox);
    });

    // Checkbox pour chaque colonne de type "tag"
    Object.entries(tagColumns).forEach(([col, label]) => {
      const checkbox = document.createElement('div');
      checkbox.className = 'checkbox-item';
      checkbox.innerHTML = `
        <input type="checkbox" id="show-${col}" ${visibleFilters[col] ? 'checked' : ''}>
        <label for="show-${col}">${label}</label>
      `;
      checkbox.querySelector('input').addEventListener('change', (e) => {
        visibleFilters[col] = e.target.checked;
        updateFilterVisibility();
      });
      filterCheckboxesContainer.appendChild(checkbox);
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

  // Événements boutons
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
    updateFilterVisibility();
    renderFilterCheckboxes();
  });

  deselectAllBtn.addEventListener('click', () => {
    visibleFilters.tags = false;
    Object.keys(selectColumns).forEach(col => { visibleFilters[col] = false; });
    updateFilterVisibility();
    renderFilterCheckboxes();
  });

  globalSearch.addEventListener('input', applyFilters);

  // Point d'entrée principal
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