// widget-live.js

// ================= GLOBAL =================
const root = document.getElementById("widget-root");
const resultsDiv = document.getElementById("results");
const searchInput = document.getElementById("search-input");
const licenceFilter = document.getElementById("licence-filter");
const gratuitFilter = document.getElementById("gratuit-filter");
const etatFilter = document.getElementById("etat-filter");

let allRecords = [];
let filteredRecords = [];

// ================= HELPERS =================
function getValue(record, field) {
  return record?.fields?.[field] ?? null;
}

function createBadge(text, colorClass) {
  const span = document.createElement("span");
  span.textContent = text;
  span.className = `badge ${colorClass}`;
  return span;
}

function getLicenceColor(type) {
  const map = {
    '🔓Open Source': 'bg-green',
    '🔒Code non ouvert': 'bg-yellow',
    '🔓Logiciel Libre': 'bg-cyan',
    '🔐Logiciel Propriétaire': 'bg-orange'
  };
  return map[type] || 'bg-red';
}

function getGratuiteColor(type) {
  const map = {
    '💊Partiellement': 'bg-yellow',
    '🆓Gratuit': 'bg-green',
    '💶Payant': 'bg-red'
  };
  return map[type] || 'bg-red';
}

function getEtatColor(type) {
  const map = {
    '❗À faire': 'bg-red',
    '🟠En cours': 'bg-yellow',
    '✅Fini': 'bg-green'
  };
  return map[type] || 'bg-red';
}

// ================= POPULATE FILTERS =================
function populateFilters(records) {
  // Vider les filtres sauf la première option
  [licenceFilter, gratuitFilter, etatFilter].forEach(sel => {
    while(sel.options.length > 1) sel.remove(1);
  });

  // Récupérer les valeurs uniques, avec fallback "N/A"
  const licences = [...new Set(records.map(r => getValue(r,"Licence") || "N/A"))];
  const gratuits = [...new Set(records.map(r => getValue(r,"Gratuit") || "N/A"))];
  const etats = [...new Set(records.map(r => getValue(r,"Etat_completion") || "N/A"))];

  licences.forEach(v => licenceFilter.add(new Option(v,v)));
  gratuits.forEach(v => gratuitFilter.add(new Option(v,v)));
  etats.forEach(v => etatFilter.add(new Option(v,v)));
}

// ================= DISPLAY =================
function displayResults(records) {
  resultsDiv.innerHTML = "";

  if(!records.length){
    resultsDiv.innerHTML = "<p>Aucun résultat</p>";
    return;
  }

  records.forEach(r => {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = getValue(r,"Nom_du_logiciel") || "Sans nom";

    const licenceBadge = createBadge(getValue(r,"Licence")||"N/A", getLicenceColor(getValue(r,"Licence")));
    const gratuitBadge = createBadge(getValue(r,"Gratuit")||"N/A", getGratuiteColor(getValue(r,"Gratuit")));
    const etatBadge = createBadge(getValue(r,"Etat_completion")||"N/A", getEtatColor(getValue(r,"Etat_completion")));

    card.appendChild(title);
    card.appendChild(licenceBadge);
    card.appendChild(gratuitBadge);
    card.appendChild(etatBadge);

    resultsDiv.appendChild(card);
  });
}

// ================= APPLY FILTERS =================
function applyFilters() {
  filteredRecords = allRecords.filter(r => {
    const textMatch = (getValue(r,"Nom_du_logiciel")||"").toLowerCase().includes(searchInput.value.toLowerCase());
    const licenceMatch = !licenceFilter.value || getValue(r,"Licence") === licenceFilter.value;
    const gratuitMatch = !gratuitFilter.value || getValue(r,"Gratuit") === gratuitFilter.value;
    const etatMatch = !etatFilter.value || getValue(r,"Etat_completion") === etatFilter.value;

    return textMatch && licenceMatch && gratuitMatch && etatMatch;
  });

  displayResults(filteredRecords);
}

// ================= EVENT LISTENERS =================
searchInput.addEventListener("input", applyFilters);
licenceFilter.addEventListener("change", applyFilters);
gratuitFilter.addEventListener("change", applyFilters);
etatFilter.addEventListener("change", applyFilters);

// ================= INIT GRIST =================
const gristApi = window.parent?.grist;

if(!gristApi){
  resultsDiv.innerHTML="⚠️ Grist non détecté";
}else{
  gristApi.on("records", data => {
    const records = data.records || [];
    allRecords = records;
    populateFilters(records);
    applyFilters();
  });
}