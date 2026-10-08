try {
  require('dotenv').config();
} catch (e) {
  try {
    const fs = require('fs');
    const envPath = require('path').join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    }
  } catch (fallbackError) {
    console.warn('Could not load .env file:', fallbackError.message);
  }
}
const express = require('express');
const path = require('path');
const { TextDecoder } = require('util');
const { classifyDistance, scoreLocation } = require('./src/riskEngine');
const { fetchRealSofiaMinimartLocations } = require('./src/minimartSource');
const { DEFAULT_MINIMART_PROMPT, analyzeMinimartLocation } = require('./src/minimartAdvisor');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

const minimarkets = [
  { id: 'mm-1', name: 'Mini Market Mladost', district: 'Mladost', coordinates: { lat: 42.649, lng: 23.392 } },
  { id: 'mm-2', name: 'Mini Market Studentski', district: 'Studentski', coordinates: { lat: 42.68, lng: 23.323 } },
  { id: 'mm-3', name: 'Mini Market Vitosha', district: 'Vitosha', coordinates: { lat: 42.671, lng: 23.306 } },
  { id: 'mm-4', name: 'Mini Market Oborishte', district: 'Center', coordinates: { lat: 42.699, lng: 23.323 } },
  { id: 'mm-5', name: 'Mini Market Lozenets', district: 'Lozenets', coordinates: { lat: 42.653, lng: 23.300 } },
  { id: 'mm-6', name: 'Mini Market Nadezhda', district: 'Nadezhda', coordinates: { lat: 42.706, lng: 23.287 } },
  { id: 'mm-7', name: 'Mini Market Druzhba', district: 'Druzhba', coordinates: { lat: 42.737, lng: 23.323 } },
];

const verifiedMinimartLocations = [
  { city: 'София', label: 'Минимарт', address: 'улица „Ярослав Вешин“ 41, София, 1408' },
  { city: 'София', label: 'Минимарт', address: 'булевард „Цар Борис III“ 7, София, 1612' },
  { city: 'София', label: 'Минимарт', address: 'бул. „Витоша“ 99, София, 1408' },
  { city: 'София', label: 'Минимарт', address: 'ул. проф. Христо Вакарелски 11, София, 1700' },
  { city: 'София', label: 'Минимарт', address: 'улица „Вишнева“ 12, 1164 София' },
  { city: 'София', label: 'Минимарт', address: 'Бул. Патриарх Евтимий 61, София' },
  { city: 'София', label: 'Минимарт', address: 'бул. Княз Александър Дондуков 53, София' },
  { city: 'София', label: 'Минимарт', address: 'ул. Алабин 1 / TELLUS Tower, София' },
  { city: 'София', label: 'Минимарт', address: 'бул. „Стефан Стамболов“ 37, 1303 София' },
  { city: 'София', label: 'Минимарт', address: 'ул. „Зографски манастир“ 15, 1309 ж.к. Илинден, София' },
  { city: 'София', label: 'Минимарт', address: 'ул. Бачо Киро 4, София' },
  { city: 'София', label: 'Минимарт', address: 'ул. Димитър Петков 64, 1309 Света Троица, София' },
  { city: 'София', label: 'Минимарт', address: 'ул. „Георги С. Раковски“ 29, 1000 София' },
  { city: 'София', label: 'Минимарт', address: 'ул. „Кумановски бой“ 12, 1229 ж.к. Надежда 3, София' },
  { city: 'София', label: 'Минимарт', address: 'ул. Александър С. Пушкин 34, 1618 Павлово, София' },
  { city: 'София', label: 'Минимарт', address: 'ул. Нишава 107, 1408 ж.к. Стрелбище, София' },
  { city: 'София', label: 'Минимарт', address: 'бул. Ал. Стамболийски 125, София' },
  { city: 'София', label: 'Минимарт', address: 'ж.к. Младост 1 А, ул. Кръстьо Раковски 564, София' },
  { city: 'София', label: 'Минимарт', address: 'ул. Поп Харитон 1, кв. Редута, София, 1505' },
  { city: 'София', label: 'Минимарт', address: 'ул. Георги Райчев 21, София' },
  { city: 'София', label: 'Минимарт', address: 'Оборище, ул. „Марагидик“ 10, София, 1505' },
  { city: 'София', label: 'Минимарт', address: 'гр. София, кв. Овча Купел 2, бл. 49' },
  { city: 'София', label: 'Минимарт', address: 'гр. София, ул. Брегалница № 91' },
  { city: 'София', label: 'Минимарт', address: 'ул. Бадемова Гора № 22, София' },
  { city: 'София', label: 'Минимарт', address: 'гр. София, ул. Елемаг 22' },
  { city: 'София', label: 'Минимарт', address: 'гр. София, бул. Ал. Стамболийски 101, ет. 5' },
  { city: 'София', label: 'Минимарт', address: 'гр. София, ул. „Флора“ 6' },
];

