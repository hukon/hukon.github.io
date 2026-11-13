import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// All paths below are repo-relative; anchor the process at the repo root so
// they resolve the same way no matter where the tests are launched from.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const SKIP_DIRS = new Set(['node_modules', '.git', '.superpowers']);

/** File text, relative to the repo root. Throws if the file is missing. */
export function readPage(relPath) {
  return readFileSync(relPath, 'utf8');
}

/** Repo-relative (forward-slash) paths of files under `dir` whose extension is in `exts`. */
export function listFiles(dir, exts) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (exts.includes(extname(name).toLowerCase())) out.push(relative('.', full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

const EXTERNAL = /^(?:https?:)?\/\//i; // http://, https:// or protocol-relative //

/** Candidate URLs of a srcset value ("a.png 1x, b.png 2x"). */
function srcsetUrls(value) {
  return value.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
}

const quotedOrBare = '(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))';

/** Every value of an attribute (quoted or unquoted) matched by `re`, which must capture it in groups 1-3. */
function attrValues(text, re) {
  return [...text.matchAll(re)].map((m) => (m[1] ?? m[2] ?? m[3] ?? '').trim());
}

/**
 * Every external URL (http://, https:// or protocol-relative //) used to load something: src=, poster=,
 * srcset candidates, <link href=, <use>/<image> href, xlink:href, CSS url(), CSS @import "..." and image-set("...").
 * Plain <a href> links to other sites are allowed.
 */
export function externalRefs(text) {
  const found = [];
  const add = (u) => { if (EXTERNAL.test(u)) found.push(u); };
  const attr = (name) => new RegExp(`(?<![\\w-])${name}\\s*=\\s*${quotedOrBare}`, 'gi');
  const tagAttr = (tag) => new RegExp(`<${tag}\\b[^>]*?\\bhref\\s*=\\s*${quotedOrBare}`, 'gi');

  for (const re of [attr('src'), attr('poster'), attr('xlink:href'), tagAttr('link'), tagAttr('use'), tagAttr('image')])
    attrValues(text, re).forEach(add);
  for (const v of attrValues(text, attr('srcset'))) srcsetUrls(v).forEach(add);

  for (const m of text.matchAll(/url\(\s*["']?\s*((?:https?:)?\/\/[^"')\s]+)/gi)) found.push(m[1]);
  for (const m of text.matchAll(/@import\s+["']\s*((?:https?:)?\/\/[^"']+)/gi)) found.push(m[1]);
  for (const set of text.matchAll(/image-set\(([^)]*)\)/gi))
    for (const m of set[1].matchAll(/["']\s*((?:https?:)?\/\/[^"']+)["']/g)) found.push(m[1]);
  return [...new Set(found)];
}

/**
 * Every relative reference in the HTML that must exist on disk: src, poster, href (incl. <use>, <image>,
 * xlink:href) and srcset candidates. Skips #-only, protocol-relative and anything with a scheme
 * (http:, https:, mailto:, tel:, data:, javascript:).
 */
export function localRefs(html) {
  const candidates = [
    ...attrValues(html, new RegExp(`(?<![\\w-])(?:src|href|poster)\\s*=\\s*${quotedOrBare}`, 'gi')),
    ...attrValues(html, new RegExp(`(?<![\\w-])srcset\\s*=\\s*${quotedOrBare}`, 'gi')).flatMap(srcsetUrls),
  ];
  return candidates.filter((ref) => ref && !ref.startsWith('#') && !ref.startsWith('//') && !/^[a-z][a-z0-9+.-]*:/i.test(ref));
}

/** Repo-relative path of `ref` as seen from `fromFile`, with ?query and #fragment stripped. */
export function resolveFrom(fromFile, ref) {
  const clean = ref.split('#')[0].split('?')[0];
  if (clean.startsWith('/')) return posix.normalize(clean.slice(1));
  return posix.normalize(posix.join(posix.dirname(fromFile.split(sep).join('/')), clean));
}

/**
 * Paths git knows about (tracked, including files staged but not yet committed), repo-relative with forward
 * slashes. GitHub Pages serves a case-sensitive file system, so references are checked against these exact
 * spellings instead of the local (case-insensitive on macOS) disk.
 */
export function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

/** True when `ref` (repo-relative; a trailing slash or "." means a directory) names a tracked file, case-sensitively. */
export function isTracked(ref, tracked) {
  const set = tracked instanceof Set ? tracked : new Set(tracked);
  if (ref === '.' || ref === './' || ref === '') return set.has('index.html');
  if (ref.endsWith('/')) return set.has(`${ref}index.html`);
  return set.has(ref);
}

const PRIVATE_FILE = '.private-patterns.txt';

/**
 * Compiles one-pattern-per-line text (JavaScript regex source; blank lines and lines starting with # are
 * ignored) into a single case-insensitive RegExp, or null when there are no patterns.
 */
export function compilePatterns(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return lines.length ? new RegExp(lines.map((l) => `(?:${l})`).join('|'), 'i') : null;
}

/** The git-ignored owner-specific patterns as a RegExp, or null when the file is absent. */
export function loadPrivatePatterns() {
  return existsSync(PRIVATE_FILE) ? compilePatterns(readFileSync(PRIVATE_FILE, 'utf8')) : null;
}
