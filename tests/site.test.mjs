import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { readPage, listFiles, externalRefs, localRefs, resolveFrom, trackedFiles, isTracked, compilePatterns, loadPrivatePatterns } from './helpers.mjs';

// Repo-relative paths that may be missing for now. Empty: every linked file must exist.
export const PENDING = new Set();

test('no external requests in pages, css or js', () => {
  for (const f of listFiles('.', ['.html', '.css', '.js']).filter(f => !f.startsWith('tests/') && !f.startsWith('node_modules/')))
    assert.deepEqual(externalRefs(readPage(f)), [], f);
});

test('all local references exist (exact case, as git tracks them)', () => {
  const tracked = new Set(trackedFiles());
  for (const f of listFiles('.', ['.html']).filter(f => !f.startsWith('node_modules/')))
    for (const r of localRefs(readPage(f))) {
      const p = resolveFrom(f, r);
      if (PENDING.has(p)) continue;
      assert.ok(isTracked(p, tracked), `${f} -> ${r}`);
    }
});

test('isTracked is case-sensitive and understands directory links', () => {
  const t = new Set(['index.html', 'cv/index.html', 'assets/Logo.png']);
  assert.ok(isTracked('assets/Logo.png', t));
  assert.ok(!isTracked('assets/logo.png', t));
  assert.ok(isTracked('cv/', t) && isTracked('./', t) && isTracked('.', t));
  assert.ok(!isTracked('missing/', t));
});

// Generic secret shapes only. The patterns are written with a bracketed character so that this file never
// contains the literal prefixes it scans for. Owner-specific words live in the git-ignored .private-patterns.txt.
const SECRETS = /np[g]_|sk-an[t]-|gh[p]_|postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/i;
const BINARY = /\.(woff2|webp|png|pdf)$/i;

function scanTracked(re) {
  for (const f of trackedFiles().filter(f => !BINARY.test(f) && f !== 'package-lock.json'))
    assert.ok(!re.test(readFileSync(f, 'utf8')), `${f} matches ${re}`);
}

test('pattern compiler matches whole words only (made-up words)', () => {
  const re = compilePatterns('# a comment\n\n\\bplover\\b\n\\bmarten\\b\n');
  for (const t of ['a plover', 'Plover.', 'the marten', 'x-plover-y']) assert.ok(re.test(t), t);
  for (const t of ['ploverx', 'xplover', 'martens', 'plove']) assert.ok(!re.test(t), t);
  assert.equal(compilePatterns('# only a comment\n\n'), null);
});

test('generic secret patterns match what they should', () => {
  for (const t of ['np' + 'g_abc', 'sk-an' + 't-x', 'gh' + 'p_x', 'postgres' + '://u:p@host', 'postgresql' + '://u:p@host'])
    assert.ok(SECRETS.test(t), t);
  assert.ok(!SECRETS.test('postgres://host/db'));
});

test('no secrets in any tracked text file', () => scanTracked(SECRETS));

test('no owner-specific private patterns in any tracked text file', (t) => {
  const re = loadPrivatePatterns();
  if (!re) return t.skip('.private-patterns.txt not found; the owner-specific scan only runs where that git-ignored file exists');
  scanTracked(re);
});

