// @ts-nocheck
// @zztt/glip-player — glip-player.js
// <glip-player>: framework-free custom element that plays a glip annotation
// (YouTube / Vimeo / video file + timed SVG overlay + clip in/out).
//
// Data, in priority order:
//   1. `el.annotation = {...}` (property)
//   2. a child <script type="application/json"> with the annotation
//   3. `src` attribute: SAME-ORIGIN path to the annotation JSON (e.g. a host
//      proxy such as musiki's /api/glip/annotations/<id>). Cross-origin URLs
//      are refused with a visible error and no request is made — for other
//      origins (Obsidian, any page) use the iframe: https://<glip>/embed/<id>.
//
// Attributes: src, autoplay, loop, muted, meta ("none" | "top" | "bottom"),
//             bridge (postMessage API to window.parent, used by /embed).
// Events:     glip:ready {detail: annotation}, glip:state {playing, t}, glip:error.

import { normalizeAnnotation, visibleShapes, formatTime, cueTimes, watchUrl } from './glip-core.js';
import { prepareOverlay, renderShapes, overlaySignature } from './glip-overlay.js';
import { createPlayer } from './glip-players.js';

export const GLIP_PLAYER_VERSION = '0.1.0';

/** Same rule as the other zztt plugins: "/path" but not "//host" or "/\host". */
export function isSameOriginPath(value, base = typeof location !== 'undefined' ? location.href : 'https://x.invalid/') {
  if (typeof value !== 'string' || !/^\/(?![/\\])/.test(value) || /[\s\u0000-\u001f\\]/.test(value)) return false;
  try { return new URL(value, base).origin === new URL(base).origin; } catch { return false; }
}

const CSS = `
:host{display:block;position:relative;color:var(--glip-ink,#f5f5f5);font:13px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-tap-highlight-color:transparent}
.meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:8px 2px;color:var(--glip-meta-ink,currentColor)}
.meta[hidden]{display:none}
.meta strong{font:600 17px/1.2 Georgia,serif}
.meta span{opacity:.7;font-size:11px}
.meta a{color:inherit;opacity:.6;font-size:11px;margin-left:auto}
.stage{position:relative;width:100%;aspect-ratio:var(--ar,16/9);background:#000;overflow:hidden;border-radius:var(--glip-radius,0)}
.media{position:absolute;inset:0}
svg.ov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;filter:drop-shadow(0 0 1.2px rgba(0,0,0,.55))}
.msg{position:absolute;inset:0;display:grid;place-content:center;padding:16px;text-align:center;color:#ddd;background:#111;font-size:12px}
.msg[hidden]{display:none}
.bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:18px 10px 8px;background:linear-gradient(transparent,rgba(0,0,0,.72));color:#fff;transition:opacity .25s;opacity:1}
.stage.playing:not(:hover):not(:focus-within) .bar{opacity:0}
.bar button{flex:0 0 auto;width:34px;height:34px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;color:#fff;background:rgba(255,255,255,.14);cursor:pointer}
.bar button:focus-visible,.bar input:focus-visible{outline:2px solid #fff;outline-offset:2px}
.bar svg{width:16px;height:16px;fill:currentColor}
.t{flex:0 0 auto;font-size:11px;font-variant-numeric:tabular-nums;opacity:.9}
.track{position:relative;flex:1;height:26px;display:flex;align-items:center}
.cues{position:absolute;left:0;right:0;top:2px;height:5px;pointer-events:none}
.cues i{position:absolute;top:0;width:2px;height:5px;margin-left:-1px;background:var(--glip-cue,#ffd60a);border-radius:1px}
input[type=range]{width:100%;margin:0;accent-color:var(--glip-accent,#ffd60a);cursor:pointer;background:transparent}
`;

const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

