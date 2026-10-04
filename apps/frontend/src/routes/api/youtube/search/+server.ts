import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const SEARCH_LIMIT = 8;

const normalizeText = (value: unknown) => String(value ?? '').trim();

const readYouTubeApiKey = () =>
	normalizeText(env.YOUTUBE_DATA_API_KEY) ||
	normalizeText(env.YOUTUBE_API_KEY) ||
	normalizeText(env.GOOGLE_API_KEY);

const decodeHtml = (html: string) => {
	return html
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
};

const findBalancedJson = (source: string, marker: string) => {
	const markerIndex = source.indexOf(marker);
	if (markerIndex < 0) return '';
	const start = source.indexOf('{', markerIndex);
	if (start < 0) return '';

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < source.length; index += 1) {
		const char = source[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
		} else if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(start, index + 1);
		}
	}

	return '';
};

const collectYouTubeRenderers = (value: any, out: any[] = []) => {
	if (!value || out.length >= SEARCH_LIMIT) return out;
	if (Array.isArray(value)) {
		for (const item of value) {
			collectYouTubeRenderers(item, out);
			if (out.length >= SEARCH_LIMIT) break;
		}
		return out;
	}
	if (typeof value !== 'object') return out;

	if (value.videoRenderer?.videoId) {
		out.push(value.videoRenderer);
		return out;
	}

	for (const child of Object.values(value)) {
		collectYouTubeRenderers(child, out);
		if (out.length >= SEARCH_LIMIT) break;
	}
	return out;
};

const parseYouTubeText = (value: any) =>
	normalizeText(value?.simpleText) ||
	normalizeText(Array.isArray(value?.runs) ? value.runs.map((run: any) => normalizeText(run?.text)).join('') : '');

const searchYouTubeWithoutApiKey = async (q: string) => {
	const requestUrl = new URL('https://www.youtube.com/results');
	requestUrl.searchParams.set('search_query', q);
	requestUrl.searchParams.set('sp', 'EgIQAQ==');
	requestUrl.searchParams.set('hl', 'es');

	const response = await fetch(requestUrl, {
		headers: {
			Accept: 'text/html',
			'Accept-Language': 'es,en;q=0.8',
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		}
	});
	if (!response.ok) throw new Error('YouTube search fallback failed');

	const html = await response.text();
	const rawJson = findBalancedJson(html, 'ytInitialData');
	if (!rawJson) throw new Error('YouTube search fallback returned no data');

	const data = JSON.parse(rawJson);
	return collectYouTubeRenderers(data)
		.map((renderer: any) => {
			const mediaId = normalizeText(renderer?.videoId);
			if (!mediaId) return null;
			return {
				mediaId,
				title: decodeHtml(parseYouTubeText(renderer?.title) || 'YouTube Video'),
				channelTitle: decodeHtml(
					parseYouTubeText(renderer?.ownerText) ||
						parseYouTubeText(renderer?.longBylineText) ||
						parseYouTubeText(renderer?.shortBylineText) ||
						''
				),
				publishedAt: parseYouTubeText(renderer?.publishedTimeText),
				thumbnailUrl: normalizeText(renderer?.thumbnail?.thumbnails?.at?.(-1)?.url)
			};
		})
		.filter(Boolean);
};

export const GET: RequestHandler = async ({ url }) => {
	const q = normalizeText(url.searchParams.get('q'));
	if (q.length < 2) {
		return json({ items: [] });
	}

	const apiKey = readYouTubeApiKey();

	if (apiKey) {
		try {
			const reqUrl = new URL('https://www.googleapis.com/youtube/v3/search');
			reqUrl.searchParams.set('key', apiKey);
			reqUrl.searchParams.set('part', 'snippet');
			reqUrl.searchParams.set('type', 'video');
			reqUrl.searchParams.set('videoEmbeddable', 'true');
			reqUrl.searchParams.set('safeSearch', 'moderate');
			reqUrl.searchParams.set('maxResults', String(SEARCH_LIMIT));
			reqUrl.searchParams.set('q', q);

			const res = await fetch(reqUrl);
			if (res.ok) {
				const payload = await res.json();
				if (Array.isArray(payload?.items)) {
					const items = payload.items
						.map((item: any) => {
							const mediaId = normalizeText(item?.id?.videoId);
							if (!mediaId) return null;
							return {
								mediaId,
								title: decodeHtml(normalizeText(item?.snippet?.title)),
								channelTitle: decodeHtml(normalizeText(item?.snippet?.channelTitle)),
								publishedAt: normalizeText(item?.snippet?.publishedAt),
								thumbnailUrl:
									normalizeText(item?.snippet?.thumbnails?.medium?.url) ||
									normalizeText(item?.snippet?.thumbnails?.default?.url)
							};
						})
						.filter(Boolean);
					return json({ items });
				}
			}
		} catch (e) {
			console.warn('[glip] YouTube API error, trying fallback:', e);
		}
	}

	// Fallback to web scraping
	try {
		const items = await searchYouTubeWithoutApiKey(q);
		return json({ items });
	} catch (err: any) {
		console.warn('[glip] YouTube scraper fallback failed:', err?.message || err);
		return json({ items: [], error: 'No se pudo buscar en YouTube' });
	}
};
