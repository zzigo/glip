import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAnnotation } from '$lib/server/store';

export const load: PageServerLoad = async ({ params, url }) => {
	const annotation = await getAnnotation(params.id);
	if (!annotation) {
		throw error(404, 'Anotación no encontrada');
	}

	return {
		annotation,
		autoplay: url.searchParams.get('autoplay') === '1' || url.searchParams.get('autoplay') === 'true',
		loop: url.searchParams.get('loop') === '1' || url.searchParams.get('loop') === 'true',
		meta: url.searchParams.get('meta') || 'top'
	};
};