async function fetchPublicMinimartLocations() {
  try {
    const response = await fetch('https://mini-mart.bg/nameri-magazin/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return verifiedMinimartLocations;
    }

    const html = await response.text();
    const matches = [...new Set(
      [...html.matchAll(/[А-Яа-яA-Za-z0-9„“\"'\- ]{6,140}(?:ул\.|улица|бул\.|булевард|гр\. София|кв\.|ж\.к\.|град София|квартал)[^<]{0,80}/gi)]
        .map((match) => match[0].replace(/\s+/g, ' ').trim())
        .filter((entry) => /София|улица|бул|кв\.|ж\.к\.|гр\./i.test(entry) && entry.length > 10)
    )];

    if (matches.length > 0) {
      return matches.map((address) => ({ city: 'София', label: 'Минимарт', address }));
    }
  } catch (error) {
    console.warn('Public Minimart source unavailable, using verified list:', error.message);
  }

  return verifiedMinimartLocations;
}

function normalizeGoogleMapsPlaceResult(place) {
  const name = String(place?.name || 'Минимарт').trim();
  const address = String(place?.formatted_address || place?.vicinity || '').replace(/\s+/g, ' ').trim();

  if (!address || (!/София|Sofia|SOFIA/i.test(address) && !/София|Sofia|SOFIA/i.test(name))) {
    return null;
  }

  return {
    city: 'София',
    label: name || 'Минимарт',
    address,
  };
}

async function fetchGoogleMapsMinimartLocations() {
  if (!GOOGLE_MAPS_API_KEY) {
    return verifiedMinimartLocations;
  }

  const queries = [
    'Mini Market Sofia',
    'Mini Mart Sofia',
    'Минимарт София',
    'Mini Market Bulgaria Sofia',
  ];
  const uniqueLocations = new Map();

  for (const query of queries) {
    let nextPageToken = null;
    let page = 0;

    while (page < 3) {
      const params = new URLSearchParams({
        query,
        key: GOOGLE_MAPS_API_KEY,
        region: 'bg',
        language: 'bg',
        type: 'grocery_or_supermarket',
      });

      if (nextPageToken) {
        params.set('pagetoken', nextPageToken);
      }

      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        break;
      }

      const payload = await response.json();
      const results = Array.isArray(payload?.results) ? payload.results : [];

      for (const place of results) {
        const normalized = normalizeGoogleMapsPlaceResult(place);
        if (!normalized) continue;
        if (!uniqueLocations.has(normalized.address)) {
          uniqueLocations.set(normalized.address, normalized);
        }
      }

      if (!payload.next_page_token) {
        break;
      }

      nextPageToken = payload.next_page_token;
      page += 1;
      await new Promise((resolve) => setTimeout(resolve, 2200));
    }
  }

  if (uniqueLocations.size > 0) {
    return [...uniqueLocations.values()];
  }

  return verifiedMinimartLocations;
}

async function fetchMinimartLocations() {
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const locations = await fetchGoogleMapsMinimartLocations();
      if (locations.length > 0) {
        return { source: 'google-maps-api', locations };
      }
    } catch (error) {
      console.warn('Google Maps API failed, falling back to public source:', error.message);
    }
  }

  const locations = await fetchPublicMinimartLocations();
  return { source: 'mini-mart.bg', locations };
}

const sourceHomepages = {
  'imot.bg': 'https://www.imot.bg/',
  'alo.bg': 'https://www.alo.bg/',
};

