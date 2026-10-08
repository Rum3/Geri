const { fetchOpenSofiaListings, parseListingHrefCandidates, normalizeListingUrl, extractAreaFromText, extractPublishedAgeHours, extractAddressFromTitle } = require('../server');

describe('live listing parser', () => {
  test('does not show stale listings when the live Imot source is unavailable', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false });

    try {
      await expect(fetchOpenSofiaListings()).resolves.toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('extracts real imot.bg listing URLs from HTML', () => {
    const html = `
      <a href="//www.imot.bg/obiava-12345-something">Offer 1</a>
      <a href="//www.imot.bg/obiavi/grad-sofiya">Offer 2</a>
    `;

    expect(parseListingHrefCandidates(html, 'imot.bg')).toEqual([
      'https://www.imot.bg/obiava-12345-something',
    ]);
  });

  test('extracts real alo.bg listing URLs from HTML', () => {
    const html = `
      <a href="/apartament-40-m2-12345">Offer 1</a>
      <a href="/studio-66-m2-98765">Offer 2</a>
    `;

    expect(parseListingHrefCandidates(html, 'alo.bg')).toEqual([
      'https://www.alo.bg/apartament-40-m2-12345',
      'https://www.alo.bg/studio-66-m2-98765',
    ]);
  });

  test('extracts area size from text', () => {
    expect(extractAreaFromText('Апартамент 64 кв.м. в София')).toBe(64);
    expect(extractAreaFromText('Studio 90 m2')).toBe(90);
  });

  test('normalizes protocol-relative links', () => {
    expect(normalizeListingUrl('//www.imot.bg/obiava-10')).toBe('https://www.imot.bg/obiava-10');
  });

  test('parses age from live listing HTML and keeps only last 24h', () => {
    expect(extractPublishedAgeHours('Преди 3 часа и 20 минути')).toBe(3.33);
    expect(extractPublishedAgeHours('Преди 2 дни')).toBe(48);
    expect(extractPublishedAgeHours('Обява от днес')).toBe(0);
  });

  test('extracts a usable address from the imot.bg title text', () => {
    expect(extractAddressFromTitle('Дава под наем МАГАЗИН град София, Витоша')).toBe('град София, Витоша');
    expect(extractAddressFromTitle('Наем офис, ул. Тодор Каблешков 10, София')).toBe('ул. Тодор Каблешков 10, София');
  });

  test('prefers the real title link over duplicate image/gallery links on imot.bg cards', () => {
    const html = `
      <div class="listing-card">
        <a href="//www.imot.bg/obiava-6938-zhilishtna-sgrada-grad-sofiya-dianabad"><img src="/img1.jpg" /></a>
        <a href="//www.imot.bg/obiava-6938-zhilishtna-sgrada-grad-sofiya-dianabad"><img src="/img2.jpg" /></a>
        <a href="//www.imot.bg/obiava-6938-zhilishtna-sgrada-grad-sofiya-dianabad">Жилищна сграда град София, Дианабад</a>
      </div>
    `;

    expect(parseListingHrefCandidates(html, 'imot.bg')).toEqual([
      'https://www.imot.bg/obiava-6938-zhilishtna-sgrada-grad-sofiya-dianabad',
    ]);
  });

  test('extracts mixed listing URLs including commercial and residential entries for broader parsing', () => {
    const html = `
      <a href="//www.imot.bg/obiava-1111-prodava-ednostaen-apartament-grad-sofiya">Продава 1-стаен</a>
      <a href="//www.imot.bg/obiava-2222-naem-ofis-grad-sofiya">Наем офис</a>
      <a href="//www.imot.bg/obiava-3333-naem-targovski-pomeshtenie-grad-sofiya">Наем търговски</a>
      <a href="//www.imot.bg/obiava-4444-dava-pod-naem-kashta-grad-sofiya">Дава под наем къща</a>
    `;

    expect(parseListingHrefCandidates(html, 'imot.bg')).toEqual([
      'https://www.imot.bg/obiava-1111-prodava-ednostaen-apartament-grad-sofiya',
      'https://www.imot.bg/obiava-2222-naem-ofis-grad-sofiya',
      'https://www.imot.bg/obiava-3333-naem-targovski-pomeshtenie-grad-sofiya',
      'https://www.imot.bg/obiava-4444-dava-pod-naem-kashta-grad-sofiya',
    ]);
  });
});
