// @zztt/glip-player — glip-core.js
// Pure, dependency-free core of the glip annotator: media URL parsing, time
// formatting, the annotation schema (sanitiser) and shape geometry.
// No DOM, no network: safe to import from Node (tests, SvelteKit server),
// browsers and vendored hosts (musiki, so-web).

export const GLIP_SCHEMA_VERSION = 1;

/** Default palette (score-friendly on video: high contrast, distinct hues). */
export const PALETTE = [
  '#ff3b30', // red
  '#ff9500', // orange
  '#ffd60a', // yellow
  '#34c759', // green
  '#00c7be', // teal
  '#0a84ff', // blue
  '#bf5af2', // violet
  '#ff2d92', // magenta
  '#ffffff', // white
  '#111111', // black
];

export const SHAPE_KINDS = ['rect', 'ellipse', 'line', 'arrow', 'free', 'text', 'triangle', 'hairpin', 'serpentine', 'tag'];
export const PROVIDERS = ['youtube', 'vimeo', 'file'];

/** Overlay coordinate system: x ∈ [0, VIEW_W]; y ∈ [0, VIEW_W / aspect]. */
export const VIEW_W = 1000;

const YT_ID = /^[\w-]{11}$/;
const VIDEO_EXT = /\.(mp4|webm|m4v|mov|ogv)$/i;

// ─── time ────────────────────────────────────────────────────────────────

/**
 * Parses a time expression into seconds.
 * Accepts numbers, "90", "90.5", "1:30", "1:02:03.5", "1m30s", "1h2m3s", "90s".
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseTime(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) {
    return s.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
  }
  const m = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s?)?$/);
  if (m && (m[1] || m[2] || m[3])) {
    return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  }
  return null;
}

/**
 * Formats seconds as m:ss (or h:mm:ss). With `precise`, adds tenths.
 * @param {number} seconds
 * @param {boolean} [precise]
 */
export function formatTime(seconds, precise = false) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const tenths = Math.floor((seconds * 10) % 10);
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const ss = String(sec).padStart(2, '0');
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return precise ? `${base}.${tenths}` : base;
}

// ─── media URLs ──────────────────────────────────────────────────────────

/**
 * @typedef {{ provider: 'youtube' | 'vimeo' | 'file', id: string, hash?: string, url: string, start: number | null, end: number | null }} ParsedMedia
 */

/**
 * Recognises YouTube, Vimeo and direct https video-file URLs.
 * Also reads start times (?t=, ?start=, #t=) and W3C media fragments (#t=a,b).
 * @param {unknown} raw
 * @returns {ParsedMedia | null}
 */
