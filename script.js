let allRecords = [];
let sessionID = "";
let columns = [];
let dropdowns = [];

function showError(msg) {
  const el = document.getElementById('error');
  if (!msg) {
    el.style.display = 'none';
  } else {
    el.innerHTML = msg;
    el.style.display = 'block';
  }
}

function updateDropdown(options, idx) {
  const uniqOptions = [""].concat(uniq(options).sort());
  const dropdown = document.getElementById(`dropdown${idx}`);

  let currentValue = uniqOptions.includes(dropdown.value) ? dropdown.value : undefined;
  if (currentValue === undefined && sessionID.length > 0) {
    const selection = sessionStorage.getItem(`${sessionID}_Dropdown_Item${idx}`);
    if (selection?.length > 0) {
      currentValue = selection;
    }
  }

  dropdown.innerHTML = '';
  if (uniqOptions.length === 0) {
    const optionElement = document.createElement('option');
    optionElement.textContent = 'Aucune option disponible';
    dropdown.appendChild(optionElement);
  } else {
    uniqOptions.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = String(option);
      optionElement.textContent = String(option);
      if (String(option) === currentValue) optionElement.setAttribute('selected', '');
      dropdown.appendChild(optionElement);
    });
  }
}

function selectRows() {
  const selectedValues = dropdowns.map(dropdown => dropdown.value);
  const selectedColumns = dropdowns.map((_, idx) => columns[idx]);

  if (selectedValues.every(value => !value)) {
    grist.setSelectedRows(null);
    return;
  }

  let rows = [...allRecords];
  selectedValues.forEach((value, idx) => {
    if (value) {
      const column = selectedColumns[idx];
      rows = rows.filter(item => String(item[column]) === value);
    }
  });

  rows = rows.map(({ id }) => id);
  grist.setSelectedRows(rows);

  if (sessionID.length > 0) {
    selectedValues.forEach((value, idx) => {
      if (value) sessionStorage.setItem(`${sessionID}_Dropdown_Item${idx + 1}`, value);
    });
  }
}

function addDropdown() {
  const idx = dropdowns.length + 1;

  const dropdownGroup = document.createElement('div');
  dropdownGroup.className = 'dropdown-group';

  const dropdown = document.createElement('select');
  dropdown.id = `dropdown${idx}`;
  dropdown.className = 'dropdown';
  dropdown.addEventListener('change', selectRows);

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-dropdown';
  removeButton.innerHTML = '×';
  removeButton.onclick = () => removeDropdown(idx);

  dropdownGroup.appendChild(dropdown);
  dropdownGroup.appendChild(removeButton);

  document.getElementById('dropdowns').appendChild(dropdownGroup);

  dropdowns.push(dropdown);

  if (columns.length >= idx) {
    const options = allRecords.map(record => record[columns[idx - 1]]).filter(option => option !== null && option !== undefined);
    updateDropdown(options, idx);
  }
}

function removeDropdown(idx) {
  if (dropdowns.length <= 1) {
    showError("Il doit y avoir au moins un menu déroulant.");
    return;
  }

  const dropdownGroup = document.querySelectorAll('.dropdown-group')[idx - 1];
  dropdownGroup.remove();

  dropdowns.splice(idx - 1, 1);
  selectRows();
}

function clearsearch() {
  dropdowns.forEach(dropdown => {
    dropdown.value = "";
  });
  selectRows();
}

function uniq(a) {
  const seen = {};
  return a.filter(item => {
    return seen.hasOwnProperty(item) ? false : (seen[item] = true);
  });
}

function saveOption() {
  const sid = document.getElementById("sessionid").value;
  grist.widgetApi.setOption('sessionid', sid);
}

function initGrist() {
  grist.ready({
    columns: [
      { name: "OptionsToSelect", title: 'Options à sélectionner', type: 'Any' },
      { name: "OptionsToSelect2", title: 'Deuxième option', type: 'Any', optional: true },
      // Ajoutez d'autres colonnes ici si nécessaire
    ],
    requiredAccess: 'read table',
    allowSelectBy: true,
    onEditOptions() {
      document.getElementById("container").style.display = 'none';
      document.getElementById("config").style.display = '';
      document.getElementById("sessionid").value = sessionID;
    },
  });

  grist.onOptions((customOptions) => {
    sessionID = customOptions.sessionid || "";
    document.getElementById("container").style.display = '';
    document.getElementById("config").style.display = 'none';
  });

  grist.onRecords((records, mappings) => {
    if (!records || records.length === 0) {
      showError("Aucun enregistrement reçu.");
      return;
    }

    allRecords = records;
    columns = Object.keys(mappings).filter(key => key.startsWith('OptionsToSelect'));

    if (dropdowns.length === 0) {
      addDropdown();
    }

    dropdowns.forEach((dropdown, idx) => {
      if (columns.length > idx) {
        const options = records.map(record => record[columns[idx]]).filter(option => option !== null && option !== undefined);
        updateDropdown(options, idx + 1);
      }
    });

    selectRows();
  });
}

document.addEventListener('DOMContentLoaded', initGrist);
