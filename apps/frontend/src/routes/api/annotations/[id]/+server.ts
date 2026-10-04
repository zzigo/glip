import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnnotation, saveAnnotation, removeAnnotation } from '$lib/server/store';

export const GET: RequestHandler = async ({ params }) => {
	const annotation = await getAnnotation(params.id);
	if (!annotation) {
		throw error(404, 'Annotation not found');
	}
	return json(annotation, {
		headers: {
			'access-control-allow-origin': '*',
			'cache-control': 'public, max-age=15'
		}
	});
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const saved = await saveAnnotation(body, params.id);
		return json(saved);
	} catch (err: any) {
		const status = err?.status === 404 ? 404 : 400;
		throw error(status, err?.message || 'Failed to update annotation');
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const ok = await removeAnnotation(params.id);
	if (!ok) {
		throw error(404, 'Annotation not found');
	}
	return json({ ok: true });
};