export class GlipPlayerElement extends HTMLElement {
  static get observedAttributes() { return ['src']; }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
      <header class="meta" part="meta" hidden><strong></strong><span class="who"></span><span class="tags"></span><a target="_blank" rel="noopener noreferrer">↗</a></header>
      <div class="stage" part="stage">
        <div class="media"></div>
        <svg class="ov" aria-hidden="true"></svg>
        <div class="msg" hidden></div>
        <div class="bar" part="bar">
          <button type="button" class="play" aria-label="Play">${ICON_PLAY}</button>
          <span class="t now">0:00</span>
          <div class="track"><div class="cues"></div><input type="range" min="0" max="1" step="0.05" value="0" aria-label="Seek"></div>
          <span class="t dur">0:00</span>
        </div>
      </div>`;
    this._$ = (sel) => root.querySelector(sel);
    /** @type {import('./glip-core.js').Annotation | null} */
    this._data = null;
    /** @type {import('./glip-players.js').MediaPlayer | null} */
    this._player = null;
    this._raf = 0;
    this._sig = '';
    this._lastUi = 0;
    this._scrubbing = false;
    this._gen = 0;
    this.ready = new Promise((r) => (this._resolveReady = r));
    this._onMessage = this._onMessage.bind(this);
  }

  /** @param {any} value */
  set annotation(value) { this._load(value); }
  get annotation() { return this._data; }

  connectedCallback() {
    const $ = this._$;
    $('.play').addEventListener('click', () => this.toggle());
    const range = $('input[type=range]');
    range.addEventListener('pointerdown', () => (this._scrubbing = true));
    range.addEventListener('pointerup', () => (this._scrubbing = false));
    range.addEventListener('input', () => this.seek(Number(range.value)));
    range.addEventListener('change', () => (this._scrubbing = false));
    this.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.key !== ' ') return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowRight') this.seek(this.currentTime + (e.shiftKey ? 5 : 1));
      else if (e.key === 'ArrowLeft') this.seek(this.currentTime - (e.shiftKey ? 5 : 1));
    });
    if (this.hasAttribute('bridge')) window.addEventListener('message', this._onMessage);
    if (!this._data) {
      const inline = this.querySelector('script[type="application/json"]');
      if (inline?.textContent) {
        try { this._load(JSON.parse(inline.textContent)); } catch (e) { this._error('Invalid inline annotation JSON'); }
      } else if (this.getAttribute('src')) this._fetch(this.getAttribute('src'));
    }
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('message', this._onMessage);
    this._player?.destroy();
    this._player = null;
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === 'src' && this.isConnected && newV && newV !== oldV && oldV != null) this._fetch(newV);
  }

  get currentTime() { return this._player ? this._player.time() : this._data?.clip.in || 0; }
  get paused() { return this._player ? this._player.paused() : true; }

  play() {
    const p = this._player, c = this._data?.clip;
    if (!p || !c) return;
    const t = p.time();
    if (t < c.in - 0.25 || (c.out != null && t >= c.out - 0.05)) p.seek(c.in);
    p.play();
  }
  pause() { this._player?.pause(); }
  toggle() { this.paused ? this.play() : this.pause(); }
  /** @param {number} t */
  seek(t) {
    const c = this._data?.clip;
    if (!this._player || !c) return;
    const hi = c.out ?? (this._player.duration() || Infinity);
    this._player.seek(Math.min(Math.max(t, c.in), hi));
  }

  async _fetch(src) {
    if (!isSameOriginPath(src)) return this._error('glip-player: src must be a same-origin path (use the /embed iframe for other origins)');
    try {
      const res = await fetch(src, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._load(await res.json());
    } catch (e) {
      this._error(`Could not load annotation (${e instanceof Error ? e.message : e})`);
    }
  }

  _error(message) {
    const msg = this._$('.msg');
    msg.textContent = message;
    msg.hidden = false;
    this.dispatchEvent(new CustomEvent('glip:error', { detail: { message } }));
  }

  async _load(raw) {
    let a;
    try { a = normalizeAnnotation(raw?.annotation ?? raw, { id: raw?.id, now: raw?.updated }); }
    catch (e) { return this._error(`Invalid annotation: ${e instanceof Error ? e.message : e}`); }
    const gen = ++this._gen;
    this._data = a;
    this._player?.destroy();
    this._player = null;
    cancelAnimationFrame(this._raf);
    const $ = this._$;
    $('.msg').hidden = true;
    const stage = $('.stage');
    stage.style.setProperty('--ar', String(a.source.aspect));
    this.style.setProperty('--ar', String(a.source.aspect));
    prepareOverlay($('svg.ov'), a.source.aspect);
    this._sig = '';

    // meta
    const metaMode = this.getAttribute('meta') || 'none';
    const meta = $('.meta');
    meta.hidden = metaMode === 'none';
    if (metaMode === 'bottom') this.shadowRoot.append(meta); else this.shadowRoot.insertBefore(meta, stage);
    meta.querySelector('strong').textContent = a.work || a.title || a.source.title || 'glip';
    meta.querySelector('.who').textContent = [a.composer, a.year, a.performer].filter(Boolean).join(' · ');
    meta.querySelector('.tags').textContent = a.tags.map((t) => `#${t}`).join(' ');
    meta.querySelector('a').href = watchUrl(a.source, a.clip.in);

