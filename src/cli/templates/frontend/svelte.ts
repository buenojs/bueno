/**
 * Svelte Frontend Template
 */

import type { FrontendTemplateResult } from "../project/types";

export function svelteTemplate(): FrontendTemplateResult {
	return {
		files: [
			{
				path: "client/index.html",
				content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bueno App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
`,
			},
			{
				path: "client/src/main.ts",
				content: `import App from './App.svelte';
import './styles/globals.css';

const app = new App({
  target: document.getElementById('app')!,
});

export default app;
`,
			},
			{
				path: "client/src/App.svelte",
				content: `<script lang="ts">
  let count = 0;
</script>

<main class="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-2xl mx-auto text-center">
      <h1 class="text-5xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
        Welcome to Bueno
      </h1>
      <p class="text-xl text-slate-300 mb-8">
        A Bun-native full-stack framework
      </p>
      
      <div class="bg-slate-800/50 rounded-xl p-8 backdrop-blur-sm border border-slate-700">
        <button
          on:click={() => count++}
          class="px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-colors"
        >
          Count: {count}
        </button>
        <p class="mt-4 text-slate-400 text-sm">
          Click the button to test Svelte reactivity
        </p>
      </div>

      <div class="mt-8 grid grid-cols-2 gap-4 text-left">
        <a
          href="https://bueno.github.io"
          class="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-orange-500 transition-colors"
        >
          <h3 class="font-semibold text-orange-400">Documentation</h3>
          <p class="text-sm text-slate-400">Learn more about Bueno</p>
        </a>
        <a
          href="https://github.com/buenojs/bueno"
          class="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-orange-500 transition-colors"
        >
          <h3 class="font-semibold text-orange-400">GitHub</h3>
          <p class="text-sm text-slate-400">View the source code</p>
        </a>
      </div>
    </div>
  </div>
</main>
`,
			},
			{
				path: "client/src/styles/globals.css",
				content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}
`,
			},
		],
		directories: [
			"client/src/components",
			"client/src/styles",
			"client/public",
		],
		dependencies: {
			svelte: "^4.2.0",
		},
		devDependencies: {
			"@sveltejs/vite-plugin-svelte": "^3.0.0",
			svelte: "^4.2.0",
			tailwindcss: "^3.4.0",
			postcss: "^8.4.0",
			autoprefixer: "^10.4.0",
		},
		scripts: {
			"dev:client": "bun run --watch client/index.html",
			"build:client": "bun build ./client/src/main.ts --outdir ./dist/client",
		},
	};
}
