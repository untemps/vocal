import { defineConfig } from 'vite'

export default defineConfig({
	server: {
		port: 3000,
		host: true,
		open: true,
		proxy: {
			'/gladia-api': {
				target: 'https://api.gladia.io',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/gladia-api/, ''),
			},
			'/openai-api': {
				target: 'https://api.openai.com',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/openai-api/, ''),
			},
		},
	},
})