function collectImotListingPages(html, pageUrl) {
  const seen = new Set();
  const urls = [];

  if (pageUrl) {
    seen.add(pageUrl);
    urls.push(pageUrl);
  }

  const matches = [...String(html || '').matchAll(/href=["']([^"']+)['"]/gi)];
  for (const match of matches) {
    const raw = match[1];
    if (!raw) continue;

    const normalized = normalizeListingUrl(raw, 'imot.bg');
    if (!/\/obiavi\/naemi\/grad-sofiya\/magazin(?:\/p-\d+)?\??/i.test(normalized)) continue;
    const url = normalized.split('#')[0];
    const resolved = url.includes('?') ? url : `${url}?kv_min=40&kv_max=100`;
    if (!seen.has(resolved)) {
      seen.add(resolved);
      urls.push(resolved);
    }
  }

  return urls
    .map((url) => url.replace(/&amp;/g, '&'))
    .filter((url) => /\/obiavi\/naemi\/grad-sofiya\/magazin/i.test(url))
    .sort((a, b) => {
      const pageA = Number(String(a).match(/\/p-(\d+)/i)?.[1] || '1');
      const pageB = Number(String(b).match(/\/p-(\d+)/i)?.[1] || '1');
      return pageA - pageB;
    });
}

function extractCommercialListingsFromBrowserHtml(html) {
  if (!html) return [];

  const listingMap = new Map();
  const matches = [...html.matchAll(/href=["']([^"']*obiava[^"']*)["']/gi)];

  for (const match of matches) {
    const href = normalizeListingUrl(match[1], 'imot.bg').split('#')[0];
    if (!/\/obiava-/.test(href) || listingMap.has(href)) continue;

    const idx = html.indexOf(match[1]);
    const contextStart = Math.max(0, idx - 300);
    const contextEnd = Math.min(html.length, idx + 1200);
    const context = html.slice(contextStart, contextEnd);
    const titleFromContext = stripHtmlTags(context)
      .replace(/\s+/g, ' ')
      .trim();

    const titleCandidate = extractTitleFromText(context) || titleFromContext;
    const areaMatch = context.match(/(\d{2,4})\s*(?:кв\.?\s*м|кв\.\s*м|m2|м²|sq\.m)/i);
    const area = areaMatch ? Number(areaMatch[1]) : extractAreaFromText(titleCandidate || href);

    if (!isSofiaCommercialListingCandidate(titleCandidate, href, area)) continue;

    const ageMatch = context.match(/(\d{1,3})\s*(?:часа?|hours?|hrs?|hr|h|дни?|days?|d)/i);
    const ageHours = ageMatch ? Number(ageMatch[1]) : 0;

    listingMap.set(href, {
      id: `imot-browser-${href}`,
      source: 'imot.bg',
      title: titleCandidate,
      address: extractAddressFromUrl(href) || extractAddressFromTitle(titleCandidate),
      district: 'София',
      area: Number(area) || 40,
      publishedAt: ageHours ? Date.now() - ageHours * 60 * 60 * 1000 : Date.now(),
      url: href,
    });
  }

  return [...listingMap.values()];
}

function buildListingUrl(source, address, district) {
  const query = `${address} ${district} София ${source}`.trim();

  if (source === 'imot.bg') {
    return `https://www.google.com/search?q=${encodeURIComponent(`site:imot.bg ${query}`)}`;
  }

  if (source === 'alo.bg') {
    return `https://www.google.com/search?q=${encodeURIComponent(`site:alo.bg ${query}`)}`;
  }

  return sourceHomepages[source] || `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function normalizeListingUrl(url, source = 'imot.bg') {
  if (!url) return '#';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://${source === 'alo.bg' ? 'www.alo.bg' : 'www.imot.bg'}${url}`;
  return url;
}

function stripHtmlTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function isResidentialListingText(value) {
  return /(prodava|apartament|ednostaen|dvustaen|tristaen|chetiristaen|studio|mezonet|zhilishtna|zhilishte|apartment|flat|kashta|къща|dom|дома|villa|imoti|жилищ)/i.test(value || '');
}

function isCommercialRentalText(value) {
  return /(naem|наем|ofis|офис|targovski|търговски|magazin|магазин|sklad|склад|pomeshtenie|помещение|komercheski|комерчески|office|retail|warehouse|shop|retail|store|business|commercial|rent)/i.test(value || '');
}

function parseListingHrefCandidates(html, source) {
  if (!html) return [];

  const urlSet = new Set();

  const hrefMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)];

  hrefMatches.forEach((match) => {
    const rawHref = match[1];
    if (!rawHref || rawHref === '#') return;

    const normalizedHref = normalizeListingUrl(rawHref, source).split('#')[0];
    const urlKey = normalizedHref.split('?')[0];

    if (!urlKey || /\/(?:p-|page-)\d+$/i.test(urlKey)) {
      return;
    }

    const listingPatterns = [
      /\/obiava-[^/]+/i,
      /\/obiava-[^/]+$/i,
      /\/(?:apartament|apartment|studio|shop|store|office|ofis|magazin|sklad|pomeshtenie|kashta|villa|dom|къща|офис|магазин|склад|помещение)[^/]*-\d+/i,
    ];

    const isListingUrl = listingPatterns.some((pattern) => pattern.test(urlKey));
    if (!isListingUrl) {
      return;
    }

    urlSet.add(urlKey);
  });

  return [...urlSet];
}

function extractAreaFromText(text) {
  const match = text.match(/(\d{2,4})\s*(?:кв\.?\s*м|кв\.\s*м|m2|м²|sq\.m)/i);
  return match ? Number(match[1]) : null;
}

function extractPublishedAgeHours(text) {
  if (!text) return 0;
  const cleanText = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (/днес|today|today's|today\b|с днес/i.test(cleanText)) return 0;

  const mixedMatch = cleanText.match(/(?:преди|ago|before)\s+(\d+(?:[.,]\d+)?)\s*(?:часа?|hours?|hrs?|hr|h)(?:\s*и\s*(\d+(?:[.,]\d+)?)\s*(?:мин(?:ути|ути)?|minutes?|mins?|m))?/i);
  if (mixedMatch) {
    const hours = Number((mixedMatch[1] || '0').replace(',', '.'));
    const minutes = Number((mixedMatch[2] || '0').replace(',', '.'));
    return Number((hours + minutes / 60).toFixed(2));
  }

  const minuteMatch = cleanText.match(/(?:преди|ago|before)\s+(\d+(?:[.,]\d+)?)\s*(?:мин(?:ути|ути)?|minutes?|mins?|m)/i);
  if (minuteMatch) return Number(minuteMatch[1].replace(',', '.')) / 60;

  const hourMatch = cleanText.match(/(?:преди|ago|before)\s+(\d+(?:[.,]\d+)?)\s*(?:часа?|hours?|hrs?|hr|h)/i);
  if (hourMatch) return Number(hourMatch[1].replace(',', '.'));

  const dayMatch = cleanText.match(/(?:преди|ago|before)\s+(\d+(?:[.,]\d+)?)\s*(?:дни?|days?|d)/i);
  if (dayMatch) return Number(dayMatch[1].replace(',', '.')) * 24;

  return 0;
}

function extractTitleFromText(text) {
  if (!text) return 'Реална обява';

  const cleaned = stripHtmlTags(text).replace(/\s+/g, ' ').trim();

  if (cleaned && cleaned.length > 12 && !/^(continue|next|prev|click here|продължи|нататък|отказ|save|добави обява|вход|регистрация)$/i.test(cleaned)) {
    return cleaned;
  }

  const anchorMatches = [...String(text).matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>(.*?)<\/a>/gi)]
    .map((match) => stripHtmlTags(match[1]))
    .find((value) => value && value.length > 12 && !/^(continue|next|prev|click here|продължи|нататък|отказ|save|добави обява|вход|регистрация)$/i.test(value));

  return anchorMatches || 'Реална обява';
}

function extractAddressFromTitle(title) {
  const cleaned = stripHtmlTags(String(title || '')).replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'София';

  const withoutPrefix = cleaned
    .replace(/^(?:дава\s+под\s+наем|наем|продава|подава\s+за\s+наем)\s+/i, '')
    .trim();

  const withoutType = withoutPrefix
    .replace(/^(?:магазин|офис|склад|помещение|апартамент|студио|къща|дуплекс|вила|жилище)\s*(?:,|:|-)?\s*/i, '')
    .trim();

  const normalized = withoutType.replace(/^[,\s.-]+|[,\s.-]+$/g, '').trim();
  return normalized || 'София';
}

function extractAddressFromUrl(url) {
  const slug = String(url || '').split('/').pop();
  if (!slug) return 'София';

  const cleaned = slug
    .replace(/^obiava-[^\-]+-/, '')
    .replace(/^(?:dava-pod-naem|naem|prodava|kupuva|tarsi-da-naeme)-/i, '')
    .replace(/-grad-/i, ' град ')
    .replace(/-sofiya-/i, ' София, ')
    .replace(/-sofiya$/i, ' София')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'София';
}

const districtCoordinates = [
  { keys: ['център', 'tsentar', 'center', 'central'], coords: { lat: 42.6977, lng: 23.3219 } },
  { keys: ['витоша', 'vitosha'], coords: { lat: 42.689, lng: 23.272 } },
  { keys: ['младост', 'mladost'], coords: { lat: 42.653, lng: 23.357 } },
  { keys: ['лозенец', 'lozenets'], coords: { lat: 42.647, lng: 23.299 } },
  { keys: ['надежда', 'nadezhda'], coords: { lat: 42.713, lng: 23.287 } },
  { keys: ['дружба', 'druzhba'], coords: { lat: 42.737, lng: 23.323 } },
  { keys: ['обеля', 'obelya'], coords: { lat: 42.684, lng: 23.307 } },
  { keys: ['красно село', 'krasno selo'], coords: { lat: 42.679, lng: 23.351 } },
  { keys: ['студентски', 'studentski', 'studentski grad'], coords: { lat: 42.652, lng: 23.339 } },
  { keys: ['света троица', 'sveta troitsa'], coords: { lat: 42.687, lng: 23.338 } },
  { keys: ['бояна', 'boyana'], coords: { lat: 42.646, lng: 23.257 } },
  { keys: ['люлин', 'lyulin'], coords: { lat: 42.712, lng: 23.315 } },
  { keys: ['банишора', 'banishora'], coords: { lat: 42.695, lng: 23.274 } },
  { keys: ['хиподрума', 'hipodruma'], coords: { lat: 42.678, lng: 23.247 } },
  { keys: ['драгалевци', 'dragalevtsi'], coords: { lat: 42.632, lng: 23.259 } },
  { keys: ['исък', 'iztok'], coords: { lat: 42.728, lng: 23.392 } },
  { keys: ['симеоново', 'simeonovo'], coords: { lat: 42.649, lng: 23.392 } },
  { keys: ['гоце делчев', 'gotse delchev'], coords: { lat: 42.697, lng: 23.305 } },
  { keys: ['мусагеница', 'musagenitsa'], coords: { lat: 42.661, lng: 23.360 } },
  { keys: ['бъкстон', 'bakston'], coords: { lat: 42.689, lng: 23.285 } },
  { keys: ['долни банишора', 'dolni banishora'], coords: { lat: 42.695, lng: 23.274 } },
];

function deriveListingCoordinates(listing) {
  if (!listing) return { lat: 42.6977, lng: 23.3219 };
  if (listing.coordinates && Number.isFinite(listing.coordinates.lat) && Number.isFinite(listing.coordinates.lng)) {
    return listing.coordinates;
  }

  const haystack = `${listing.title || ''} ${listing.address || ''} ${listing.district || ''}`.toLowerCase();

  for (const entry of districtCoordinates) {
    if (entry.keys.some((key) => haystack.includes(key))) {
      return entry.coords;
    }
  }

  return { lat: 42.6977, lng: 23.3219 };
}

function getDistanceMeters(origin, destination) {
  const degreesToRadians = Math.PI / 180;
  const latitudeDelta = (destination.lat - origin.lat) * degreesToRadians;
  const longitudeDelta = (destination.lng - origin.lng) * degreesToRadians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(origin.lat * degreesToRadians)
    * Math.cos(destination.lat * degreesToRadians)
    * Math.sin(longitudeDelta / 2) ** 2;

  return 6_371_000 * 2 * Math.asin(Math.sqrt(haversine));
}

function isSofiaCommercialListingCandidate(title, href = '', area = null) {
  const text = `${title || ''} ${href || ''}`;
  const normalizedText = text.toLowerCase();
  const parsedArea = Number(area);
  const inSofia = /sofiya|grad-sofiya|софия|гр\.\s*софия/i.test(normalizedText);
  const isCommercial = /(магазин|shop|store|офис|office|търговски|retail|commercial|градски|помещение|склад|warehouse|склад|дюкян|кафене|кафе|заведение|бизнес|business)/i.test(normalizedText);
  const isResidential = /(апартамент|apartament|ednostaen|dvustaen|tristaen|жилищ|flat|villa|house|къща|дома|studio)/i.test(normalizedText);
  const areaInRange = Number.isFinite(parsedArea) && parsedArea >= 40 && parsedArea <= 100;

  return inSofia && isCommercial && !isResidential && areaInRange;
}

async function fetchOpenSofiaListings() {
  const baseUrl = 'https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin?kv_min=40&kv_max=100';
  const pageUrls = [baseUrl];
  const uniquePages = new Set(pageUrls);

  try {
    const firstResponse = await fetch(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!firstResponse.ok) {
      return [];
    }

    const firstHtml = new TextDecoder('windows-1251').decode(new Uint8Array(await firstResponse.arrayBuffer()));
    const discoveredPages = collectImotListingPages(firstHtml, baseUrl);
    discoveredPages.forEach((url) => uniquePages.add(url));

    const allListings = [];
    const seenUrls = new Set();

    for (const pageUrl of [...uniquePages]) {
      const pageResponse = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!pageResponse.ok) continue;

      const htmlBuffer = await pageResponse.arrayBuffer();
      const html = new TextDecoder('windows-1251').decode(new Uint8Array(htmlBuffer));
      const pageListings = extractCommercialListingsFromBrowserHtml(html);

      for (const listing of pageListings) {
        if (!seenUrls.has(listing.url)) {
          seenUrls.add(listing.url);
          allListings.push(listing);
        }
      }
    }

    if (allListings.length > 0) {
      return allListings;
    }
  } catch (error) {
    console.warn('Failed to load Sofia imot.bg listings:', error.message);
  }

  return [];
}

async function fetchLiveListings() {
  const baseUrl = 'https://www.imot.bg/obiavi/naemi/grad-sofiya/magazin?kv_min=40&kv_max=100';
  const perSourcePages = {
    'imot.bg': [baseUrl],
  };

  const allListings = [];

  for (const [source, pages] of Object.entries(perSourcePages)) {
    const uniquePages = new Set(pages);

    try {
      const firstResponse = await fetch(baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (firstResponse.ok) {
        const firstHtml = new TextDecoder('windows-1251').decode(new Uint8Array(await firstResponse.arrayBuffer()));
        const discoveredPages = collectImotListingPages(firstHtml, baseUrl);
        discoveredPages.forEach((url) => uniquePages.add(url));
      }
    } catch (error) {
      console.warn(`Failed to discover pagination for ${source}:`, error.message);
    }

    for (const pageUrl of [...uniquePages]) {
      try {
        const response = await fetch(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'text/html,application/xhtml+xml',
          },
        });

        if (!response.ok) continue;

        const htmlBuffer = await response.arrayBuffer();
        const html = new TextDecoder('windows-1251').decode(new Uint8Array(htmlBuffer));
        const extracted = extractCommercialListingsFromBrowserHtml(html);

        for (const listing of extracted) {
          const normalizedListing = {
            ...listing,
            coordinates: deriveListingCoordinates(listing),
          };
          const uniqueKey = normalizedListing.url || `${normalizedListing.title}|${normalizedListing.address}|${normalizedListing.area}`;
          if (!allListings.some((existing) => (existing.url || `${existing.title}|${existing.address}|${existing.area}`) === uniqueKey)) {
            allListings.push(normalizedListing);
          }
        }
      } catch (error) {
        console.warn(`Failed to load live listings for ${source}:`, error.message);
      }
    }
  }

  return allListings;
}

async function buildAnalysis(hoursOverride = 'all') {
  const now = Date.now();
  const liveListings = await fetchLiveListings();
  const rawHoursValue = String(hoursOverride || 'all').trim().toLowerCase();
  const lookbackHours = rawHoursValue === 'all' || rawHoursValue === 'without' || rawHoursValue === 'nolimit' ? null : Number(rawHoursValue);

  if (liveListings.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      sourceMode: 'live-empty',
      summary: {
        totalListings: 0,
        veryClose: 0,
        near: 0,
        far: 0,
        recommendation: 'low_risk',
        riskScore: 0,
      },
      listings: [],
      minimarkets: minimarkets.length,
      lookbackHours,
    };
  }

  const filteredListings = liveListings.filter((listing) => {
    const ageMs = now - new Date(listing.publishedAt).getTime();
    const isInTimeWindow = lookbackHours === null || ageMs <= lookbackHours * 60 * 60 * 1000;
    const isCommercial = /(ofis|офис|targovski|търговски|magazin|магазин|sklad|склад|pomeshtenie|помещение|naem|наем)/i.test(listing.title || '');
    const isInArea = Number(listing.area) >= 15 && Number(listing.area) <= 500;
    return isInTimeWindow && isInArea && isCommercial;
  });

  const enrichedListings = filteredListings.map((listing) => {
    const coordinates = listing.coordinates || { lat: 42.6977, lng: 23.3219 };
    const nearestMinimarketDistance = Math.min(
      ...minimarkets.map((minimarket) => getDistanceMeters(coordinates, minimarket.coordinates))
    );

    return {
      ...listing,
      distanceToNearestMinimarket: Math.round(nearestMinimarketDistance),
      riskStatus: classifyDistance(nearestMinimarketDistance),
      isWithinTargetDistance: nearestMinimarketDistance > 200,
    };
  });

  const counts = {
    very_close: 0,
    near: 0,
    far: 0,
  };

  enrichedListings.forEach((listing) => {
    counts[listing.riskStatus] += 1;
  });

  const score = scoreLocation({
    listingCount: enrichedListings.length,
    nearby: counts.near,
    veryClose: counts.very_close,
    far: counts.far,
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceMode: 'live',
    summary: {
      totalListings: enrichedListings.length,
      veryClose: counts.very_close,
      near: counts.near,
      far: counts.far,
      recommendation: score.label,
      riskScore: score.score,
    },
    listings: enrichedListings.sort((a, b) => a.distanceToNearestMinimarket - b.distanceToNearestMinimarket),
    minimarkets: minimarkets.length,
    lookbackHours,
  };
}

app.get('/api/analysis', async (req, res) => {
  const hours = req.query.hours || 'all';
  res.json(await buildAnalysis(hours));
});

app.get('/api/imot-open-listings', async (req, res) => {
  const rawHours = String(req.query.hours || 'all').trim().toLowerCase();
  const lookbackHours = rawHours === 'all' || rawHours === 'without' || rawHours === 'nolimit' ? null : Number(rawHours);
  const listings = await fetchOpenSofiaListings();

  const filteredListings = listings.filter((listing) => {
    if (lookbackHours === null) return true;
    const ageHours = (Date.now() - new Date(listing.publishedAt).getTime()) / (60 * 60 * 1000);
    return ageHours <= lookbackHours;
  });

  res.json({
    generatedAt: new Date().toISOString(),
    source: 'imot.bg',
    lookbackHours,
    total: filteredListings.length,
    listings: filteredListings.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt)),
  });
});

