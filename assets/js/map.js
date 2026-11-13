/*
 * Hero network map. The map works without this file (every node is a plain link to its card).
 * This adds two things:
 *  1. Hover or keyboard focus on a node highlights it and its edge, and writes the project's
 *     name and one line (data-summary) into #map-tip under the map.
 *  2. A few small "packets" travel along the edges, drawn with requestAnimationFrame. They run only
 *     when the visitor has not asked for reduced motion (prefers-reduced-motion: reduce), and they
 *     pause while the tab is hidden or the map is scrolled out of view.
 */
(() => {
  'use strict';

  const svg = document.getElementById('network-map');
  const tip = document.getElementById('map-tip');
  if (!svg || !tip) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const nodes = [...svg.querySelectorAll('a.node')];
  const edgeOf = (node) => svg.querySelector(`.edge[data-to="${node.getAttribute('href').slice(1)}"]`);

  /* ---------- 1. Highlight and tip ---------- */

  const hint = tip.textContent;
  let active = null;

  function setActive(node) {
    if (node === active) return;
    if (active) {
      active.classList.remove('is-active');
      edgeOf(active)?.classList.remove('is-active');
    }
    active = node;
    if (!node) {
      tip.textContent = hint;
      return;
    }
    node.classList.add('is-active');
    edgeOf(node)?.classList.add('is-active');
    const name = document.createElement('strong');
    name.textContent = node.getAttribute('aria-label');
    tip.replaceChildren(name, ` · ${node.getAttribute('data-summary')}`);
  }

  // When the pointer leaves, fall back to the node that has keyboard focus, if any.
  const release = () => setActive(nodes.includes(document.activeElement) ? document.activeElement : null);

  for (const node of nodes) {
    node.addEventListener('mouseenter', () => setActive(node));
    node.addEventListener('focus', () => setActive(node));
    node.addEventListener('mouseleave', release);
    node.addEventListener('blur', release);
  }

  /* ---------- 2. Packets ---------- */

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const layer = svg.querySelector('.packets');
  if (!layer) return;

  const FROM_CENTRE = 34;  // start just outside the centre circle (r 30)
  const TO_NODE = 10;      // stop just outside the node dot
  const SPEED = 110;       // viewBox units per second
  const FIRST_TRIP = 1300; // ms: after the edges have drawn in

  // Routes: every edge except the one to the "coming soon" node, which carries no traffic yet.
  const routes = [...svg.querySelectorAll('.edge')]
    .filter((edge) => !svg.querySelector(`a.node--soon[href="#${edge.getAttribute('data-to')}"]`))
    .map((edge) => {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(edge.getAttribute(a)));
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      return {
        ax: x1 + ux * FROM_CENTRE, ay: y1 + uy * FROM_CENTRE,
        bx: x2 - ux * TO_NODE, by: y2 - uy * TO_NODE,
        ms: ((len - FROM_CENTRE - TO_NODE) / SPEED) * 1000,
      };
    });
  if (!routes.length) return;

  let packets = null; // created on first start
  let clock = 0;      // ms of animation time; only advances while running, so a pause never jumps
  let last = null;
  let raf = 0;
  let onScreen = true;

  function makePackets() {
    packets = [0, 1, 2].map((i) => {
      const el = document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('class', 'packet');
      el.setAttribute('r', '3.5');
      el.setAttribute('opacity', '0');
      layer.append(el);
      return { el, route: null, start: 0, outbound: true, next: FIRST_TRIP + i * 1700 };
    });
  }

  const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2);

  function step(p) {
    if (!p.route) {
      if (clock < p.next) return;
      const busy = packets.map((q) => q.route);
      const free = routes.filter((r) => !busy.includes(r));
      p.route = free[Math.floor(Math.random() * free.length)];
      p.outbound = Math.random() < 0.6;
      p.start = clock;
    }
    const k = (clock - p.start) / p.route.ms;
    if (k >= 1) {
      p.route = null;
      p.el.setAttribute('opacity', '0');
      p.next = clock + 900 + Math.random() * 2600; // rest, then pick another edge
      return;
    }
    const e = p.outbound ? easeInOut(k) : 1 - easeInOut(k);
    const r = p.route;
    p.el.setAttribute('cx', (r.ax + (r.bx - r.ax) * e).toFixed(1));
    p.el.setAttribute('cy', (r.ay + (r.by - r.ay) * e).toFixed(1));
    p.el.setAttribute('opacity', Math.min(1, k * 8, (1 - k) * 8).toFixed(2));
  }

  function frame(now) {
    if (last !== null) clock += Math.min(now - last, 100);
    last = now;
    packets.forEach(step);
    raf = window.requestAnimationFrame(frame);
  }

  function update() {
    const run = !reduceMotion.matches && document.visibilityState === 'visible' && onScreen;
    if (run && !raf) {
      if (!packets) makePackets();
      last = null;
      raf = window.requestAnimationFrame(frame);
    } else if (!run && raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
    layer.style.display = reduceMotion.matches ? 'none' : '';
  }

  reduceMotion.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      update();
    }).observe(svg);
  }
  update();
})();
