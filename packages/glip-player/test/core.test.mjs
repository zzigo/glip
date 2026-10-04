import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTime, formatTime, parseMediaUrl, thumbnailUrl, watchUrl,
  normalizeAnnotation, normalizeShape, normalizeTags, visibleShapes,
  hitTest, translateShape, shapeBBox, cueTimes, summarize, isValidId,
} from '../glip-core.js';

test('parseTime', () => {
  assert.equal(parseTime('90'), 90);
  assert.equal(parseTime('1:30'), 90);
  assert.equal(parseTime('1:02:03.5'), 3723.5);
  assert.equal(parseTime('1m30s'), 90);
  assert.equal(parseTime('1h'), 3600);
  assert.equal(parseTime('45s'), 45);
  assert.equal(parseTime(12.5), 12.5);
  assert.equal(parseTime(''), null);
  assert.equal(parseTime('abc'), null);
  assert.equal(parseTime(-1), null);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(75.34, true), '1:15.3');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(NaN), '0:00');
});

test('parseMediaUrl: YouTube variants', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `youtube.com/watch?v=${id}&list=x`,
    `https://youtu.be/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) {
    const p = parseMediaUrl(u);
    assert.equal(p?.provider, 'youtube', u);
    assert.equal(p?.id, id, u);
    assert.equal(p?.url, `https://www.youtube.com/watch?v=${id}`);
  }
  assert.equal(parseMediaUrl(`https://youtu.be/${id}?t=95`)?.start, 95);
  assert.equal(parseMediaUrl(`https://www.youtube.com/watch?v=${id}&t=1m5s`)?.start, 65);
  const frag = parseMediaUrl(`https://youtu.be/${id}#t=10.5,25`);
  assert.deepEqual([frag?.start, frag?.end], [10.5, 25]);
  assert.equal(parseMediaUrl('https://www.youtube.com/watch?v=short'), null);
});

test('parseMediaUrl: Vimeo (public, unlisted hash, player)', () => {
  assert.deepEqual(parseMediaUrl('https://vimeo.com/76979871'), { provider: 'vimeo', id: '76979871', url: 'https://vimeo.com/76979871', start: null, end: null });
  const unlisted = parseMediaUrl('https://vimeo.com/76979871/abcdef1234');
  assert.equal(unlisted?.hash, 'abcdef1234');
  assert.equal(unlisted?.url, 'https://vimeo.com/76979871/abcdef1234');
  const player = parseMediaUrl('https://player.vimeo.com/video/76979871?h=abcdef1234#t=30s');
  assert.equal(player?.hash, 'abcdef1234');
  assert.equal(player?.start, 30);
  assert.equal(parseMediaUrl('https://vimeo.com/channels/staffpicks/76979871')?.id, '76979871');
});

test('parseMediaUrl: files and rejects', () => {
  assert.equal(parseMediaUrl('https://example.org/a/b.mp4')?.provider, 'file');
  assert.equal(parseMediaUrl('http://example.org/a/b.mp4'), null, 'files must be https');
  assert.equal(parseMediaUrl('javascript:alert(1)'), null);
  assert.equal(parseMediaUrl('https://example.org/page'), null);
  assert.equal(parseMediaUrl('not a url'), null);
  assert.equal(parseMediaUrl(null), null);
});

