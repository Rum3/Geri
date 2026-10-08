const DEFAULT_MINIMART_PROMPT = `Ти си експерт по локации за търговия на дребно в София, България.
Оцени дали даденото помещение е добро място за минимаркет от веригата "Минимарт".

СЛОЙ 1 - ИНФОРМАЦИЯ ЗА МЯСТОТО (използвай подадените данни + собствените си знания за квартала):
- координати / адрес;
- население в радиус 300–1000 м;
- конкуриращи магазини;
- пешеходен трафик (ако има достъпни данни);
- спирки на градски транспорт;
- училища;
- офиси;
- жилищни сгради;
- паркинг;
- големи магазини;
- ресторанти / кафенета;
- видимост и достъп.

СЛОЙ 2 - AI АНАЛИЗ
Оцени тази локация за минимаркет по следната методология. Оцени всеки критерий от 1 до 10:
1. Потенциални клиенти - гъстота на населението и пешеходен поток в радиус 300-1000 м.
2. Конкуренция - близки хранителни магазини и други минимаркети (по-малко конкуренция = по-висока оценка; разстояние под 200 м до друг Минимарт е сериозен минус).
3. Пешеходен поток - спирки, училища, офиси, естествени пешеходни маршрути.
4. Жилищна зона - близост до гъсто населени жилищни сгради.
5. Достъпност - лесен достъп пеша, видимост от улицата, вход на партер.
6. Видимост - витрина към оживена улица, ъглово помещение е плюс.
7. Паркиране - наличие на паркинг или възможност за кратко спиране.
8. Потенциален оборот - обща преценка за търговски потенциал, площ 40-100 кв.м е идеална.

Изчисли обща оценка = сума на 8-те критерия x 1.25 (максимум 100 точки).
Класифицирай: 80-100 = МНОГО ДОБРА ЛОКАЦИЯ, 60-79 = ДОБРА ЛОКАЦИЯ, 40-59 = СРЕДНА ЛОКАЦИЯ, под 40 = ЛОША ЛОКАЦИЯ.

Върни отговор САМО в следния JSON формат, без друг текст:
{"verdict": "много добра" | "добра" | "средна" | "лоша", "score": 0-100, "criteria": {"potencialni_klienti": 1-10, "konkurencia": 1-10, "peshehoden_potok": 1-10, "jilishtna_zona": 1-10, "dostupnost": 1-10, "vidimost": 1-10, "parkirane": 1-10, "potencialen_oborot": 1-10}, "reasoning": "кратко обяснение на български до 3 изречения"}`;

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 60000;
const aiCache = new Map();

function cacheKey(listing) {
  const address = String(listing?.address || listing?.title || '').trim().toLowerCase();
  const area = Number(listing?.area || 0);
  const distance = Number(listing?.distanceToNearestMinimarket ?? listing?.distance ?? 0);
  return `${address}|${area}|${distance}`;
}

function buildMinimartPrompt(listing, customPrompt) {
  const base = String(customPrompt || '').trim() || DEFAULT_MINIMART_PROMPT;
  const address = listing?.address || listing?.title || 'неизвестен адрес';
  const area = listing?.area ? `${listing.area} кв.м.` : 'неизвестна площ';
  const district = listing?.district || 'София';
  const distance = listing?.distanceToNearestMinimarket ?? listing?.distance ?? 'неизвестно';
  const coords = listing?.coordinates
    ? `${listing.coordinates.lat}, ${listing.coordinates.lng}`
    : 'неизвестни';
  const url = listing?.url || '';

  return `${base}

Данни за помещението (Слой 1):
- Адрес: ${address}
- Квартал: ${district}
- Координати (приблизителни): ${coords}
- Площ: ${area}
- Разстояние до най-близък Минимарт: ${distance} м
- Линк към обявата: ${url}`;
}

const CRITERIA_LABELS = {
  potencialni_klienti: 'Потенциални клиенти',
  konkurencia: 'Конкуренция',
  peshehoden_potok: 'Пешеходен поток',
  jilishtna_zona: 'Жилищна зона',
  dostupnost: 'Достъпност',
  vidimost: 'Видимост',
  parkirane: 'Паркиране',
  potencialen_oborot: 'Потенциален оборот',
};

function normalizeVerdict(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('много добр')) return 'много добра';
  if (v.includes('добр') && !v.includes('не')) return 'добра';
  if (v.includes('лош') || v.includes('неподходящ')) return 'лоша';
  return 'средна';
}

function normalizeCriteria(raw) {
  const criteria = {};
  for (const key of Object.keys(CRITERIA_LABELS)) {
    const num = Number(raw?.[key]);
    criteria[key] = Number.isFinite(num) ? Math.min(10, Math.max(1, Math.round(num))) : null;
  }
  return criteria;
}

function verdictFromScore(score) {
  if (score >= 80) return 'много добра';
  if (score >= 60) return 'добра';
  if (score >= 40) return 'средна';
  return 'лоша';
}