export function parseMediaUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /\s/.test(s)) return null;
  let u;
  try {
    u = new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const segs = u.pathname.split('/').filter(Boolean);

  // time hints
  const frag = u.hash.match(/(?:^#|&)t=([^,&]*)(?:,([^&]*))?/);
  let start = parseTime(u.searchParams.get('t') ?? u.searchParams.get('start'));
  let end = parseTime(u.searchParams.get('end'));
  if (frag) {
    start = parseTime(frag[1]) ?? start;
    end = parseTime(frag[2]) ?? end;
  }

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id = '';
    if (host === 'youtu.be') id = segs[0] || '';
    else if (segs[0] === 'watch') id = u.searchParams.get('v') || '';
    else if (['embed', 'shorts', 'live', 'v'].includes(segs[0])) id = segs[1] || '';
    if (!YT_ID.test(id)) return null;
    return { provider: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, start, end };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const idx = segs.findIndex((p) => /^\d{5,}$/.test(p));
    if (idx < 0) return null;
    const id = segs[idx];
    const next = segs[idx + 1];
    const hash = u.searchParams.get('h') || (next && /^[0-9a-f]{6,}$/i.test(next) ? next : '');
    /** @type {ParsedMedia} */
    const out = { provider: 'vimeo', id, url: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}`, start, end };
    if (hash) out.hash = hash;
    return out;
  }

  if (u.protocol === 'https:' && VIDEO_EXT.test(u.pathname)) {
    u.hash = '';
    return { provider: 'file', id: u.href, url: u.href, start, end };
  }
  return null;
}

/**
 * Thumbnail URL for a source (YouTube is derivable; others need a stored one).
 * @param {{ provider?: string, id?: string, thumbnail?: string } | null | undefined} source
 */
export function thumbnailUrl(source) {
  if (!source) return '';
  if (source.provider === 'youtube' && YT_ID.test(String(source.id))) {
    return `https://i.ytimg.com/vi/${source.id}/mqdefault.jpg`;
  }
  return typeof source.thumbnail === 'string' && /^https:\/\//.test(source.thumbnail) ? source.thumbnail : '';
}

/**
 * Canonical "watch" URL with the clip start, for "open in YouTube/Vimeo".
 * @param {{ provider: string, id: string, hash?: string, url?: string }} source
 * @param {number} [at]
 */
export function watchUrl(source, at = 0) {
  const t = Math.max(0, Math.floor(at || 0));
  if (source.provider === 'youtube') return `https://www.youtube.com/watch?v=${source.id}${t ? `&t=${t}s` : ''}`;
  if (source.provider === 'vimeo') return `https://vimeo.com/${source.id}${source.hash ? `/${source.hash}` : ''}${t ? `#t=${t}s` : ''}`;
  return `${source.url || source.id}${t ? `#t=${t}` : ''}`;
}

// ─── schema / sanitiser ──────────────────────────────────────────────────

/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/** @param {unknown} v @param {number} [d] */
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
/** @param {number} n */
const r4 = (n) => Math.round(n * 10000) / 10000;
/** @param {number} n */
const r2 = (n) => Math.round(n * 100) / 100;
/** @param {unknown} v @param {number} [max] */
const str = (v, max = 300) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
/** @param {unknown} v */
const coord = (v) => r4(clamp(num(v), -0.25, 1.25));
const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Short random id (base36). */
export function makeId(len = 10) {
  let out = '';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}

/** @param {unknown} v */
export function isValidId(v) {
  return typeof v === 'string' && ID.test(v);
}

/** @param {unknown} raw */
export function normalizeTags(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,;#\n]/) : [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const tag = str(t, 48).toLowerCase().replace(/\s+/g, ' ');
    if (tag && !seen.has(tag)) { seen.add(tag); out.push(tag); }
    if (out.length >= 32) break;
  }
  return out;
}

/**
 * @typedef {{
 *   id: string, kind: 'rect'|'ellipse'|'line'|'arrow'|'free'|'text'|'triangle'|'hairpin'|'serpentine'|'tag',
 *   t0: number, t1: number | null, color: string, width: number, fill?: boolean,
 *   x?: number, y?: number, w?: number, h?: number, rotation?: number, opacity?: number,
 *   pts?: [number, number][], text?: string, size?: number, waves?: number
 * }} Shape
 */

/**
 * Sanitises one shape. Returns null when it cannot be repaired.
 * @param {any} s
 * @returns {Shape | null}
 */
export function normalizeShape(s) {
  if (!s || typeof s !== 'object' || !SHAPE_KINDS.includes(s.kind)) return null;
  const t0 = r2(Math.max(0, num(s.t0)));
  let t1 = s.t1 == null ? null : r2(num(s.t1, t0 + 3));
  if (t1 != null && t1 <= t0) t1 = r2(t0 + 0.1);
  /** @type {Shape} */
  const out = {
    id: isValidId(s.id) ? s.id : makeId(8),
    kind: s.kind,
    t0,
    t1,
    color: typeof s.color === 'string' && COLOR.test(s.color) ? s.color.toLowerCase() : PALETTE[0],
    width: r2(clamp(num(s.width, 4), 0.5, 40)),
  };
  if (s.rotation != null && Number.isFinite(Number(s.rotation))) {
    out.rotation = r2(num(s.rotation) % 360);
  }
  if (s.opacity != null && Number.isFinite(Number(s.opacity))) {
    out.opacity = r2(clamp(num(s.opacity, 1), 0.05, 1));
  }
  if (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'triangle' || s.kind === 'hairpin' || s.kind === 'serpentine' || s.kind === 'tag') {
    let x = coord(s.x), y = coord(s.y), w = num(s.w), h = num(s.h);
    if (w < 0) { x = coord(x + w); w = -w; }
    if (h < 0) { y = coord(y + h); h = -h; }
    out.x = x; out.y = y; out.w = r4(clamp(w, 0, 1.5)); out.h = r4(clamp(h, 0, 1.5));
    if (out.w < 0.002 && out.h < 0.002 && s.kind !== 'tag') return null;
    if (s.fill) out.fill = true;
    if (s.kind === 'serpentine') {
      out.waves = Math.round(clamp(num(s.waves, 8), 1, 40));
    }
    if (s.kind === 'tag') {
      out.text = str(s.text || 'Tag', 100);
    }
  } else if (s.kind === 'line' || s.kind === 'arrow' || s.kind === 'free') {
    const pts = Array.isArray(s.pts) ? s.pts : [];
    const clean = [];
    for (const p of pts.slice(0, 4000)) {
      if (Array.isArray(p) && p.length >= 2) clean.push([coord(p[0]), coord(p[1])]);
    }
    if (s.kind !== 'free') clean.splice(2);
    if (clean.length < 2) return null;
    out.pts = /** @type {[number, number][]} */ (clean);
  } else if (s.kind === 'text') {
    const text = str(s.text, 500).replace(/\r/g, '');
    if (!text) return null;
    out.x = coord(s.x); out.y = coord(s.y);
    out.text = text;
    out.size = r2(clamp(num(s.size, 40), 8, 240));
    if (s.fill) out.fill = true; // boxed text (dark plate behind)
  }
  return out;
}

