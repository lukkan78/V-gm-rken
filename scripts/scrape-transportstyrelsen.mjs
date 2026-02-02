import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.transportstyrelsen.se/sv/vagtrafik/trafikregler-och-vagmarken/vagmarken/';
const OUTPUT_PATH = path.resolve('data/signs.json');

// All 19 categories from Transportstyrelsen with codes, icons and colors
const CATEGORY_CONFIG = {
  'varningsmärken': { code: 'A', icon: '⚠️', color: '#FFD700' },
  'väjningspliktsmärken': { code: 'B', icon: '🛑', color: '#DC143C' },
  'förbudsmärken': { code: 'C', icon: '⛔', color: '#FF4500' },
  'påbudsmärken': { code: 'D', icon: '🔵', color: '#1E90FF' },
  'anvisningsmärken': { code: 'E', icon: 'ℹ️', color: '#4169E1' },
  'lokaliseringsmärken för vägvisning': { code: 'F1', icon: '🧭', color: '#228B22' },
  'lokaliseringsmärken för gång- och cykeltrafik': { code: 'F2', icon: '🚴', color: '#32CD32' },
  'lokaliseringsmärken för upplysning om allmänna inrättningar': { code: 'G', icon: '🏛️', color: '#6B8E23' },
  'lokaliseringsmärken för upplysning om serviceanläggningar': { code: 'H', icon: '⛽', color: '#2E8B57' },
  'lokaliseringsmärken för turistiskt intressanta mål': { code: 'I', icon: '🏔️', color: '#8B4513' },
  'upplysningsmärken': { code: 'J', icon: '📢', color: '#4682B4' },
  'vägmarkeringar': { code: 'M', icon: '〰️', color: '#708090' },
  'symboler': { code: 'S', icon: '🔣', color: '#9370DB' },
  'tilläggstavlor': { code: 'T', icon: '➕', color: '#696969' },
  'andra anordningar': { code: 'X', icon: '🚧', color: '#FF6347' },
  // Fallback mappings for variations
  'varning': { code: 'A', icon: '⚠️', color: '#FFD700' },
  'väjning': { code: 'B', icon: '🛑', color: '#DC143C' },
  'förbud': { code: 'C', icon: '⛔', color: '#FF4500' },
  'påbud': { code: 'D', icon: '🔵', color: '#1E90FF' },
  'anvisning': { code: 'E', icon: 'ℹ️', color: '#4169E1' },
  'lokalisering': { code: 'F', icon: '🧭', color: '#228B22' },
  'service': { code: 'H', icon: '⛽', color: '#2E8B57' },
  'tillägg': { code: 'T', icon: '➕', color: '#696969' },
  'upplysning': { code: 'J', icon: '📢', color: '#4682B4' }
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

function getCategoryConfig(name) {
  const lowered = name.toLowerCase();

  // Try exact match first
  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (lowered.includes(key)) {
      return config;
    }
  }

  // Default fallback
  return { code: '?', icon: '🚗', color: '#808080' };
}

function extractSignCode(id, categoryCode) {
  // Extract the sign code (like A1, B2, etc.) from the ID if possible
  const match = id.match(/^([A-Z]\d+)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return `${categoryCode}-${id.slice(0, 6).toUpperCase()}`;
}

function estimateDifficulty(name, categoryCode) {
  // Estimate difficulty based on name complexity and category
  const nameLength = name.length;
  const hasNumbers = /\d/.test(name);
  const hasParentheses = /[()]/.test(name);

  let difficulty = 2; // Default medium

  if (nameLength < 30) difficulty = 1;
  else if (nameLength > 60) difficulty = 4;
  else if (nameLength > 45) difficulty = 3;

  if (hasNumbers || hasParentheses) difficulty = Math.min(5, difficulty + 1);

  // Certain categories are generally harder
  if (['T', 'X', 'M'].includes(categoryCode)) {
    difficulty = Math.min(5, difficulty + 1);
  }

  return difficulty;
}

function extractSigns(html, categoryCode) {
  const $ = cheerio.load(html);
  const signs = [];

  $('img').each((_, img) => {
    const src = $(img).attr('src') || '';
    if (!src.includes('/link/')) return;

    const idMatch = src.match(/\/link\/(.+?)\.aspx/);
    if (!idMatch) return;

    const imgHash = idMatch[1];

    // Try multiple ways to find the sign name
    let name = '';

    // 1. Check for roadsign-text paragraph (new structure)
    const container = $(img).closest('div');
    const roadsignText = container.parent().find('.roadsign-text').first().text().trim();
    if (roadsignText) {
      // Remove sign code prefix like "A1. " from name
      name = roadsignText.replace(/^[A-Z]\d+\.\s*/, '').trim();
    }

    // 2. Fallback to alt text
    if (!name) {
      name = $(img).attr('alt') || '';
    }

    // 3. Fallback to figcaption
    if (!name) {
      name = $(img).closest('figure').find('figcaption').text().trim();
    }

    // 4. Extract sign code from roadsign-text if available
    let signCode = '';
    const codeMatch = roadsignText.match(/^([A-Z]\d+)/);
    if (codeMatch) {
      signCode = codeMatch[1];
    } else {
      signCode = extractSignCode(imgHash, categoryCode);
    }

    if (!name) return;

    const difficulty = estimateDifficulty(name, categoryCode);

    signs.push({
      id: signCode,
      name,
      img: imgHash,
      difficulty
    });
  });

  return dedupeSigns(signs);
}

function dedupeSigns(signs) {
  const seen = new Set();
  return signs.filter(sign => {
    const key = sign.img; // Use img hash as unique key
    if (seen.has(key)) return false;
    seen.add(key);
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

  console.log(`Hittade ${categoryUrls.length} kategorisidor att bearbeta...`);

  for (const url of categoryUrls) {
    try {
      console.log(`Hämtar: ${url}`);
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const title = $('h1').first().text().trim();
      if (!title) continue;

      const config = getCategoryConfig(title);
      const signs = extractSigns(html, config.code);

      if (signs.length === 0) {
        console.log(`  -> Inga märken hittades`);
        continue;
      }

      const slug = slugify(title);
      categories[slug] = {
        name: title,
        code: config.code,
        icon: config.icon,
        color: config.color,
        signs
      };

      console.log(`  -> ${signs.length} märken (${config.code})`);

      // Small delay to be nice to the server
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  -> Fel: ${error.message}`);
    }
  }

  return categories;
}

async function main() {
  try {
    console.log('Startar skrapning av Transportstyrelsen...\n');
    const data = await buildData();

    const totalSigns = Object.values(data).reduce((sum, cat) => sum + cat.signs.length, 0);

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
    console.log(`\n✅ Skrev ${Object.keys(data).length} kategorier med ${totalSigns} märken till ${OUTPUT_PATH}`);

    // Print summary
    console.log('\nSammanfattning:');
    Object.entries(data)
      .sort((a, b) => a[1].code.localeCompare(b[1].code))
      .forEach(([slug, cat]) => {
        console.log(`  ${cat.code}: ${cat.name} (${cat.signs.length} märken)`);
      });

  } catch (error) {
    console.error('❌ Misslyckades att hämta data:', error.message);
    process.exit(1);
  }
}

main();
