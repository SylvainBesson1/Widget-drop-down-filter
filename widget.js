document.addEventListener('DOMContentLoaded', () => {
  grist.ready({ requiredAccess: 'full', allowSelectBy: true });

    let allRecords = [];
    let selectedTags = {};
    const STORAGE_KEY = 'grist_filters_state';
    let tagColumns = {};
    let selectColumns = {};        
    let selectEls = {};

   async function fetchColumnsAndTypes() {
      try {
        const tableInfo = await grist.docApi.fetchSelectedTable();
        console.log("Structure de la table :", tableInfo); // Affiche la structure complète pour débogage

        // Vérifier si 'columns' existe dans la réponse
        if (!tableInfo || !tableInfo.columns) {
          console.error("La propriété 'columns' est introuvable dans la réponse de l'API.");
          return;
        }

        const columns = tableInfo.columns;
        columns.forEach(col => {
          const colName = col.id;
          const colType = col.type;

          // Classer les colonnes selon leur type
          if (colType === 'Choice' || colType === 'Reference') {
            selectColumns[colName] = col.label || colName;
          } else if (colType === 'ChoiceList' || colType === 'ReferenceList') {
            tagColumns[colName] = col.label || colName;
          }
        });

        console.log("Colonnes de type 'select' :", selectColumns);
        console.log("Colonnes de type 'tag' :", tagColumns);
      } catch (error) {
        console.error("Erreur lors de la récupération des colonnes :", error);
      }
    }

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

    let visibleFilters = {
      tags: true,
      ...Object.keys(selectColumns).reduce((acc, col) => ({ ...acc, [col]: true }), {}),
    };

    function inferColumnTypes(records) {
      const sampleRecord = records[0];
      if (!sampleRecord) return;

      Object.keys(sampleRecord).forEach(colName => {
        const sampleValue = sampleRecord[colName];

        // Détecter les types de colonnes (simplifié)
        if (Array.isArray(sampleValue)) {
          tagColumns[colName] = colName; // Supposons que les tableaux sont des "tags"
        } else if (typeof sampleValue === 'string' || typeof sampleValue === 'number') {
          selectColumns[colName] = colName; // Supposons que les valeurs simples sont des "selects"
        }
      });

      console.log("Colonnes de type 'select' (inférées) :", selectColumns);
      console.log("Colonnes de type 'tag' (inférées) :", tagColumns);
    }

    function countValues(records, col) {
      const counts = {};
      records.forEach(r => {
        let val = r[col];
        if (!val) return;
        if (Array.isArray(val)) {
          val.forEach(v => {
            counts[v] = (counts[v] || 0) + 1;
          });
        } else {
          counts[val] = (counts[val] || 0) + 1;
        }
      });
      return counts;
    }

    function renderTags(records) {
      tagContainer.innerHTML = '';
      Object.entries(tagColumns).forEach(([col, label]) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'tag-group';
        const title = document.createElement('div');
        title.className = 'tag-title';
        title.textContent = label;
        wrapper.appendChild(title);

        const row = document.createElement('div');
        row.className = 'tag-row';

        // Récupérer les valeurs uniques pour cette colonne
        const uniqueValues = [...new Set(records.map(r => r[col]).flat())].filter(v => v !== undefined);

        uniqueValues.forEach(val => {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = val;

          // Initialiser selectedTags[col] si nécessaire
          if (!selectedTags[col]) {
            selectedTags[col] = [];
          }

          if (selectedTags[col].includes(val)) {
            tag.classList.add('active');
          }

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
        select.multiple = false; // Pour les choix uniques
        select.className = 'filter-multi';

        const counts = countValues(records, col);
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([val, count], index) => {
            const option = new Option(`${val} (${count})`, val);
            select.appendChild(option);
            if (index === 0) option.selected = true; // Sélectionner le premier élément par défaut
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

    // Appliquer les filtres de tags uniquement si l'utilisateur a sélectionné quelque chose
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

    // Appliquer les filtres dynamiques uniquement si l'utilisateur a sélectionné quelque chose
    Object.keys(selectEls).forEach(col => {
      const selectEl = selectEls[col];
      if (selectEl) {
        const vals = Array.from(selectEl.selectedOptions).map(o => o.value);
        if (vals.length > 0) {
          filtered = filtered.filter(r => {
            const val = r[col];
            if (Array.isArray(val)) return val.some(v => vals.includes(v));
            return vals.includes(val);
          });
        }
      }
    });

    // Appliquer la recherche globale
    const search = globalSearch.value.toLowerCase();
    if (search) {
      filtered = filtered.filter(r =>
        Object.values(r).some(v => {
          if (!v) return false;
          if (Array.isArray(v)) return v.some(x => String(x).toLowerCase().includes(search));
          return String(v).toLowerCase().includes(search);
        })
      );
    }

    // Mettre à jour les résultats
    resultsCount.textContent = `🔢 Résultats: ${filtered.length}`;
    const ids = filtered.map(r => r.id);
    grist.setSelectedRows(ids);

    // Mettre à jour les chiffres des tags et des options
    updateDisabledOptions(filtered);

    // Sauvegarder l'état
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedTags, selectEls: serializeSelects(), visibleFilters }));
  }

    function updateDisabledOptions(filtered) {
      Object.entries(tagColumns).forEach(([col, _]) => {
        const counts = countValues(filtered, col);
        tagContainer.querySelectorAll('.tag').forEach(tag => {
          const text = tag.textContent.replace(/\s\(\d+\)$/, '');
          if (counts[text] > 0) tag.classList.remove('disabled');
          else tag.classList.add('disabled');
        });
      });
      Object.entries(selectColumns).forEach(([col, _]) => {
        const counts = countValues(filtered, col);
        Array.from(selectEls[col].options).forEach(opt => {
          if (counts[opt.value] > 0) opt.disabled = false;
          else opt.disabled = true;
        });
      });
    }

    function serializeSelects() {
      const sel = {};
      Object.entries(selectEls).forEach(([col, selEl]) => {
        sel[col] = Array.from(selEl.selectedOptions).map(o => o.value);
      });
      return sel;
    }

    

    function updateFilterVisibility() {
      const tagFilters = document.getElementById('tag-filters');
      tagFilters.style.display = visibleFilters.tags ? 'block' : 'none';

      const filterCards = document.querySelectorAll('.filter-card');
      filterCards.forEach(card => {
        const titleElement = card.querySelector('.filter-title');
        if (titleElement) {
          const titleText = titleElement.textContent;
          const col = Object.entries(selectColumns).find(([_, label]) => titleText.includes(label))?.[0];
          if (col) {
            card.style.display = visibleFilters[col] ? 'block' : 'none';
          }
        }
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedTags, selectEls: serializeSelects(), visibleFilters }));
    }

    function renderFilterCheckboxes() {
      filterCheckboxesContainer.innerHTML = '';

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
    }

    function restoreState() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        selectedTags = state.selectedTags || {}; // Initialisation si non défini
        visibleFilters = state.visibleFilters || {
          tags: true,
          ...Object.keys(selectColumns).reduce((acc, col) => ({ ...acc, [col]: true }), {}),
        };

        // Restaurer les sélections des listes déroulantes
        Object.entries(state.selectEls || {}).forEach(([col, vals]) => {
          if (selectEls[col]) {
            Array.from(selectEls[col].options).forEach(o => {
              o.selected = vals.includes(o.value);
            });
          }
        });

        // Mettre à jour la visibilité des filtres
        updateFilterVisibility();
      }
    }

    resetButton.addEventListener('click', () => {
      selectedTags = {};
      Object.values(selectEls).forEach(sel => Array.from(sel.options).forEach(o => o.selected = false));
      globalSearch.value = '';
      applyFilters();
      renderTags(allRecords);
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
      Object.keys(selectColumns).forEach(col => {
        visibleFilters[col] = true;
      });
      updateFilterVisibility();
      renderFilterCheckboxes();
    });

    deselectAllBtn.addEventListener('click', () => {
      visibleFilters.tags = false;
      Object.keys(selectColumns).forEach(col => {
        visibleFilters[col] = false;
      });
      updateFilterVisibility();
      renderFilterCheckboxes();
    });

    globalSearch.addEventListener('input', applyFilters);

    
    grist.onRecords((records) => {
      allRecords = records;
      inferColumnTypes(records); // Utiliser l'inférence si l'API ne fonctionne pas
      renderTags(records);
      renderSelects(records);
      resultsCount.textContent = `🔢 Résultats: ${allRecords.length}`;
      grist.setSelectedRows(allRecords.map(r => r.id));
      // Restaurer l'état des filtres depuis le localStorage
      restoreState();
    });
});