/**
 * @typedef {{
 *   provider: 'youtube'|'vimeo'|'file', id: string, hash?: string, url: string,
 *   aspect: number, duration?: number | null, title?: string, author?: string, thumbnail?: string
 * }} Source
 *
 * @typedef {{
 *   v: number, id: string, title: string, work: string, composer: string,
 *   year: number | null, tags: string[], performer: string, notes: string,
 *   source: Source, clip: { in: number, out: number | null },
 *   shapes: Shape[], created: string, updated: string
 * }} Annotation
 */

/**
 * Sanitises a whole annotation (used server-side on every write, and by the
 * player before rendering untrusted JSON). Throws on unrecoverable input.
 * @param {any} input
 * @param {{ id?: string, now?: string, previous?: Partial<Annotation> | null }} [opts]
 * @returns {Annotation}
 */
export function normalizeAnnotation(input, opts = {}) {
  if (!input || typeof input !== 'object') throw new Error('annotation must be an object');
  const src = input.source || {};
  const parsed = parseMediaUrl(src.url || (src.provider === 'youtube' ? `https://youtu.be/${src.id}` : src.provider === 'vimeo' ? `https://vimeo.com/${src.id}${src.hash ? `/${src.hash}` : ''}` : ''));
  if (!parsed) throw new Error('source.url is not a supported YouTube / Vimeo / https video URL');
  const aspect = clamp(num(src.aspect, 16 / 9), 0.3, 4);
  /** @type {Source} */
  const source = { provider: parsed.provider, id: parsed.id, url: parsed.url, aspect: r4(aspect) };
  if (parsed.hash) source.hash = parsed.hash;
  const duration = num(src.duration, 0);
  if (duration > 0) source.duration = r2(duration);
  for (const k of /** @type {const} */ (['title', 'author'])) {
    const v = str(src[k], 300);
    if (v) source[k] = v;
  }
  if (typeof src.thumbnail === 'string' && /^https:\/\/[^\s"'<>]+$/.test(src.thumbnail)) source.thumbnail = src.thumbnail.slice(0, 500);

  const clipIn = r2(Math.max(0, num(input.clip?.in, 0)));
  let clipOut = input.clip?.out == null || input.clip?.out === '' ? null : r2(num(input.clip.out, 0));
  if (clipOut != null && clipOut <= clipIn) clipOut = null;

  const yearNum = Math.round(num(input.year, NaN));
  const shapes = [];
  for (const s of Array.isArray(input.shapes) ? input.shapes.slice(0, 3000) : []) {
    const n = normalizeShape(s);
    if (n) shapes.push(n);
  }
  shapes.sort((a, b) => a.t0 - b.t0);
  const ids = new Set();
  for (const s of shapes) { while (ids.has(s.id)) s.id = makeId(8); ids.add(s.id); }

  const now = opts.now || new Date().toISOString();
  const id = opts.id || (isValidId(input.id) ? input.id : makeId());
  return {
    v: GLIP_SCHEMA_VERSION,
    id,
    title: str(input.title, 200),
    work: str(input.work, 200),
    composer: str(input.composer, 200),
    year: Number.isFinite(yearNum) && yearNum > -3000 && yearNum < 3000 ? yearNum : null,
    tags: normalizeTags(input.tags),
    performer: str(input.performer, 200),
    notes: str(input.notes, 20000),
    source,
    clip: { in: clipIn, out: clipOut },
    shapes,
    created: (opts.previous && typeof opts.previous.created === 'string' && opts.previous.created) || (typeof input.created === 'string' && input.created) || now,
    updated: now,
  };
}

/**
 * Light listing record (no shapes / notes) for lists and indexes.
 * @param {Annotation} a
 */
export function summarize(a) {
  return {
    id: a.id,
    title: a.title,
    work: a.work,
    composer: a.composer,
    year: a.year,
    tags: a.tags,
    performer: a.performer,
    provider: a.source.provider,
    url: a.source.url,
    thumbnail: thumbnailUrl(a.source),
    clip: a.clip,
    shapeCount: a.shapes.length,
    updated: a.updated,
  };
}

// ─── geometry ────────────────────────────────────────────────────────────

/** @param {number} aspect */
export function viewHeight(aspect) {
  return r2(VIEW_W / (aspect > 0 ? aspect : 16 / 9));
}

/**
 * Shapes visible at time t.
 * @param {Shape[]} shapes
 * @param {number} t
 */
export function visibleShapes(shapes, t) {
  return shapes.filter((s) => s.t0 <= t + 1e-6 && (s.t1 == null || t < s.t1));
}

/**
 * Normalised bounding box [x0, y0, x1, y1] of a shape.
 * @param {Shape} s
 * @param {number} aspect
 */
export function shapeBBox(s, aspect = 16 / 9) {
  if (s.pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }
  if (s.kind === 'text') {
    const size = (s.size || 40) / VIEW_W; // fraction of width
    const lines = String(s.text || '').split('\n');
    const longest = Math.max(...lines.map((l) => l.length), 1);
    const w = longest * size * 0.56;
    const h = lines.length * size * 1.2 * aspect;
    return [s.x || 0, s.y || 0, (s.x || 0) + w, (s.y || 0) + h];
  }
  return [s.x || 0, s.y || 0, (s.x || 0) + (s.w || 0), (s.y || 0) + (s.h || 0)];
}

/**
 * Topmost visible shape under the normalised point, or null.
 * @param {Shape[]} shapes
 * @param {number} t
 * @param {number} nx
 * @param {number} ny
 * @param {number} [aspect]
 * @param {number} [tol]
 */
export function hitTest(shapes, t, nx, ny, aspect = 16 / 9, tol = 0.015) {
  const vis = visibleShapes(shapes, t);
  for (let i = vis.length - 1; i >= 0; i--) {
    const [x0, y0, x1, y1] = shapeBBox(vis[i], aspect);
    if (nx >= x0 - tol && nx <= x1 + tol && ny >= y0 - tol * aspect && ny <= y1 + tol * aspect) return vis[i];
  }
  return null;
}

/**
 * Returns a moved copy of a shape.
 * @param {Shape} s
 * @param {number} dx
 * @param {number} dy
 * @returns {Shape}
 */
export function translateShape(s, dx, dy) {
  const out = { ...s };
  if (s.pts) out.pts = s.pts.map(([x, y]) => [r4(x + dx), r4(y + dy)]);
  if (s.x != null) out.x = r4(s.x + dx);
  if (s.y != null) out.y = r4(s.y + dy);
  return out;
}

/**
 * Arrow-head polygon points (overlay units) for a segment ending at (x1, y1).
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} [width]
 * @returns {string}
 */
export function arrowHeadPoints(x0, y0, x1, y1, width = 4) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.max(12, width * 4.2);
  const spread = Math.PI / 7;
  const a = [x1 - len * Math.cos(ang - spread), y1 - len * Math.sin(ang - spread)];
  const b = [x1 - len * Math.cos(ang + spread), y1 - len * Math.sin(ang + spread)];
  return [[x1, y1], a, b].map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
}

/**
 * Distinct cue times (shape starts) inside the clip, for marker strips.
 * @param {Shape[]} shapes
 * @param {{ in: number, out: number | null }} clip
 */
export function cueTimes(shapes, clip) {
  const out = [];
  for (const s of shapes) {
    if (s.t0 < clip.in - 1e-6 || (clip.out != null && s.t0 > clip.out)) continue;
    if (!out.length || Math.abs(out[out.length - 1] - s.t0) > 0.05) out.push(s.t0);
  }
  return out;
}