app.get('/api/minimarkets', async (_req, res) => {
  const locations = await fetchRealSofiaMinimartLocations();

  res.json({
    source: locations.length ? 'mini-mart.bg-ajax' : 'fallback',
    total: locations.length,
    locations,
    apiConfigured: Boolean(GOOGLE_MAPS_API_KEY),
  });
});

app.get('/api/ai-status', (_req, res) => {
  res.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    defaultPrompt: DEFAULT_MINIMART_PROMPT,
  });
});

app.post('/api/analyze-minimart', async (req, res) => {
  const listing = req.body?.listing || req.body || {};
  const customPrompt = req.body?.prompt;

  if (!listing.address && !listing.title) {
    return res.status(400).json({ error: 'Липсва адрес на обявата за анализ.' });
  }

  try {
    const analysis = await analyzeMinimartLocation(listing, { customPrompt });
    res.json({ ...analysis, promptUsed: String(customPrompt || '').trim() ? 'custom' : 'default' });
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'AI анализът не е настроен. Добави GEMINI_API_KEY в средата на сървъра.',
        code: 'AI_NOT_CONFIGURED',
        hint: 'Вземи безплатен ключ от https://aistudio.google.com/app/apikey и стартирай сървъра с GEMINI_API_KEY=твоя_ключ',
      });
    }
    console.warn('AI minimart analysis failed:', error.message, error?.cause?.message || '');
    res.status(502).json({ error: `AI анализът се провали: ${error.message}` });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT} (build: ai-status v1)`);
  });
}

module.exports = {
  parseListingHrefCandidates,
  normalizeListingUrl,
  normalizeGoogleMapsPlaceResult,
  extractAreaFromText,
  extractPublishedAgeHours,
  collectImotListingPages,
  buildListingUrl,
  isSofiaCommercialListingCandidate,
  deriveListingCoordinates,
  fetchLiveListings,
  fetchOpenSofiaListings,
  fetchGoogleMapsMinimartLocations,
  fetchMinimartLocations,
  extractAddressFromTitle,
  buildAnalysis,
  app,
};
