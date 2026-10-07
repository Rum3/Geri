async function loadAnalysis() {
  const hoursFilter = document.getElementById('hoursFilter');
  const selectedHours = hoursFilter?.value || 'all';
  const response = await fetch(`/api/imot-open-listings?hours=${encodeURIComponent(selectedHours)}`);
  const data = await response.json();

  const lookbackHours = data.lookbackHours;
  const headingText = lookbackHours === null || lookbackHours === undefined || selectedHours === 'all'
    ? 'Отворени обяви в София без ограничение във времето'
    : `Отворени обяви в София от последните ${lookbackHours}ч`;
  document.getElementById('listingsHeading').textContent = headingText;

  const resultsMeta = document.getElementById('resultsMeta');
  if (resultsMeta) {
    resultsMeta.textContent = `Показани: ${data.total || 0} обяви от imot.bg, 40–100 кв.м.`;
  }

  const listingsTable = document.getElementById('listingsTable');
  const listings = Array.isArray(data.listings) ? data.listings : [];

  if (listings.length === 0) {
    listingsTable.innerHTML = `
      <tr>
        <td colspan="6">${(lookbackHours === null || lookbackHours === undefined || selectedHours === 'all') ? 'Няма открити обяви в София в диапазона 40–100 кв.м. без ограничение във времето.' : `Няма открити обяви в София в диапазона 40–100 кв.м. от последните ${lookbackHours} часа.`}</td>
      </tr>
    `;
    return;
  }

  listingsTable.innerHTML = listings
    .map((listing) => {
      const ageLabel = 'днес';

      return `
        <tr>
          <td>${listing.source}</td>
          <td>${listing.address}</td>
          <td>${listing.area} кв.м.</td>
          <td>${listing.district}</td>
          <td>${ageLabel}</td>
          <td><a href="${listing.url}" target="_blank" rel="noreferrer">Отвори</a></td>
        </tr>
      `;
    })
    .join('');
}

async function loadAnalysisSection() {
  const hoursFilter = document.getElementById('hoursFilter');
  const selectedHours = hoursFilter?.value || 'all';
  const response = await fetch(`/api/analysis?hours=${encodeURIComponent(selectedHours)}`);
  const data = await response.json();
  const summary = data.summary || {};
  const entries = Array.isArray(data.listings) ? data.listings : [];

  const analysisSummary = document.getElementById('analysisSummary');
  analysisSummary.innerHTML = `
    <div class="card accent">
      <span>Общо обяви</span>
      <strong>${summary.totalListings ?? 0}</strong>
    </div>
    <div class="card warning">
      <span>Много близо</span>
      <strong>${summary.veryClose ?? 0}</strong>
    </div>
    <div class="card">
      <span>Близо</span>
      <strong>${summary.near ?? 0}</strong>
    </div>
    <div class="card">
      <span>Далече</span>
      <strong>${summary.far ?? 0}</strong>
    </div>
  `;

  const analysisTable = document.getElementById('analysisTable');
  if (!entries.length) {
    analysisTable.innerHTML = `
      <tr>
        <td colspan="5">Няма анализирани обяви за избрания период.</td>
      </tr>
    `;
    return;
  }

  analysisTable.innerHTML = entries
    .map((listing) => {
      const distance = listing.distanceToNearestMinimarket ?? 0;
      const riskClass = listing.riskStatus || 'far';
      const riskText = riskClass === 'very_close' ? 'Много близо' : riskClass === 'near' ? 'Близо' : 'Далече';
      return `
        <tr>
          <td>${listing.address || listing.title || 'Адрес не е наличен'}</td>
          <td>${listing.area} кв.м.</td>
          <td>${distance} м</td>
          <td><span class="status-pill ${riskClass}">${riskText}</span></td>
          <td><a href="${listing.url}" target="_blank" rel="noreferrer">Отвори</a></td>
        </tr>
      `;
    })
    .join('');
}

const hoursFilter = document.getElementById('hoursFilter');
if (hoursFilter) {
  hoursFilter.addEventListener('change', () => {
    loadAnalysis();
    loadAnalysisSection();
  });
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${tabName}View`);
  });
}

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

async function loadMinimarts() {
  const list = document.getElementById('minimartList');
  if (!list) return;

  const response = await fetch('/api/minimarkets');
  const data = await response.json();
  const items = Array.isArray(data.locations) ? data.locations : [];

  const heading = document.querySelector('#minimartView h2');
  if (heading) {
    heading.textContent = `Адреси на Минимарт в София (${items.length})`;
  }

  list.innerHTML = items.map((item) => `
    <li>
      <strong>${item.label || item.city || 'Минимарт'}</strong>
      <span>${item.address}</span>
    </li>
  `).join('');
}

loadAnalysis();
loadAnalysisSection();
loadMinimarts();
