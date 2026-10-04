import type { PageServerLoad } from './$types';
import { getAnnotation } from '$lib/server/store';

export const load: PageServerLoad = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (id) {
		const annotation = await getAnnotation(id);
		if (annotation) return { annotation };
	}
	return { annotation: null };
};