test('thumbnail and watch URLs', () => {
  assert.equal(thumbnailUrl({ provider: 'youtube', id: 'dQw4w9WgXcQ' }), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  assert.equal(thumbnailUrl({ provider: 'vimeo', id: '1', thumbnail: 'javascript:x' }), '');
  assert.equal(watchUrl({ provider: 'youtube', id: 'dQw4w9WgXcQ' }, 61.7), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61s');
  assert.equal(watchUrl({ provider: 'vimeo', id: '123', hash: 'abcdef' }, 5), 'https://vimeo.com/123/abcdef#t=5s');
});

test('normalizeTags', () => {
  assert.deepEqual(normalizeTags('Fuga, #contrapunto; fuga ,  Bach  '), ['fuga', 'contrapunto', 'bach']);
  assert.deepEqual(normalizeTags(['A', 'a', '', null]), ['a']);
});

test('normalizeShape: repairs and rejects', () => {
  const r = normalizeShape({ kind: 'rect', x: 0.5, y: 0.5, w: -0.2, h: -0.1, t0: 3, t1: 2, color: 'red', width: 999 });
  assert.equal(r?.x, 0.3);
  assert.equal(r?.y, 0.4);
  assert.equal(r?.w, 0.2);
  assert.equal(r?.t1, 3.1, 't1 forced after t0');
  assert.equal(r?.color, '#ff3b30', 'invalid colour → default');
  assert.equal(r?.width, 40);
  assert.equal(normalizeShape({ kind: 'rect', x: 0, y: 0, w: 0, h: 0, t0: 0 }), null, 'degenerate rect');
  assert.equal(normalizeShape({ kind: 'line', pts: [[0, 0]], t0: 0 }), null);
  assert.equal(normalizeShape({ kind: 'text', text: '   ', x: 0, y: 0, t0: 0 }), null);
  assert.equal(normalizeShape({ kind: 'script', t0: 0 }), null);
  const line = normalizeShape({ kind: 'arrow', pts: [[0, 0], [1, 1], [2, 2]], t0: 0, t1: null });
  assert.equal(line?.pts?.length, 2);
  assert.equal(line?.t1, null, 'null t1 = until end of clip');
  assert.ok(normalizeShape({ kind: 'text', text: 'ff\nsub. p', x: 0.1, y: 0.1, t0: 0 })?.text?.includes('\n'));
});

const base = {
  work: 'Die Kunst der Fuge',
  composer: 'J. S. Bach',
  year: '1750',
  tags: 'fuga, contrapunto',
  source: { url: 'https://youtu.be/dQw4w9WgXcQ', aspect: 1.7777, title: 'yt title', thumbnail: 'https://i.ytimg.com/x.jpg' },
  clip: { in: 10, out: 40 },
  shapes: [
    { kind: 'ellipse', x: 0.1, y: 0.1, w: 0.2, h: 0.1, t0: 20, t1: 25 },
    { kind: 'text', text: 'sujeto', x: 0.5, y: 0.5, t0: 12, t1: 30 },
  ],
};

test('normalizeAnnotation: full record', () => {
  const a = normalizeAnnotation(base, { id: 'abc123', now: '2026-10-04T00:00:00.000Z' });
  assert.equal(a.v, 1);
  assert.equal(a.id, 'abc123');
  assert.equal(a.year, 1750);
  assert.deepEqual(a.tags, ['fuga', 'contrapunto']);
  assert.equal(a.source.provider, 'youtube');
  assert.equal(a.source.id, 'dQw4w9WgXcQ');
  assert.equal(a.shapes[0].kind, 'text', 'shapes sorted by t0');
  assert.equal(a.created, '2026-10-04T00:00:00.000Z');
  const again = normalizeAnnotation({ ...a, work: 'x' }, { id: a.id, now: '2026-10-05T00:00:00.000Z', previous: a });
  assert.equal(again.created, a.created, 'created preserved');
  assert.equal(again.updated, '2026-10-05T00:00:00.000Z');
});

test('normalizeAnnotation: clip and source guards', () => {
  const a = normalizeAnnotation({ ...base, clip: { in: 50, out: 20 }, year: 'n/a' });
  assert.equal(a.clip.out, null, 'out <= in → open clip');
  assert.equal(a.year, null);
  assert.ok(isValidId(a.id));
  assert.throws(() => normalizeAnnotation({ source: { url: 'https://evil.example/x' } }));
  assert.throws(() => normalizeAnnotation(null));
  const v = normalizeAnnotation({ source: { provider: 'vimeo', id: '76979871', hash: 'abcdef12' } });
  assert.equal(v.source.url, 'https://vimeo.com/76979871/abcdef12');
});

test('visibility, hit test, translate, bbox, cues, summary', () => {
  const a = normalizeAnnotation(base);
  assert.deepEqual(visibleShapes(a.shapes, 11).length, 0);
  assert.deepEqual(visibleShapes(a.shapes, 21).map((s) => s.kind), ['text', 'ellipse']);
  assert.equal(visibleShapes(a.shapes, 25).length, 1, 't1 is exclusive');
  assert.equal(hitTest(a.shapes, 21, 0.2, 0.15)?.kind, 'ellipse');
  assert.equal(hitTest(a.shapes, 21, 0.9, 0.95), null);
  const moved = translateShape(a.shapes[1], 0.1, -0.05);
  assert.deepEqual([moved.x, moved.y], [0.2, 0.05]);
  const [x0, , x1] = shapeBBox(a.shapes[0], 16 / 9);
  assert.ok(x1 > x0);
  assert.deepEqual(cueTimes(a.shapes, a.clip), [12, 20]);
  const s = summarize(a);
  assert.equal(s.shapeCount, 2);
  assert.equal(s.thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  assert.equal('shapes' in s, false);
});
