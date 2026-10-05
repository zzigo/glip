import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAnnotations, listSummaries, saveAnnotation } from '$lib/server/store';

export const GET: RequestHandler = async ({ url }) => {
	const wantFull = url.searchParams.get('full') === '1' || url.searchParams.get('full') === 'true';
	const tag = url.searchParams.get('tag')?.toLowerCase();
	const work = url.searchParams.get('work')?.toLowerCase();
	const composer = url.searchParams.get('composer')?.toLowerCase();
	const q = url.searchParams.get('q')?.toLowerCase().trim();

	if (wantFull) {
		let list = await listAnnotations();
		if (tag) list = list.filter((a) => a.tags?.some((t) => t.toLowerCase() === tag));
		if (work) list = list.filter((a) => a.work?.toLowerCase().includes(work));
		if (composer) list = list.filter((a) => a.composer?.toLowerCase().includes(composer));
		if (q) {
			list = list.filter(
				(a) =>
					a.title?.toLowerCase().includes(q) ||
					a.work?.toLowerCase().includes(q) ||
					a.composer?.toLowerCase().includes(q) ||
					a.performer?.toLowerCase().includes(q) ||
					a.notes?.toLowerCase().includes(q) ||
					a.tags?.some((t) => t.toLowerCase().includes(q))
			);
		}
		return json(list);
	}

	let summaries = await listSummaries();
	if (tag) summaries = summaries.filter((s) => s.tags?.some((t) => t.toLowerCase() === tag));
	if (work) summaries = summaries.filter((s) => s.work?.toLowerCase().includes(work));
	if (composer) summaries = summaries.filter((s) => s.composer?.toLowerCase().includes(composer));
	if (q) {
		summaries = summaries.filter(
			(s) =>
				s.id?.toLowerCase().includes(q) ||
				s.title?.toLowerCase().includes(q) ||
				s.work?.toLowerCase().includes(q) ||
				s.composer?.toLowerCase().includes(q) ||
				s.performer?.toLowerCase().includes(q) ||
				s.notes?.toLowerCase().includes(q) ||
				s.tags?.some((t) => t.toLowerCase().includes(q))
		);
	}
	return json(summaries);
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const saved = await saveAnnotation(body);
		return json(saved, { status: 201 });
	} catch (err: any) {
		return error(400, err?.message || 'Invalid annotation data');
	}
};
