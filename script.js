let currentOptions = [];
let allRecords = [];
let sessionID = "";
let columns = [];
let dropdowns = [];
let types = [];
const typeAND = "AND", typeOR = 'OR';

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
  dropdown.classList.remove('hiddenItem');

  let currentValue = uniqOptions.includes(dropdown.value) ? dropdown.value : undefined;
  if (currentValue === undefined && sessionID.length > 0) {
    const selection = sessionStorage.getItem(`${sessionID}_Dropdownfilter_Item${idx}`);
    if (selection?.length > 0) {
      currentValue = selection;
    }
  }

  dropdown.innerHTML = '';
  if (uniqOptions.length === 0) {
    const optionElement = document.createElement('option');
    optionElement.textContent = 'No options available';
    dropdown.appendChild(optionElement);
    grist.setSelectedRows(null);
  } else {
    uniqOptions.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = String(option);
      optionElement.textContent = String(option);
      if (String(option) === currentValue) optionElement.setAttribute('selected', '');
      dropdown.appendChild(optionElement);
    });

    selectRows();
  }
}

function selectRows() {
  const selectedValues = dropdowns.map(dropdown => dropdown.value);
  const selectedTypes = types;

  if (selectedValues.every(value => !value)) {
    grist.setSelectedRows(null);
    return;
  }

  let rows = [...allRecords];
  for (let i = 0; i < selectedValues.length; i++) {
    const value = selectedValues[i];
    if (!value) continue;

    const column = columns[i];
    if (i === 0) {
      rows = rows.filter(item => String(item[column]) === value);
    } else {
      const type = selectedTypes[i - 1];
      if (type === typeOR) {
        const newRows = allRecords.filter(item => String(item[column]) === value);
        rows = [...new Set([...rows, ...newRows])];
      } else {
        rows = rows.filter(item => String(item[column]) === value);
      }
    }
  }

  rows = rows.map(({ id }) => id);
  grist.setSelectedRows(rows);

  if (sessionID.length > 0) {
    selectedValues.forEach((value, idx) => {
      if (value) sessionStorage.setItem(`${sessionID}_Dropdownfilter_Item${idx + 1}`, value);
    });
  }
}

function addFilter() {
  const idx = dropdowns.length + 1;
  const dropdown = document.createElement('select');
  dropdown.id = `dropdown${idx}`;
  dropdown.addEventListener('change', selectRows);

  const typeDropdown = document.createElement('span');
  typeDropdown.id = `type${idx}`;
  typeDropdown.innerHTML = typeAND;
  typeDropdown.addEventListener('click', () => {
    typeDropdown.innerHTML = (typeDropdown.innerHTML === typeAND) ? typeOR : typeAND;
    selectRows();
  });

  document.getElementById('filters').appendChild(dropdown);
  document.getElementById('filters').appendChild(typeDropdown);

  dropdowns.push(dropdown);
  types.push(typeAND);
  updateDropdown([], idx);
}

function removeFilter(idx) {
  if (dropdowns.length <= 1) return;

  const dropdown = document.getElementById(`dropdown${idx}`);
  const typeElement = document.getElementById(`type${idx}`);

  dropdown.remove();
  typeElement.remove();

  dropdowns.splice(idx - 1, 1);
  types.splice(idx - 2, 1);

  selectRows();
}

function uniq(a) {
  const seen = {};
  return a.filter(item => {
    return seen.hasOwnProperty(item) ? false : (seen[item] = true);
  });
}

function initGrist() {
  grist.ready({
    columns: [
      { name: "OptionsToSelect", title: 'Options to select', type: 'Any' },
      { name: "OptionsToSelect2", title: '2nd options to select', type: 'Any', optional: true },
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
      updateDropdown([]);
      grist.setSelectedRows(null);
      return;
    }

    allRecords = records;
    columns = Object.keys(mappings).filter(key => key.startsWith('OptionsToSelect'));

    columns.forEach((column, idx) => {
      const options = records.map(record => record[column]).filter(option => option !== null && option !== undefined);
      updateDropdown(options, idx + 1);
    });

    selectRows();
  });
}

document.addEventListener('DOMContentLoaded', initGrist);