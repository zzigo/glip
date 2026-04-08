import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// Dev proxy — apunta /api/* y /audio/* al VPS remoto para correr el frontend localmente.
// En producción, Caddy maneja todo esto en el VPS.
//
// Configura la URL del VPS en .env.development (no commiteado):
//   VITE_VPS=https://glip.zztt.org        ← dominio público
//   VITE_VPS=http://localhost:8000         ← SSH tunnel (más rápido)
//   VITE_VPS_PB=http://localhost:8090      ← PocketBase via tunnel

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const vps   = env.VITE_VPS    || 'https://glip.zztt.org';
	const vps_pb = env.VITE_VPS_PB || vps;
	const isTunnel = vps.startsWith('http://localhost');

	return {
		plugins: [sveltekit()],
		server: {
			port: 5174,
			proxy: {
				'/api':   { target: vps,    changeOrigin: true, secure: !isTunnel },
				'/audio': { target: vps,    changeOrigin: true, secure: !isTunnel },
				'/pb':    { target: vps_pb, changeOrigin: true, secure: !isTunnel },
			}
		}
	};
});