test('base.css defines the palette and self-hosted fonts', () => {
  const css = readPage('assets/css/base.css');
  for (const v of ['#F3F5F8', '#0E1726', '#4B5768', '#9AA7B8', '#E8590C', '#DCE2EA']) assert.ok(css.toUpperCase().includes(v), v);
  assert.match(css, /font-family:\s*["']Manrope["']/);
  assert.match(css, /font-family:\s*["']JetBrains Mono["']/);
  assert.match(css, /font-display:\s*swap/);
});

// ---- Task 2: page content and layout ----

const html = () => readPage('index.html');
const CARD_IDS = ['p-alces','p-student-organizer','p-shops','p-visa-manager','p-aura-gros','p-hb-china-cars','p-digital-dream-visa','p-medical-app','p-networking'];

test('has all sections and the nine project cards in order', () => {
  for (const id of ['about','projects','experience','education','skills','languages','contact']) assert.match(html(), new RegExp(`id="${id}"`));
  const ids = [...html().matchAll(/<article class="project[^"]*" id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, CARD_IDS);
});

test('every project card has image slot, title, who-for, what-I-did, tags and links', () => {
  const cards = [...html().matchAll(/<article class="project[^"]*" id="(p-[^"]+)"[\s\S]*?<\/article>/g)];
  assert.equal(cards.length, CARD_IDS.length);
  for (const [card, id] of cards) {
    for (const part of [/class="project-image"/, /<h3[ >]/, /class="project-for"/, /<ul class="project-did"[^>]*>\s*<li>/, /<ul class="tags"[^>]*>\s*<li>/, /class="project-links"/])
      assert.match(card, part, `${id} lacks ${part}`);
  }
});

test('honesty and contact wording', () => {
  const t = html();
  assert.match(t, /CodFlow/); assert.match(t, /[Ff]reelance project for a client/); assert.match(t, /[Uu]niversity group project/);
  assert.match(t, /nidhaldilmi@gmail\.com/); assert.match(t, /\+213 542 55 85 02/); assert.match(t, /github\.com\/hukon/);
  assert.match(t, /href="cv\/Nidhal-Dilmi-CV\.pdf"/);
});

test('no grades on the page', () => {
  // A mark out of 20 (e.g. "11.3/20") must never appear; dates like "10/2025" are fine.
  assert.doesNotMatch(html(), /\b\d{1,2}(?:[.,]\d+)?\s*\/\s*20\b/);
});

test('has viewport meta and 640px breakpoint', () => {
  assert.match(html(), /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(readPage('assets/css/site.css'), /@media \(max-width: 640px\)/);
});

test('links to other sites open safely', () => {
  const links = [...html().matchAll(/<a [^>]*href="https?:[^"]+"[^>]*>/g)];
  assert.ok(links.length > 0, 'expected links to other sites');
  for (const m of links) {
    assert.match(m[0], /rel="[^"]*noopener[^"]*"/);
    assert.match(m[0], /target="_blank"/);
  }
});

test('every font file referenced by base.css exists and is non-empty', () => {
  const css = readPage('assets/css/base.css');
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]);
  assert.ok(urls.length >= 5, 'expected at least five font urls');
  for (const u of urls) {
    const p = resolveFrom('assets/css/base.css', u);
    assert.ok(existsSync(p) && statSync(p).size > 1000, p);
    assert.equal(readFileSync(p).subarray(0, 4).toString(), 'wOF2', `${p} is not woff2`);
  }
});

// ---- Task 3: network map ----

test('map nodes are links to existing cards', () => {
  const t = html();
  const targets = [...t.matchAll(/<a class="node[^"]*" href="#(p-[^"]+)"/g)].map(m => m[1]);
  assert.equal(targets.length, 9);
  for (const id of targets) assert.match(t, new RegExp(`<article class="project[^"]*" id="${id}"`));
  assert.match(t, /class="node node--soon" href="#p-networking"/);
});

test('motion respects reduced-motion and map script is local', () => {
  assert.match(readPage('assets/js/map.js'), /prefers-reduced-motion: reduce/);
  assert.match(html(), /<script src="assets\/js\/map\.js" defer><\/script>/);
});

test('map markup: group role, one node and one edge per card, centre node, live tip', () => {
  const t = html();
  const svg = t.match(/<svg id="network-map"[^>]*>[\s\S]*?<\/svg>/);
  assert.ok(svg, 'network map svg');
  assert.match(svg[0], /^<svg[^>]*viewBox="0 0 640 360"/);
  assert.match(svg[0], /^<svg[^>]*role="group"/);
  assert.match(svg[0], /^<svg[^>]*aria-label="[^"]{10,}"/);
  assert.match(readPage('assets/css/site.css'), /aspect-ratio:\s*640\s*\/\s*360/);

  const kinds = Object.fromEntries([...svg[0].matchAll(/<a class="node (node--[a-z]+)" href="#(p-[^"]+)"/g)].map(m => [m[2], m[1]]));
  assert.deepEqual(kinds, {
    'p-alces': 'node--live', 'p-student-organizer': 'node--live', 'p-shops': 'node--live', 'p-visa-manager': 'node--live',
    'p-aura-gros': 'node--live', 'p-hb-china-cars': 'node--live', 'p-digital-dream-visa': 'node--live',
    'p-medical-app': 'node--academic', 'p-networking': 'node--soon',
  });
  for (const [node, id] of svg[0].matchAll(/<a class="node[^"]*" href="#(p-[^"]+)"[\s\S]*?<\/a>/g)) {
    assert.match(node, /^<a [^>]*aria-label="[^"]+"/, id);
    assert.match(node, /^<a [^>]*data-summary="[^"]{10,}"/, id);
    assert.match(node, /<circle /, id);
    assert.match(node, /<text [^>]*>[^<]+<\/text>/, id);
  }
  const edges = [...svg[0].matchAll(/<line class="edge" data-to="(p-[^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(edges, Object.keys(kinds).sort());
  assert.match(svg[0], /<g class="node node--you"[^>]*>[\s\S]*?<circle [\s\S]*?>Nidhal<\/text>/);
  assert.match(t, /<\/svg>\s*<div id="map-tip" role="status"[^>]*>/);
});

test('map script: rAF packets, pause when hidden; CSS: no draw-in under reduced motion', () => {
  const js = readPage('assets/js/map.js');
  for (const re of [/requestAnimationFrame/, /visibilityState/, /is-active/, /map-tip/, /data-summary|dataset\.summary/])
    assert.match(js, re);
  const css = readPage('assets/css/site.css');
  const reduce = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/);
  assert.ok(reduce, 'reduced-motion block in site.css');
  assert.match(reduce[0], /\.edge/);
});

test('map node names start with their visible label (WCAG 2.5.3 label in name)', () => {
  const nodes = [...html().matchAll(/<a class="node[^"]*" href="#(p-[^"]+)"[^>]*aria-label="([^"]+)"[\s\S]*?<text [^>]*>([^<]+)<\/text>/g)];
  assert.equal(nodes.length, 9);
  for (const [, id, name, label] of nodes)
    assert.ok(name.toLowerCase().startsWith(label.trim().toLowerCase()), `${id}: "${name}" should start with "${label}"`);
});

test('map labels render at 11px or more at the narrowest two-column width', () => {
  const css = readPage('assets/css/site.css');
  const units = Number(css.match(/#network-map a\.node text \{[^}]*?font-size: ([\d.]+)px/)[1]);
  const stackAt = Number(css.match(/@media \(max-width: (\d+)px\) \{\s*\.hero-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/)[1]);
  // Two columns from stackAt + 1 px; column = (viewport - 2 x 24px gutter - 48px gap) / 2; the viewBox is 640 wide.
  const column = (stackAt + 1 - 2 * 24 - 48) / 2;
  assert.ok((units * column) / 640 >= 11, `${units} units in a ${column}px column = ${((units * column) / 640).toFixed(1)}px`);
});

// ---- Task 4: project images and diagrams ----

const IMAGES = {
  'p-alces': 'alces.svg',
  'p-student-organizer': 'student-organizer.webp',
  'p-shops': 'shops.webp',
  'p-visa-manager': 'visa-manager.svg',
  'p-aura-gros': 'aura-gros.webp',
  'p-hb-china-cars': 'hb-china-cars.webp',
  'p-digital-dream-visa': 'digital-dream-visa.webp',
  'p-medical-app': 'medical-app.webp',
  'p-networking': 'networking.svg',
};

test('every project card has an existing image with alt text', () => {
  const cards = [...html().matchAll(/<article class="project[^"]*" id="(p-[^"]+)"[\s\S]*?<\/article>/g)];
  assert.equal(cards.length, CARD_IDS.length);
  for (const m of cards) {
    const img = m[0].match(/<img [^>]*class="project-image"[^>]*>/);
    assert.ok(img, `${m[1]}: no <img class="project-image">`);
    assert.match(img[0], /alt="[^"]{10,}"/, m[1]);
    assert.match(img[0], /loading="lazy"/, m[1]);
    assert.match(img[0], /width="\d+"/, m[1]);
    assert.match(img[0], /height="\d+"/, m[1]);
    const src = img[0].match(/src="([^"]+)"/)[1];
    assert.equal(src, `assets/img/projects/${IMAGES[m[1]]}`, m[1]);
    assert.ok(existsSync(src) && statSync(src).size > 0, `${m[1]}: ${src}`);
  }
});

test('no project image placeholder divs remain', () => {
  assert.doesNotMatch(html(), /<div class="project-image"/);
});

test('screenshots are modest WebP files', () => {
  for (const f of listFiles('assets/img/projects', ['.webp'])) {
    const buf = readFileSync(f);
    assert.equal(buf.subarray(0, 4).toString(), 'RIFF', f);
    assert.equal(buf.subarray(8, 12).toString(), 'WEBP', f);
    assert.ok(buf.length <= 150_000, `${f} is ${buf.length} bytes`);
  }
});

test('diagrams are accessible SVGs with a title and no external references', () => {
  for (const name of ['alces', 'visa-manager', 'networking']) {
    const f = `assets/img/projects/${name}.svg`;
    const svg = readPage(f);
    assert.match(svg, /<svg [^>]*role="img"/, f);
    assert.match(svg, /<title[^>]*>[^<]{5,}<\/title>/, f);
    assert.match(svg, /viewBox="0 0 \d+ \d+"/, f);
    assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, f);
    assert.doesNotMatch(svg, /<image\b|<script\b|@import|url\(\s*["']?https?:/i, f);
  }
});

test('Digital Dream Visa card has no live link', () => {
  const card = html().match(/<article class="project[^"]*" id="p-digital-dream-visa"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(card, /agency-web-site-seven/);
  assert.doesNotMatch(card, /Live site/);
});

test('first load stays under 1 MB', () => {
  const eager = ['index.html', 'assets/css/base.css', 'assets/css/site.css', 'assets/js/map.js', ...listFiles('assets/fonts', ['.woff2'])];
  assert.ok(eager.reduce((s, f) => s + statSync(f).size, 0) < 1_000_000);
});

// ---- Task 5: CV page and PDF ----

const CV_PDF = 'cv/Nidhal-Dilmi-CV.pdf';
const cvText = () => readPage('cv/index.html');

test('CV page has contact and sections, no address', () => {
  const cv = cvText();
  for (const s of ['Education', 'Experience', 'Projects', 'Skills', 'Languages', 'Volunteering']) assert.match(cv, new RegExp(`<h2[^>]*>[^<]*${s}`, 'i'), s);
  assert.match(cv, /nidhaldilmi@gmail\.com/);
  assert.match(cv, /\+213 542 55 85 02/);
  assert.match(cv, /href="https:\/\/github\.com\/hukon"/);
  assert.match(cv, /href="https:\/\/hukon\.github\.io"/);
  assert.match(cv, /Sétif, Algeria/);
  assert.match(cv, /<html lang="en"/);
  assert.match(cv, /<title>[^<]*Nidhal Abderrahmane Dilmi/);
  assert.match(cv, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(readPage('assets/css/cv.css'), /@page\s*\{\s*size:\s*A4/);
});

test('CV page: no grades, no photo, no street address, nothing forbidden', () => {
  const cv = cvText();
  assert.doesNotMatch(cv, /\b\d{1,2}(?:[.,]\d+)?\s*\/\s*20\b/);
  assert.doesNotMatch(cv, /<img\b/i);
  assert.doesNotMatch(cv, /\b(?:rue|street|avenue|cité|cite|BP)\b/i);
  assert.ok(!SECRETS.test(cv));
  const priv = loadPrivatePatterns();
  if (priv) assert.ok(!priv.test(cv));
});

test('CV page keeps the honest project wording and stays on 5-6 project lines', () => {
  const cv = cvText();
  assert.match(cv, /CodFlow/);
  assert.match(cv, /[Ff]reelance project for a client/);
  assert.match(cv, /[Uu]niversity group project/);
  const projects = cv.match(/<section[^>]*id="projects"[\s\S]*?<\/section>/);
  assert.ok(projects, 'projects section');
  const lines = (projects[0].match(/<li\b/g) || []).length;
  assert.ok(lines >= 5 && lines <= 6, `project lines = ${lines}`);
});

test('CV print styles hide screen-only controls and print link targets as text', () => {
  const css = readPage('assets/css/cv.css');
  const print = css.match(/@media print\s*\{[\s\S]*$/);
  assert.ok(print, '@media print block');
  assert.match(print[0], /\.screen-only[^{}]*\{[^}]*display:\s*none/);
  assert.match(cvText(), /class="[^"]*screen-only[^"]*"/);
});

test('CV page links resolve: back to the portfolio and the PDF', () => {
  const cv = cvText();
  assert.match(cv, /href="\.\.\/"/);
  assert.match(cv, /href="Nidhal-Dilmi-CV\.pdf"/);
  assert.match(cv, /href="\.\.\/assets\/css\/cv\.css"/);
});

test('CV PDF exists, is a PDF and has at most 2 pages', () => {
  assert.ok(existsSync(CV_PDF), `${CV_PDF} is missing: run bash scripts/build-cv-pdf.sh`);
  const pdf = readFileSync(CV_PDF, 'latin1');
  assert.equal(pdf.slice(0, 5), '%PDF-');
  let pages = (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length;
  if (pages === 0) pages = Number(pdf.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/)?.slice(1).find(Boolean) ?? 0);
  assert.ok(pages >= 1 && pages <= 2, `pages=${pages}`);
});

test('no PDF is still pending: every link target exists', () => {
  assert.equal(PENDING.size, 0);
});

test('pages have title, description, favicon and share image', () => {
  for (const f of ['index.html', 'cv/index.html']) {
    const t = readPage(f);
    assert.match(t, /<title>[^<]*Nidhal Abderrahmane Dilmi[^<]*<\/title>/, f);
    assert.match(t, /<meta name="description" content="[^"]{50,}"/, f);
    assert.match(t, /rel="icon"[^>]*favicon\.svg/, f);
  }
  assert.match(html(), /<meta property="og:image" content="[^"]*og\.png"/);
  assert.ok(existsSync('assets/img/og.png'));
  assert.ok(existsSync('favicon.svg'));
  assert.ok(existsSync('README.md'));
});

test('GitHub Pages extras: .nojekyll, apple-touch-icon on both pages, portfolio print styles', () => {
  const tracked = new Set(trackedFiles());
  assert.ok(tracked.has('.nojekyll'));
  assert.ok(tracked.has('apple-touch-icon.png'));
  const png = readFileSync('apple-touch-icon.png');
  assert.equal(png.readUInt32BE(16), 180); // PNG IHDR width
  assert.equal(png.readUInt32BE(20), 180); // PNG IHDR height
  assert.match(readPage('index.html'), /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  assert.match(readPage('cv/index.html'), /<link rel="apple-touch-icon" href="\.\.\/apple-touch-icon\.png">/);
  const css = readPage('assets/css/site.css');
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /\.project[^{}]*\{[^}]*break-inside:\s*avoid/);
  assert.match(print, /\.topnav[\s\S]*?\.skip-link[\s\S]*?\.packets[\s\S]*?display:\s*none/);
});
