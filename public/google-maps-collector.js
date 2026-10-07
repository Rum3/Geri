(() => {
  const MAX_SCROLLS = 20;
  const PAUSE_MS = 900;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isLikelyAddress(text) {
    const t = normalizeText(text);
    if (!t || t.length < 12) return false;
    return /(?:ул\.|улица|бул\.|булевард|гр\.|кв\.|ж\.к\.|№|,\s*София|София)/i.test(t)
      || /(?:street|street\.|blvd|boulevard|sofia|city|district)/i.test(t);
  }

  function cleanCandidate(text) {
    let t = normalizeText(text)
      .replace(/^(?:Minimart|Минимарт)\s*[-–:]*\s*/i, '')
      .replace(/\s*\|\s*.*$/, '')
      .replace(/\s*—\s*.*$/, '')
      .replace(/\s*\(.*?\)\s*$/, '')
      .replace(/\s*•\s*.*$/, '')
      .replace(/\s+\d{1,2}:\d{2}\s*ч\.?\s*.*$/, '')
      .replace(/\s+Отваря.*$/, '')
      .replace(/\s+Затваря.*$/, '')
      .trim();

    if (!isLikelyAddress(t)) return null;
    t = t.replace(/^\W+|\W+$/g, '');
    return t || null;
  }

  function extractFromNode(node) {
    if (!node) return [];
    const parts = new Set();

    const text = normalizeText(node.innerText || node.textContent || '');
    if (isLikelyAddress(text)) {
      const cleaned = cleanCandidate(text);
      if (cleaned) parts.add(cleaned);
    }

    const descendants = node.querySelectorAll('*');
    for (const el of descendants) {
      const value = normalizeText(el.textContent || '');
      if (!value || value.length < 12) continue;
      const cleaned = cleanCandidate(value);
      if (cleaned) parts.add(cleaned);
    }

    return [...parts];
  }

  function findCandidateContainers() {
    const selectors = [
      'article',
      '[role="article"]',
      'div[role="listitem"]',
      '.section-result',
      '[data-result-id]',
      '[jsaction*="place-card"]',
      '[aria-label*="Резултати"]',
      'div[data-index]',
    ];

    const nodes = new Set();
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (el && (el.offsetParent !== null || el.getClientRects().length > 0)) {
          nodes.add(el);
        }
      }
    }

    return [...nodes];
  }

  async function collectVisibleAddresses({ scroll = true, maxScrolls = MAX_SCROLLS } = {}) {
    const seen = new Set();
    const results = [];

    async function gatherOnce() {
      const containers = findCandidateContainers();
      for (const container of containers) {
        const list = extractFromNode(container);
        for (const address of list) {
          if (!seen.has(address)) {
            seen.add(address);
            results.push(address);
          }
        }
      }
      return results.length;
    }

    await gatherOnce();

    if (scroll) {
      for (let i = 0; i < maxScrolls; i++) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
        await wait(PAUSE_MS);
        await gatherOnce();

        const bottomReached = window.innerHeight + window.scrollY >= document.body.scrollHeight - 400;
        if (bottomReached) break;
      }
    }

    const unique = [...new Set(results)].sort((a, b) => a.localeCompare(b, 'bg'));
    return {
      total: unique.length,
      addresses: unique,
      json: JSON.stringify(unique, null, 2),
    };
  }

  async function exportAddresses() {
    const data = await collectVisibleAddresses();
    const blob = new Blob([data.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minimart-sofia-addresses.json';
    a.click();
    URL.revokeObjectURL(url);
    return data;
  }

  function printAddresses() {
    return collectVisibleAddresses().then((data) => {
      console.log('FOUND', data.total, 'addresses');
      console.log(data.addresses);
      return data;
    });
  }

  window.MinimartGoogleCollector = {
    collectVisibleAddresses,
    exportAddresses,
    printAddresses,
  };

  console.log('Google Maps collector ready. Run: MinimartGoogleCollector.printAddresses() or MinimartGoogleCollector.exportAddresses()');
})();
