import type { PageServerLoad } from './$types';
import { listSummaries } from '$lib/server/store';

export const load: PageServerLoad = async () => {
	const summaries = await listSummaries();
	return { summaries };
};
