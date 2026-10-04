// @ts-nocheck
// @zztt/glip-player — glip-players.js
// Uniform adapters over the YouTube IFrame API, the Vimeo Player SDK and
// <video>. Each adapter exposes a synchronous, interpolated clock (`time()`)
// so overlays can be evaluated every animation frame.
//
// Third-party scripts (declared CDN, loaded on demand, once per page):
//   https://www.youtube.com/iframe_api
//   https://player.vimeo.com/api/player.js

export const YT_API_URL = 'https://www.youtube.com/iframe_api';
export const VIMEO_API_URL = 'https://player.vimeo.com/api/player.js';

/**
 * @typedef {{
 *   kind: 'youtube' | 'vimeo' | 'file',
 *   play(): void, pause(): void, toggle(): void, seek(t: number): void,
 *   time(): number, duration(): number, paused(): boolean,
 *   aspect(): number | null, setMuted(m: boolean): void, destroy(): void
 * }} MediaPlayer
 */

/** @type {Map<string, Promise<any>>} */
const scripts = new Map();

/** Loads a global script once; resolves with `window[globalName]`. */
function loadScript(src, globalName, readyHook) {
  const w = /** @type {any} */ (window);
  if (w[globalName] && (!readyHook || w[globalName].Player)) return Promise.resolve(w[globalName]);
  if (scripts.has(src)) return /** @type {Promise<any>} */ (scripts.get(src));
  const p = new Promise((resolve, reject) => {
    if (readyHook) {
      const prev = w[readyHook];
      w[readyHook] = () => { try { prev?.(); } finally { resolve(w[globalName]); } };
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => { if (!readyHook) resolve(w[globalName]); };
    s.onerror = () => { scripts.delete(src); reject(new Error(`could not load ${src}`)); };
    document.head.append(s);
  });
  scripts.set(src, p);
  return p;
}

/** Interpolating clock: smooths coarse provider time reports. */
function makeClock() {
  let base = 0, at = 0, last = -1, playing = false;
  return {
    /** @param {number} t @param {boolean} isPlaying */
    report(t, isPlaying) {
      const now = performance.now();
      if (t !== last || isPlaying !== playing) {
        // Ignore tiny backward corrections while playing (avoids jitter).
        const predicted = playing ? base + (now - at) / 1000 : base;
        if (!(isPlaying && playing && t < predicted && predicted - t < 0.3)) { base = t; at = now; }
        last = t;
      }
      playing = isPlaying;
    },
    /** @param {number} t */
    set(t) { base = t; at = performance.now(); last = t; },
    now() { return playing ? base + (performance.now() - at) / 1000 : base; },
  };
}

function fill(node) {
  node.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';
}

/**
 * @param {HTMLElement} host  positioned container (the player fills it)
 * @param {{ provider: string, id: string, hash?: string, url: string }} source
 * @param {{ start?: number, onstate?: (playing: boolean) => void }} [opts]
 * @returns {Promise<MediaPlayer>}
 */
export function createPlayer(host, source, opts = {}) {
  if (source.provider === 'youtube') return youtube(host, source, opts);
  if (source.provider === 'vimeo') return vimeo(host, source, opts);
  if (source.provider === 'file') return file(host, source, opts);
  return Promise.reject(new Error(`unsupported provider ${source.provider}`));
}

async function youtube(host, source, { start = 0, onstate } = {}) {
  const YT = await loadScript(YT_API_URL, 'YT', 'onYouTubeIframeAPIReady');
  const mount = document.createElement('div');
  host.append(mount);
  const clock = makeClock();
  let state = -1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('YouTube player did not become ready')), 20000);
    const p = new YT.Player(mount, {
      videoId: source.id,
      width: '100%',
      height: '100%',
      playerVars: { controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0, disablekb: 1, start: Math.floor(start), origin: location.origin },
      events: {
        onReady() {
          clearTimeout(timer);
          const iframe = p.getIframe?.();
          if (iframe) { fill(iframe); iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); }
          clock.set(start);
          /** @type {MediaPlayer} */
          const api = {
            kind: 'youtube',
            play: () => p.playVideo(),
            pause: () => p.pauseVideo(),
            toggle: () => (state === 1 || state === 3 ? p.pauseVideo() : p.playVideo()),
            seek: (t) => { p.seekTo(Math.max(0, t), true); clock.set(Math.max(0, t)); },
            time: () => { const t = p.getCurrentTime?.(); if (typeof t === 'number') clock.report(t, state === 1); return clock.now(); },
            duration: () => p.getDuration?.() || 0,
            paused: () => !(state === 1 || state === 3),
            aspect: () => null,
            setMuted: (m) => (m ? p.mute() : p.unMute()),
            destroy: () => { try { p.destroy(); } catch {} mount.remove(); },
          };
          resolve(api);
        },
        onStateChange(e) {
          const wasPlaying = state === 1 || state === 3;
          state = e.data;
          const nowPlaying = state === 1 || state === 3;
          clock.report(p.getCurrentTime?.() || 0, state === 1);
          if (wasPlaying !== nowPlaying) onstate?.(nowPlaying);
        },
        onError(e) { clearTimeout(timer); reject(new Error(`YouTube error ${e?.data}`)); },
      },
    });
  });
}

