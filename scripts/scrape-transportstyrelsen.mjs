import fs from 'node:fs/promises';
import path from 'node:path';
import cheerio from 'cheerio';

const BASE_URL = 'https://www.transportstyrelsen.se/sv/vagtrafik/trafikregler-och-vagmarken/vagmarken/';
const OUTPUT_PATH = path.resolve('data/signs.json');

const CATEGORY_ICON_MAP = {
  varning: '⚠️',
  vajning: '🛑',
  forbud: '⛔',
  pabud: '🔵',
  anvisning: 'ℹ️',
  lokaliser: '🧭',
  service: '🧰',
  tillagg: '➕'
};

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VagmarkesforhorBot/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error(`Kunde inte hämta ${url}: ${response.status}`);
  }

  return response.text();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function iconForCategory(name) {
  const lowered = name.toLowerCase();
  const match = Object.keys(CATEGORY_ICON_MAP).find(key => lowered.includes(key));
  return match ? CATEGORY_ICON_MAP[match] : '🚗';
}

function extractSigns(html) {
  const $ = cheerio.load(html);
  const signs = [];

  $('img').each((_, img) => {
    const src = $(img).attr('src') || '';
    if (!src.includes('/link/')) return;

    const idMatch = src.match(/\/link\/(.+?)\.aspx/);
    if (!idMatch) return;

    const id = idMatch[1];
    const altText = $(img).attr('alt') || '';
    const figcaption = $(img).closest('figure').find('figcaption').text();
    const parentText = $(img).parent().text();
    const name = [altText, figcaption, parentText]
      .map(value => value.trim())
      .find(value => value.length > 0);

    if (!name) return;

    signs.push({ id: id.toUpperCase(), name, img: id });
  });

  return dedupeSigns(signs);
}

function dedupeSigns(signs) {
  const seen = new Set();
  return signs.filter(sign => {
    if (seen.has(sign.id)) return false;
    seen.add(sign.id);
    return true;
  });
}

async function scrapeCategories() {
  const indexHtml = await fetchHtml(BASE_URL);
  const $ = cheerio.load(indexHtml);
  const links = new Set();

  $('a[href]').each((_, anchor) => {
    const href = $(anchor).attr('href');
    if (!href) return;
    if (!href.includes('/vagmarken/')) return;
    if (href === BASE_URL) return;

    const absolute = href.startsWith('http') ? href : new URL(href, BASE_URL).toString();
    links.add(absolute.endsWith('/') ? absolute : `${absolute}/`);
  });

  return Array.from(links).sort();
}

async function buildData() {
  const categories = {};
  const categoryUrls = await scrapeCategories();

  for (const url of categoryUrls) {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const title = $('h1').first().text().trim();
    if (!title) continue;

    const signs = extractSigns(html);
    if (signs.length === 0) continue;

    const slug = slugify(title);
    categories[slug] = {
      name: title,
      icon: iconForCategory(title),
      signs
    };
  }

  return categories;
}

async function main() {
  try {
    const data = await buildData();
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
    console.log(`✅ Skrev ${Object.keys(data).length} kategorier till ${OUTPUT_PATH}`);
  } catch (error) {
    console.error('❌ Misslyckades att hämta data:', error.message);
    process.exit(1);
  }
}

main();
