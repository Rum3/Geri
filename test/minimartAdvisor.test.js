const {
  buildMinimartPrompt,
  parseGeminiVerdict,
  verdictFromScore,
  analyzeMinimartLocation,
  clearAiCache,
} = require('../src/minimartAdvisor');

describe('minimartAdvisor', () => {
  beforeEach(() => clearAiCache());

  test('buildMinimartPrompt includes listing data and custom instructions', () => {
    const prompt = buildMinimartPrompt(
      { address: 'ул. Витоша 10, София', area: 65, district: 'Център', distanceToNearestMinimarket: 350, coordinates: { lat: 42.69, lng: 23.32 } },
      'Оцени строго.'
    );

    expect(prompt).toContain('Оцени строго.');
    expect(prompt).toContain('ул. Витоша 10, София');
    expect(prompt).toContain('65 кв.м.');
    expect(prompt).toContain('350 м');
    expect(prompt).toContain('42.69, 23.32');
  });

  test('parseGeminiVerdict parses 8-criteria JSON verdict with 100-point score', () => {
    const parsed = parseGeminiVerdict(JSON.stringify({
      verdict: 'много добра',
      score: 82,
      criteria: {
        potencialni_klienti: 9,
        konkurencia: 7,
        peshehoden_potok: 8,
        jilishtna_zona: 10,
        dostupnost: 8,
        vidimost: 7,
        parkirane: 6,
        potencialen_oborot: 8,
      },
      reasoning: 'Гъст квартал с отличен трафик.',
    }));
    expect(parsed).toMatchObject({ verdict: 'много добра', score: 82 });
    expect(parsed.criteria.potencialni_klienti).toBe(9);
    expect(parsed.criteria.parkirane).toBe(6);
    expect(parsed.reasoning).toContain('Гъст квартал');
  });

  test('parseGeminiVerdict derives 100-point score from criteria when score is missing', () => {
    const parsed = parseGeminiVerdict(JSON.stringify({
      criteria: {
        potencialni_klienti: 8,
        konkurencia: 8,
        peshehoden_potok: 8,
        jilishtna_zona: 8,
        dostupnost: 8,
        vidimost: 8,
        parkirane: 8,
        potencialen_oborot: 8,
      },
      reasoning: 'Балансирана локация.',
    }));
    expect(parsed.score).toBe(80);
    expect(parsed.verdict).toBe('много добра');
  });

  test('verdictFromScore classifies 100-point scale', () => {
    expect(verdictFromScore(82)).toBe('много добра');
    expect(verdictFromScore(65)).toBe('добра');
    expect(verdictFromScore(45)).toBe('средна');
    expect(verdictFromScore(20)).toBe('лоша');
  });

  test('parseGeminiVerdict falls back gracefully on plain text', () => {
    const parsed = parseGeminiVerdict('Локацията е неподходяща, 35/100.');
    expect(parsed.verdict).toBe('лоша');
    expect(parsed.score).toBe(35);
    expect(parsed.reasoning.length).toBeGreaterThan(0);
  });

  test('analyzeMinimartLocation uses cache and injected fetch', async () => {
    const seen = [];
    const fakeFetch = async (url, options) => {
      seen.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"verdict": "добра", "score": 72, "criteria": {"potencialni_klienti": 8, "konkurencia": 7, "peshehoden_potok": 8}, "reasoning": "Добър трафик."}' }] } }],
        }),
      };
    };
    const listing = { address: 'ул. Тестова 1, София', area: 60, distanceToNearestMinimarket: 500 };

    const first = await analyzeMinimartLocation(listing, { apiKey: 'test-key', fetchImpl: fakeFetch });
    const second = await analyzeMinimartLocation(listing, { apiKey: 'test-key', fetchImpl: fakeFetch });

    expect(first).toMatchObject({ verdict: 'добра', score: 72, cached: false });
    expect(second.cached).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toContain(':generateContent');
  });

  test('analyzeMinimartLocation uses Interactions API for AQ. auth keys and parses output_text', async () => {
    const seen = [];
    const fakeFetch = async (url, options) => {
      seen.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          output_text: '{"verdict": "много добра", "score": 82, "criteria": {"potencialni_klienti": 9, "konkurencia": 7, "peshehoden_potok": 8, "jilishtna_zona": 9, "dostupnost": 8, "vidimost": 7, "parkirane": 6, "potencialen_oborot": 8}, "reasoning": "Отлична локация."}',
        }),
      };
    };
    const listing = { address: 'ул. Тестова 2, София', area: 70, distanceToNearestMinimarket: 600 };

    const result = await analyzeMinimartLocation(listing, { apiKey: 'AQ.test-key', fetchImpl: fakeFetch, useCache: false });

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(seen[0].options.headers['x-goog-api-key']).toBe('AQ.test-key');
    expect(JSON.parse(seen[0].options.body).model).toBe('gemini-3.5-flash-lite');
    expect(result).toMatchObject({ verdict: 'много добра', score: 82 });
  });

  test('callGemini retries on 503 and succeeds', async () => {
    const { callGemini } = require('../src/minimartAdvisor');
    let calls = 0;
    const fakeFetch = async () => {
      calls += 1;
      if (calls < 3) {
        return { ok: false, status: 503, text: async () => '{"error":{"message":"high demand","code":"service_unavailable"}}' };
      }
      return { ok: true, json: async () => ({ output_text: '{"verdict": "добра", "score": 70, "reasoning": "ОК."}' }) };
    };
    const text = await callGemini('тест', { apiKey: 'AQ.retry-test', fetchImpl: fakeFetch });
    expect(calls).toBe(3);
    expect(text).toContain('добра');
  });

  test('callGemini falls back to next model when first times out', async () => {
    const { callGemini } = require('../src/minimartAdvisor');
    const seen = [];
    const fakeFetch = async (url, options) => {
      const body = JSON.parse(options.body);
      seen.push(body.model);
      if (body.model === 'gemini-3.5-flash-lite') {
        const err = new Error('timeout');
        err.cause = { code: 'TIMEOUT' };
        throw err;
      }
      return { ok: true, json: async () => ({ output_text: '{"verdict": "добра", "score": 70, "reasoning": "ОК."}' }) };
    };
    const text = await callGemini('тест', { apiKey: 'AQ.fallback-test', fetchImpl: fakeFetch });
    expect(seen[0]).toBe('gemini-3.5-flash-lite');
    expect(seen.length).toBeGreaterThan(1);
    expect(text).toContain('добра');
  });

  test('analyzeMinimartLocation throws when API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeMinimartLocation({ address: 'ул. Тестова 1' }, { useCache: false }))
      .rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });
});