async function vimeo(host, source, { start = 0, onstate } = {}) {
  const Vimeo = await loadScript(VIMEO_API_URL, 'Vimeo');
  const mount = document.createElement('div');
  fill(mount);
  host.append(mount);
  const p = new Vimeo.Player(mount, {
    url: `https://vimeo.com/${source.id}${source.hash ? `/${source.hash}` : ''}`,
    controls: false,
    playsinline: true,
    dnt: true,
    title: false,
    byline: false,
    portrait: false,
  });
  await p.ready();
  const iframe = mount.querySelector('iframe');
  if (iframe) fill(iframe);
  const clock = makeClock();
  let playing = false;
  let duration = 0;
  let aspect = null;
  try { duration = await p.getDuration(); } catch {}
  try { const [w, h] = await Promise.all([p.getVideoWidth(), p.getVideoHeight()]); if (w && h) aspect = w / h; } catch {}
  p.on('timeupdate', (d) => clock.report(d.seconds, playing));
  p.on('play', () => { playing = true; onstate?.(true); });
  p.on('playing', () => { playing = true; });
  p.on('pause', (d) => { playing = false; clock.report(d?.seconds ?? clock.now(), false); onstate?.(false); });
  p.on('ended', () => { playing = false; onstate?.(false); });
  if (start > 0) { try { await p.setCurrentTime(start); } catch {} }
  clock.set(start);
  return {
    kind: 'vimeo',
    play: () => { p.play().catch(() => {}); },
    pause: () => { p.pause().catch(() => {}); },
    toggle: () => (playing ? p.pause() : p.play()).catch(() => {}),
    seek: (t) => { clock.set(Math.max(0, t)); p.setCurrentTime(Math.max(0, t)).catch(() => {}); },
    time: () => clock.now(),
    duration: () => duration,
    paused: () => !playing,
    aspect: () => aspect,
    setMuted: (m) => { p.setMuted(m).catch(() => {}); },
    destroy: () => { try { p.destroy(); } catch {} mount.remove(); },
  };
}

async function file(host, source, { start = 0, onstate } = {}) {
  const v = document.createElement('video');
  v.src = source.url;
  v.playsInline = true;
  v.preload = 'metadata';
  v.crossOrigin = 'anonymous';
  fill(v);
  v.style.objectFit = 'contain';
  v.style.background = '#000';
  host.append(v);
  await new Promise((resolve, reject) => {
    v.addEventListener('loadedmetadata', resolve, { once: true });
    v.addEventListener('error', () => reject(new Error('could not load video file')), { once: true });
  });
  if (start > 0) v.currentTime = start;
  v.addEventListener('play', () => onstate?.(true));
  v.addEventListener('pause', () => onstate?.(false));
  return {
    kind: 'file',
    play: () => { v.play().catch(() => {}); },
    pause: () => v.pause(),
    toggle: () => (v.paused ? v.play().catch(() => {}) : v.pause()),
    seek: (t) => { v.currentTime = Math.max(0, t); },
    time: () => v.currentTime,
    duration: () => v.duration || 0,
    paused: () => v.paused,
    aspect: () => (v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null),
    setMuted: (m) => { v.muted = m; },
    destroy: () => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); },
  };
}
