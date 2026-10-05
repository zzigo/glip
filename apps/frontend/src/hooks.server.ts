import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Apply CORS headers for API routes
	if (event.url.pathname.startsWith('/api')) {
		if (event.request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
					'Access-Control-Max-Age': '86400'
				}
			});
		}

		const response = await resolve(event);
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
		return response;
	}

	return resolve(event);
};
