import test from 'node:test';
import assert from 'node:assert/strict';
import { externalRefs, localRefs, resolveFrom } from './helpers.mjs';

test('externalRefs flags every way a page can load a remote resource', () => {
  const cases = {
    'double-quoted src': ['<img src="https://a.test/x.png">', 'https://a.test/x.png'],
    'single-quoted src': ["<script src='http://a.test/x.js'></script>", 'http://a.test/x.js'],
    'unquoted src': ['<img src=https://a.test/x.png>', 'https://a.test/x.png'],
    'protocol-relative src': ['<script src="//cdn.test/x.js"></script>', '//cdn.test/x.js'],
    'link href': ['<link rel="stylesheet" href="https://f.test/c.css">', 'https://f.test/c.css'],
    'unquoted protocol-relative link href': ['<link rel=stylesheet href=//fonts.test/css>', '//fonts.test/css'],
    'css url()': ['@font-face{src:url(https://f.test/a.woff2)}', 'https://f.test/a.woff2'],
    'css url() quoted': ['a{background:url("https://f.test/a.png")}', 'https://f.test/a.png'],
    'css url() protocol-relative': ['a{background:url(//f.test/a.png)}', '//f.test/a.png'],
    'css @import string': ['@import "https://fonts.test/css?family=X";', 'https://fonts.test/css?family=X'],
    'css @import single quote protocol-relative': ["@import '//fonts.test/x.css';", '//fonts.test/x.css'],
    'css image-set string': ['a{background:image-set("https://f.test/a.png" 1x)}', 'https://f.test/a.png'],
    'srcset first candidate': ['<img srcset="https://a.test/a.png 1x, b.png 2x">', 'https://a.test/a.png'],
    'srcset later candidate': ['<img srcset="a.png 1x, //b.test/b.png 2x">', '//b.test/b.png'],
    'poster': ['<video poster="https://a.test/p.jpg"></video>', 'https://a.test/p.jpg'],
    'svg <use href>': ['<use href="https://a.test/s.svg#i"/>', 'https://a.test/s.svg#i'],
    'svg <image href>': ['<image href="//a.test/i.png"/>', '//a.test/i.png'],
    'xlink:href': ['<use xlink:href="https://a.test/s.svg#i"/>', 'https://a.test/s.svg#i'],
  };
  for (const [name, [text, expected]] of Object.entries(cases))
    assert.deepEqual(externalRefs(text), [expected], name);
});

test('externalRefs ignores local resources and plain links', () => {
  const clean = [
    '<a href="https://github.com/x">GitHub</a>',
    '<a href=//example.test/page>x</a>',
    '<img src="assets/a.png">',
    '<img src="/assets/a.png">',
    '<img srcset="a.png 1x, b.png 2x">',
    '<link rel="stylesheet" href="assets/css/base.css">',
    '<link rel="stylesheet" href="../a.css">',
    '<use href="#icon"/>',
    '@font-face{src:url("../fonts/a.woff2") format("woff2")}',
    '@import "base.css";',
    '<a href="mailto:a@b.test">mail</a>',
    '<img src="data:image/png;base64,AAAA">',
    'const url = "https://example.test"; // not a load',
  ];
  for (const t of clean) assert.deepEqual(externalRefs(t), [], t);
});

test('localRefs returns relative src/href/poster/srcset references', () => {
  const html = `
    <img src="a/b.png?v=1"> <img src='c.png'> <img src=d.png>
    <a href="cv/x.pdf#p">cv</a>
    <img srcset="e.png 1x, f/g.png 2x">
    <video poster="p.jpg"></video>
    <use href="sprite.svg#i"/> <image href="h.png"/> <use xlink:href="s2.svg#i"/>`;
  assert.deepEqual(localRefs(html), [
    'a/b.png?v=1', 'c.png', 'd.png', 'cv/x.pdf#p', 'p.jpg', 'sprite.svg#i', 'h.png', 's2.svg#i', 'e.png', 'f/g.png',
  ]);
});

test('localRefs skips #-only, mailto:, tel:, schemes and protocol-relative refs', () => {
  const html = `<a href="#top">t</a> <a href="mailto:a@b.test">m</a> <a href="tel:+1">t</a>
    <a href="https://x.test">x</a> <img src="//cdn.test/a.png"> <img src="data:image/gif;base64,AA">
    <a href="javascript:void(0)">j</a> <img srcset="https://x.test/a.png 1x, //y.test/b.png 2x">`;
  assert.deepEqual(localRefs(html), []);
});

test('resolveFrom resolves against the page folder and strips ?query and #fragment', () => {
  assert.equal(resolveFrom('index.html', 'assets/a.css?v=2#h'), 'assets/a.css');
  assert.equal(resolveFrom('cv/index.html', '../assets/a.css'), 'assets/a.css');
  assert.equal(resolveFrom('cv/index.html', 'Nidhal-Dilmi-CV.pdf'), 'cv/Nidhal-Dilmi-CV.pdf');
  assert.equal(resolveFrom('cv/index.html', '/assets/a.css'), 'assets/a.css');
});