function parseGeminiVerdict(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return { verdict: 'средна', score: 50, criteria: normalizeCriteria({}), reasoning: 'AI моделът не върна отговор.' };
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : raw;

  try {
    const parsed = JSON.parse(candidate);
    const hasScore = Number.isFinite(Number(parsed.score));
    const criteria = normalizeCriteria(parsed.criteria);
    const criteriaValues = Object.values(criteria).filter((v) => v !== null);
    let score;
    if (hasScore) {
      score = Math.min(100, Math.max(0, Math.round(Number(parsed.score))));
    } else if (criteriaValues.length === Object.keys(CRITERIA_LABELS).length) {
      score = Math.min(100, Math.max(0, Math.round(criteriaValues.reduce((a, b) => a + b, 0) * 1.25)));
    } else {
      score = 50;
    }
    const verdict = parsed.verdict ? normalizeVerdict(parsed.verdict) : verdictFromScore(score);
    const reasoning = String(parsed.reasoning || parsed.reason || 'Няма обяснение.').slice(0, 600);
    return { verdict, score, criteria, reasoning };
  } catch (e) {
    const lower = raw.toLowerCase();
    const isBad = lower.includes('лош') || lower.includes('неподходящ') || lower.includes('не е добр');
    const isVeryGood = lower.includes('много добр');
    const isGood = lower.includes('добр');
    const verdict = isBad ? 'лоша' : isVeryGood ? 'много добра' : isGood ? 'добра' : 'средна';
    const scoreMatch = raw.match(/(\d{1,3})\s*\/\s*100/);
    const score = scoreMatch ? Math.min(100, Math.max(0, Number(scoreMatch[1]))) : 50;
    return { verdict, score, criteria: normalizeCriteria({}), reasoning: raw.slice(0, 600) };
  }
}

function extractInteractionText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }
  const outputText = payload?.outputText;
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText;
  }
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const chunks = [];
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? step.content : [];
    for (const item of content) {
      if (typeof item?.text === 'string' && item.text.trim()) {
        chunks.push(item.text);
      }
    }
    if (typeof step?.text === 'string' && step.text.trim()) {
      chunks.push(step.text);
    }
  }
  // Legacy generateContent shape (AIza keys).
  const legacy = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (legacy.trim()) chunks.push(legacy);
  return chunks.join('\n').trim();
}

async function callGemini(promptText, { apiKey, model, fetchImpl } = {}) {
  const key = String(apiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    const error = new Error('GEMINI_API_KEY is not configured');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const httpFetch = fetchImpl || fetch;
  const isAuthKey = key.startsWith('AQ.');
  const modelsToTry = [model || GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(
    (m, i, arr) => m && arr.indexOf(m) === i
  );

  let lastError = null;
  for (const usedModel of modelsToTry) {
    const headers = { 'Content-Type': 'application/json' };
    let url;
    let body;
    if (isAuthKey) {
      // New Interactions API: auth (AQ.) keys use x-goog-api-key header, no ?key= param.
      url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
      headers['x-goog-api-key'] = key;
      body = JSON.stringify({ model: usedModel, input: promptText });
    } else {
      // Legacy generateContent (AIza keys).
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(usedModel)}:generateContent?key=${encodeURIComponent(key)}`;
      body = JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
      });
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let response;
      try {
        response = await httpFetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) });
      } catch (fetchError) {
        lastError = new Error(
          `Моделът ${usedModel} не отговори за ${GEMINI_TIMEOUT_MS / 1000} сек (${fetchError?.cause?.code || fetchError?.message || 'fetch failed'}). Пробвам по-лек/резервен модел...`
        );
        lastError.code = 'GEMINI_NETWORK_ERROR';
        lastError.cause = fetchError;
        break; // timeout -> try next model, don't retry same slow one
      }

      if (response.ok) {
        const payload = await response.json();
        const text = extractInteractionText(payload);
        if (!text) {
          lastError = new Error(`Моделът ${usedModel} върна празен отговор. Пробвам резервен модел...`);
          lastError.code = 'GEMINI_EMPTY_RESPONSE';
          break;
        }
        // stash which model actually answered
        callGemini.lastModel = usedModel;
        return text;
      }

      const detail = await response.text().catch(() => '');
      const retryable = response.status === 429 || response.status === 503 || (response.status >= 500 && response.status < 600);
      lastError = new Error(`Gemini API грешка (${usedModel}): ${response.status} ${detail.slice(0, 200)}`);
      lastError.code = 'GEMINI_API_ERROR';
      lastError.status = response.status;

      if (retryable && attempt < 2) {
        const waitMs = attempt * 2000;
        console.warn(`Gemini ${usedModel} ${response.status} (опит ${attempt}/2) — чакам ${waitMs / 1000} сек и повтарям...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      break; // non-retryable or attempts exhausted -> try next model
    }
    console.warn(`Модел ${usedModel} неуспешен (${lastError?.message || 'грешка'}) — пробвам следващ...`);
  }

  throw lastError || new Error('Gemini API грешка: всички модели неуспешни.');
}

async function analyzeMinimartLocation(listing, { customPrompt, apiKey, model, fetchImpl, useCache = true } = {}) {
  const key = cacheKey(listing);
  if (useCache && aiCache.has(key)) {
    return { ...aiCache.get(key), cached: true };
  }

  const promptText = buildMinimartPrompt(listing, customPrompt);
  const rawText = await callGemini(promptText, { apiKey, model, fetchImpl });
  const parsed = parseGeminiVerdict(rawText);

  const result = {
    verdict: parsed.verdict,
    score: parsed.score,
    criteria: parsed.criteria,
    reasoning: parsed.reasoning,
    model: callGemini.lastModel || model || GEMINI_MODEL,
    cached: false,
  };

  if (useCache) {
    aiCache.set(key, result);
    if (aiCache.size > 200) {
      const firstKey = aiCache.keys().next().value;
      aiCache.delete(firstKey);
    }
  }

  return result;
}

function clearAiCache() {
  aiCache.clear();
}

module.exports = {
  DEFAULT_MINIMART_PROMPT,
  GEMINI_MODEL,
  GEMINI_FALLBACK_MODELS,
  GEMINI_TIMEOUT_MS,
  CRITERIA_LABELS,
  buildMinimartPrompt,
  parseGeminiVerdict,
  verdictFromScore,
  callGemini,
  analyzeMinimartLocation,
  clearAiCache,
};
