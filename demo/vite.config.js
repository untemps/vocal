import { defineConfig } from 'vite'

export default defineConfig({
	server: {
		port: 3000,
		host: true,
		open: true,
		// The Gladia engine's init POST (demo/gladiaEngine.ts) is proxied so the browser
		// isn't blocked by CORS. The key still leaves the browser — acceptable for a local
		// demo, never for production (mint the session URL server-side there).
		//
		// The prefix must NOT be a prefix of any demo module path, or Vite would proxy that
		// module request too: '/gladia' would swallow '/gladiaEngine.ts' (→ 404), so the
		// import fails and the whole page breaks. '/gladia-api' cannot collide.
		proxy: {
			'/gladia-api': {
				target: 'https://api.gladia.io',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/gladia-api/, ''),
			},
		},
	},
})
