// @zztt/glip-player — glip-overlay.js
// Renders annotation shapes into an <svg> whose viewBox is 1000 × 1000/aspect,
// so strokes and text scale with the video ("respect video size").
// DOM only (createElementNS + textContent); never innerHTML.

import { VIEW_W, viewHeight, arrowHeadPoints, shapeBBox } from './glip-core.js';

const NS = 'http://www.w3.org/2000/svg';

/** @param {string} tag @param {Record<string, string | number>} attrs */
function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Sets up an overlay <svg> for an aspect ratio.
 * @param {SVGSVGElement} svg
 * @param {number} aspect
 */
export function prepareOverlay(svg, aspect) {
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${viewHeight(aspect)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
}

/**
 * Creates the SVG node for one shape.
 * @param {import('./glip-core.js').Shape} s
 * @param {number} aspect
 * @param {{ selected?: boolean, draft?: boolean }} [opts]
 */
export function shapeNode(s, aspect, opts = {}) {
  const W = VIEW_W;
  const H = viewHeight(aspect);
  const stroke = { stroke: s.color, 'stroke-width': s.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const g = el('g', { 'data-id': s.id, class: `glip-shape glip-${s.kind}${opts.draft ? ' is-draft' : ''}` });

  if (s.kind === 'rect') {
    g.append(el('rect', { x: (s.x || 0) * W, y: (s.y || 0) * H, width: (s.w || 0) * W, height: (s.h || 0) * H, fill: s.fill ? s.color : 'none', 'fill-opacity': s.fill ? 0.28 : 0, ...stroke }));
  } else if (s.kind === 'ellipse') {
    const rx = ((s.w || 0) * W) / 2;
    const ry = ((s.h || 0) * H) / 2;
    g.append(el('ellipse', { cx: (s.x || 0) * W + rx, cy: (s.y || 0) * H + ry, rx, ry, fill: s.fill ? s.color : 'none', 'fill-opacity': s.fill ? 0.28 : 0, ...stroke }));
  } else if (s.kind === 'line' || s.kind === 'arrow') {
    const [[ax, ay], [bx, by]] = /** @type {[number, number][]} */ (s.pts);
    const x0 = ax * W, y0 = ay * H, x1 = bx * W, y1 = by * H;
    g.append(el('line', { x1: x0, y1: y0, x2: x1, y2: y1, fill: 'none', ...stroke }));
    if (s.kind === 'arrow') g.append(el('polygon', { points: arrowHeadPoints(x0, y0, x1, y1, s.width), fill: s.color, stroke: s.color, 'stroke-width': Math.max(1, s.width / 2), 'stroke-linejoin': 'round' }));
  } else if (s.kind === 'free') {
    const pts = /** @type {[number, number][]} */ (s.pts).map(([x, y]) => `${Math.round(x * W * 10) / 10},${Math.round(y * H * 10) / 10}`).join(' ');
    g.append(el('polyline', { points: pts, fill: 'none', ...stroke }));
  } else if (s.kind === 'text') {
    const size = s.size || 40;
    const x = (s.x || 0) * W;
    const y = (s.y || 0) * H;
    const lines = String(s.text || '').split('\n');
    if (s.fill) {
      const [bx0, by0, bx1, by1] = shapeBBox(s, aspect);
      const pad = size * 0.25;
      g.append(el('rect', { x: bx0 * W - pad, y: by0 * H - pad, width: (bx1 - bx0) * W + pad * 2, height: (by1 - by0) * H + pad * 2, fill: '#000', 'fill-opacity': 0.55, rx: size * 0.15 }));
    }
    const text = el('text', {
      x, y,
      'font-size': size,
      'font-family': 'Georgia, "Times New Roman", serif',
      'dominant-baseline': 'hanging',
      fill: s.color,
      stroke: s.fill ? 'none' : '#000',
      'stroke-opacity': 0.55,
      'stroke-width': size * 0.12,
      'paint-order': 'stroke',
      'stroke-linejoin': 'round',
    });
    lines.forEach((line, i) => {
      const t = el('tspan', { x, dy: i === 0 ? 0 : size * 1.2 });
      t.textContent = line || '\u00a0';
      text.append(t);
    });
    g.append(text);
  }

  if (opts.selected) {
    const [x0, y0, x1, y1] = shapeBBox(s, aspect);
    const pad = 6;
    g.append(el('rect', { x: x0 * W - pad, y: y0 * H - pad, width: (x1 - x0) * W + pad * 2, height: (y1 - y0) * H + pad * 2, fill: 'none', stroke: '#fff', 'stroke-width': 1.5, 'stroke-dasharray': '6 5', class: 'glip-selection' }));
  }
  return g;
}

/**
 * Replaces the overlay content with the given (already time-filtered) shapes.
 * @param {SVGSVGElement} svg
 * @param {import('./glip-core.js').Shape[]} shapes
 * @param {number} aspect
 * @param {{ selectedId?: string | null, draft?: import('./glip-core.js').Shape | null }} [opts]
 */
export function renderShapes(svg, shapes, aspect, opts = {}) {
  const frag = document.createDocumentFragment();
  for (const s of shapes) frag.append(shapeNode(s, aspect, { selected: s.id === opts.selectedId }));
  if (opts.draft) frag.append(shapeNode(opts.draft, aspect, { draft: true }));
  svg.replaceChildren(frag);
}

/**
 * Cheap signature of a visible set, to skip redundant re-renders per frame.
 * @param {any[]} shapes
 * @param {string} [extra]
 */
export function overlaySignature(shapes, extra = '') {
  let s = extra;
  for (const sh of shapes) s += `|${sh.id}`;
  return s;
}
