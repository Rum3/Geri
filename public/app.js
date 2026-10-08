let lastAnalysisEntries = [];
let aiConfigured = false;
const aiResults = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadAnalysis() {
  const response = await fetch('/api/imot-open-listings');
  const data = await response.json();

  document.getElementById('listingCount').textContent = data.total || 0;

  const listingsTable = document.getElementById('listingsTable');
  const listings = Array.isArray(data.listings) ? data.listings : [];

  if (listings.length === 0) {
    listingsTable.innerHTML = `
      <tr>
        <td colspan="6">Няма открити обяви според показаните филтри.</td>
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
  const response = await fetch('/api/analysis');
  const data = await response.json();
  const summary = data.summary || {};
  const entries = Array.isArray(data.listings) ? data.listings : [];
  lastAnalysisEntries = entries;

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
        <td colspan="6">Няма анализирани обяви.</td>
      </tr>
    `;
    return;
  }

  analysisTable.innerHTML = entries
    .map((listing, index) => {
      const distance = listing.distanceToNearestMinimarket ?? 0;
      const riskClass = listing.riskStatus || 'far';
      const riskText = riskClass === 'very_close' ? 'Много близо' : riskClass === 'near' ? 'Близо' : 'Далече';
      const aiCell = aiResults.has(index)
        ? renderAiResult(aiResults.get(index))
        : `<button type="button" class="secondary-action ai-btn" data-ai-index="${index}" ${aiConfigured ? '' : 'disabled'}>AI анализ</button>`;
      return `
        <tr>
          <td>${listing.address || listing.title || 'Адрес не е наличен'}</td>
          <td>${listing.area} кв.м.</td>
          <td>${distance} м</td>
          <td><span class="status-pill ${riskClass}">${riskText}</span></td>
          <td>${aiCell}</td>
          <td><a href="${listing.url}" target="_blank" rel="noreferrer">Отвори</a></td>
        </tr>
      `;
    })
    .join('');

  document.querySelectorAll('[data-ai-index]').forEach((button) => {
    button.addEventListener('click', () => analyzeListingWithAi(Number(button.dataset.aiIndex), button));
  });
}

function renderAiResult(result) {
  if (result.error) {
    return `<span class="ai-result ai-error">${escapeHtml(result.error)}</span>`;
  }
  const verdictClass = result.verdict === 'много добра' ? 'far'
    : result.verdict === 'добра' ? 'far'
    : result.verdict === 'лоша' ? 'very_close' : 'near';
  const criteriaLabels = {
    potencialni_klienti: 'Потенциални клиенти',
    konkurencia: 'Конкуренция',
    peshehoden_potok: 'Пешеходен поток',
    jilishtna_zona: 'Жилищна зона',
    dostupnost: 'Достъпност',
    vidimost: 'Видимост',
    parkirane: 'Паркиране',
    potencialen_oborot: 'Потенциален оборот',
  };
  const criteria = result.criteria || {};
  const rows = Object.keys(criteriaLabels)
    .filter((key) => criteria[key] !== null && criteria[key] !== undefined)
    .map((key) => `<li><span>${criteriaLabels[key]}</span><strong>${criteria[key]}/10</strong></li>`)
    .join('');
  return `
    <div class="ai-result">
      <span class="status-pill ${verdictClass}">${escapeHtml(result.verdict)} ${result.score}/100</span>
      ${rows ? `<ul class="ai-criteria">${rows}</ul>` : ''}
      <span class="ai-reasoning">${escapeHtml(result.reasoning)}</span>
    </div>
  `;
}

function getCustomPrompt() {
  const el = document.getElementById('aiPrompt');
  return el ? el.value.trim() : '';
}

async function analyzeListingWithAi(index, button) {
  const listing = lastAnalysisEntries[index];
  if (!listing) return;
  if (button) {
    button.disabled = true;
    button.textContent = 'Анализирам...';
  }
  try {
    const response = await fetch('/api/analyze-minimart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing, prompt: getCustomPrompt() }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'AI анализът се провали.');
    }
    aiResults.set(index, data);
  } catch (error) {
    aiResults.set(index, { error: error.message });
  }
  loadAnalysisSection();
}

async function analyzeAllWithAi() {
  if (!aiConfigured || lastAnalysisEntries.length === 0) return;
  const button = document.getElementById('analyzeAllAi');
  if (button) {
    button.disabled = true;
    button.textContent = 'Анализирам всички...';
  }
  for (let i = 0; i < lastAnalysisEntries.length; i += 1) {
    if (aiResults.has(i) && !aiResults.get(i).error) continue;
    try {
      const response = await fetch('/api/analyze-minimart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing: lastAnalysisEntries[i], prompt: getCustomPrompt() }),
      });
      const data = await response.json();
      aiResults.set(i, response.ok ? data : { error: data.error || 'Грешка' });
    } catch (error) {
      aiResults.set(i, { error: error.message });
    }
  }
  if (button) {
    button.disabled = false;
    button.textContent = 'AI анализ на всички';
  }
  loadAnalysisSection();
}

async function loadAiStatus() {
  const badge = document.getElementById('aiStatusBadge');
  const analyzeAllButton = document.getElementById('analyzeAllAi');
  const promptArea = document.getElementById('aiPrompt');
  try {
    const response = await fetch('/api/ai-status');
    if (!response.ok) {
      throw new Error(`сървърът върна ${response.status} — рестартирай го с новия код (node server.js) и отвори през http://localhost:3000`);
    }
    const data = await response.json();
    aiConfigured = Boolean(data.configured);
    if (promptArea && !promptArea.value && data.defaultPrompt) {
      promptArea.value = data.defaultPrompt;
    }
    if (badge) {
      badge.textContent = aiConfigured ? `AI: Gemini ${data.model || ''} готов` : 'AI: нужен е GEMINI_API_KEY';
      badge.classList.remove('near', 'far', 'very_close');
      badge.classList.add(aiConfigured ? 'far' : 'very_close');
    }
    if (analyzeAllButton) analyzeAllButton.disabled = !aiConfigured;
  } catch (error) {
    if (badge) badge.textContent = `AI: недостъпен (${error.message})`;
    aiConfigured = false;
  }
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
loadAiStatus();

document.getElementById('analyzeAllAi')?.addEventListener('click', analyzeAllWithAi);
