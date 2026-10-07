async function fetchRealSofiaMinimartLocations() {
  try {
    const pageResponse = await fetch('https://mini-mart.bg/nameri-magazin/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!pageResponse.ok) {
      return [];
    }

    const html = await pageResponse.text();
    const nonceMatch = html.match(/ASL_REMOTE\s*=\s*\{"ajax_url":"[^"]+","nonce":"([^"]+)"/i);
    const nonce = nonceMatch ? nonceMatch[1] : null;

    if (!nonce) {
      return [];
    }

    const ajaxUrl = new URL('https://mini-mart.bg/wp-admin/admin-ajax.php');
    ajaxUrl.search = new URLSearchParams({
      action: 'asl_load_stores',
      nonce,
      load_all: '1',
      layout: '1',
      asl_lang: '',
    }).toString();

    const ajaxResponse = await fetch(ajaxUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'application/json,text/plain,*/*;q=0.01',
      },
    });

    if (!ajaxResponse.ok) {
      return [];
    }

    const parsed = await ajaxResponse.json();
    const stores = Array.isArray(parsed) ? parsed : [];

    return stores
      .filter((store) => {
        const city = String(store?.city || '').trim();
        const street = String(store?.street || '').trim();
        return city === 'София' || /София/i.test(`${city} ${street}`);
      })
      .map((store) => {
        const street = String(store?.street || '').trim();
        const city = String(store?.city || 'София').trim() || 'София';
        const postalCode = String(store?.postal_code || '').trim();
        const address = [street, city, postalCode].filter(Boolean).join(', ');

        return {
          city: 'София',
          label: String(store?.title || 'Минимарт').trim() || 'Минимарт',
          address,
        };
      });
  } catch (error) {
    console.warn('Minimart AJAX feed unavailable:', error.message);
    return [];
  }
}

module.exports = {
  fetchRealSofiaMinimartLocations,
};
