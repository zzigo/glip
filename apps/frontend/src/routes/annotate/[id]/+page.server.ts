import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAnnotation } from '$lib/server/store';

export const load: PageServerLoad = async ({ params }) => {
	const annotation = await getAnnotation(params.id);
	if (!annotation) {
		throw error(404, 'Anotación no encontrada');
	}
	return { annotation };
};