    // cues + range
    const range = $('input[type=range]');
    range.min = String(a.clip.in);
    range.value = String(a.clip.in);
    this._renderCues();

    try {
      const player = await createPlayer($('.media'), a.source, {
        start: a.clip.in,
        onstate: (playing) => {
          stage.classList.toggle('playing', playing);
          const btn = $('.play');
          btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
          btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
          const detail = { playing, t: this.currentTime };
          this.dispatchEvent(new CustomEvent('glip:state', { detail }));
          this._post({ glip: 'state', id: a.id, ...detail });
        },
      });
      if (gen !== this._gen) return player.destroy();
      this._player = player;
      if (this.hasAttribute('muted')) player.setMuted(true);
      if (this.hasAttribute('autoplay')) { if (!this.hasAttribute('muted')) player.setMuted(true); player.play(); }
      this._renderCues();
      this._loop();
      this._resolveReady(a);
      this.dispatchEvent(new CustomEvent('glip:ready', { detail: a }));
      this._post({ glip: 'ready', id: a.id, version: GLIP_PLAYER_VERSION, meta: { title: a.title, work: a.work, composer: a.composer, year: a.year, tags: a.tags, performer: a.performer, clip: a.clip, source: a.source } });
    } catch (e) {
      this._error(`Could not start the player (${e instanceof Error ? e.message : e})`);
    }
  }

  _clipOut() {
    const a = this._data;
    if (!a) return 0;
    return a.clip.out ?? (this._player?.duration() || a.source.duration || 0);
  }

  _renderCues() {
    const a = this._data;
    if (!a) return;
    const $ = this._$;
    const out = this._clipOut();
    $('input[type=range]').max = String(out || a.clip.in + 1);
    $('.dur').textContent = formatTime(Math.max(0, out - a.clip.in));
    const box = $('.cues');
    box.replaceChildren();
    const span = out - a.clip.in;
    if (span <= 0) return;
    for (const t of cueTimes(a.shapes, a.clip)) {
      const i = document.createElement('i');
      i.style.left = `${((t - a.clip.in) / span) * 100}%`;
      box.append(i);
    }
  }

  _loop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const p = this._player, a = this._data;
      if (!p || !a) return;
      const t = p.time();
      const out = a.clip.out;
      if (!p.paused()) {
        if (out != null && t >= out) {
          if (this.hasAttribute('loop')) p.seek(a.clip.in);
          else { p.pause(); p.seek(out - 0.04); }
        } else if (t < a.clip.in - 0.5) p.seek(a.clip.in);
      }
      const vis = visibleShapes(a.shapes, t);
      const sig = overlaySignature(vis);
      if (sig !== this._sig) { this._sig = sig; renderShapes(this._$('svg.ov'), vis, a.source.aspect); }
      const now = performance.now();
      if (now - this._lastUi > 120) {
        this._lastUi = now;
        this._$('.now').textContent = formatTime(Math.max(0, t - a.clip.in));
        if (!this._scrubbing) this._$('input[type=range]').value = String(t);
        if (a.clip.out == null && this._$('input[type=range]').max === String(a.clip.in + 1)) this._renderCues();
        if (!p.paused()) this._post({ glip: 'time', id: a.id, t });
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  _post(msg) {
    if (!this.hasAttribute('bridge') || window.parent === window) return;
    try { window.parent.postMessage(msg, '*'); } catch {}
  }

  /** postMessage commands: {glip:'play'|'pause'|'toggle'} | {glip:'seek', t} | {glip:'get'} */
  _onMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object' || typeof d.glip !== 'string') return;
    if (d.glip === 'play') this.play();
    else if (d.glip === 'pause') this.pause();
    else if (d.glip === 'toggle') this.toggle();
    else if (d.glip === 'seek' && Number.isFinite(d.t)) this.seek(Number(d.t));
    else if (d.glip === 'get' && this._data) this._post({ glip: 'annotation', id: this._data.id, annotation: this._data });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('glip-player')) {
  customElements.define('glip-player', GlipPlayerElement);
}
