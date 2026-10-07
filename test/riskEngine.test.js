const { classifyDistance, scoreLocation } = require('../src/riskEngine');
const {
  normalizeGoogleMapsPlaceResult,
  isSofiaCommercialListingCandidate,
  collectImotListingPages,
  deriveListingCoordinates,
} = require('../server');

describe('riskEngine', () => {
  test('classifyDistance flags very close when within 100m', () => {
    expect(classifyDistance(75)).toBe('very_close');
  });

  test('classifyDistance flags near when between 100m and 200m', () => {
    expect(classifyDistance(150)).toBe('near');
  });

  test('classifyDistance flags far when beyond 200m', () => {
    expect(classifyDistance(250)).toBe('far');
  });

  test('scoreLocation returns higher risk when lots of nearby minimarkets exist', () => {
    const result = scoreLocation({
      listingCount: 6,
      nearby: 2,
      veryClose: 1,
      far: 3
    });

    expect(result.score).toBeGreaterThanOrEqual(7);
    expect(result.label).toBe('high_risk');
  });

  test('scoreLocation returns lower risk when listings are far from minimarkets', () => {
    const result = scoreLocation({
      listingCount: 3,
      nearby: 1,
      veryClose: 0,
      far: 2
    });

    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.label).toBe('low_risk');
  });

  test('normalizeGoogleMapsPlaceResult keeps Sofia addresses and labels', () => {
    const normalized = normalizeGoogleMapsPlaceResult({
      name: 'Mini Market Sofia',
      formatted_address: 'ул. Бойчо Бойчев 8, София, България'
    });

    expect(normalized).toMatchObject({
      city: 'София',
      label: 'Mini Market Sofia',
      address: 'ул. Бойчо Бойчев 8, София, България'
    });
  });

  test('isSofiaCommercialListingCandidate keeps only commercial Sofia listings in 40-100 sqm', () => {
    expect(isSofiaCommercialListingCandidate('Наем за търговски магазин в София', 'https://www.imot.bg/obiava-123-grad-sofiya', 65)).toBe(true);
    expect(isSofiaCommercialListingCandidate('Дава под наем едностаен апартамент в София', 'https://www.imot.bg/obiava-456-grad-sofiya', 65)).toBe(false);
    expect(isSofiaCommercialListingCandidate('Наем на офис в София', 'https://www.imot.bg/obiava-789-grad-sofiya', 120)).toBe(false);
  });

  test('collectImotListingPages discovers all paginated pages on a real result set', () => {
    const html = `
      <a href="https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin?kv_min=40&kv_max=100">1</a>
      <a href="https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin/p-2?kv_min=40&kv_max=100">2</a>
      <a href="https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin/p-3?kv_min=40&kv_max=100">3</a>
    `;

    const pages = collectImotListingPages(html, 'https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin?kv_min=40&kv_max=100');

    expect(pages).toEqual([
      'https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin?kv_min=40&kv_max=100',
      'https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin/p-2?kv_min=40&kv_max=100',
      'https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin/p-3?kv_min=40&kv_max=100'
    ]);
  });

  test('deriveListingCoordinates varies by district so the risk analysis does not collapse to identical values', () => {
    const vitosha = deriveListingCoordinates({ title: 'Дава под наем МАГАЗИН град София, Витоша', address: 'София, Витоша' });
    const center = deriveListingCoordinates({ title: 'Дава под наем МАГАЗИН град София, Център', address: 'София, Център' });

    expect(vitosha).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(center).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(vitosha.lat).not.toBe(center.lat);
    expect(vitosha.lng).not.toBe(center.lng);
  });
});
