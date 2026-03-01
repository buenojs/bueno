/**
 * React Frontend Template
 */

import type { FrontendTemplateResult } from "../project/types";

export function reactTemplate(): FrontendTemplateResult {
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
  <div id="root"></div>
  <script type="module" src="./src/main.tsx"></script>
</body>
</html>
`,
			},
			{
				path: "client/src/main.tsx",
				content: `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,
			},
			{
				path: "client/src/App.tsx",
				content: `import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Welcome to Bueno
          </h1>
          <p className="text-xl text-slate-300 mb-8">
            A Bun-native full-stack framework
          </p>
          
          <div className="bg-slate-800/50 rounded-xl p-8 backdrop-blur-sm border border-slate-700">
            <button
              onClick={() => setCount(c => c + 1)}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors"
            >
              Count: {count}
            </button>
            <p className="mt-4 text-slate-400 text-sm">
              Click the button to test React hydration
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 text-left">
            <a
              href="https://bueno.github.io"
              className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500 transition-colors"
            >
              <h3 className="font-semibold text-blue-400">Documentation</h3>
              <p className="text-sm text-slate-400">Learn more about Bueno</p>
            </a>
            <a
              href="https://github.com/buenojs/bueno"
              className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500 transition-colors"
            >
              <h3 className="font-semibold text-blue-400">GitHub</h3>
              <p className="text-sm text-slate-400">View the source code</p>
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
`,
			},
			{
				path: "client/src/styles/globals.css",
				content: `/* PostCSS will process these directives */
@tailwind base;
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
			react: "^18.3.0",
			"react-dom": "^18.3.0",
		},
		devDependencies: {
			"@types/react": "^18.3.0",
			"@types/react-dom": "^18.3.0",
			tailwindcss: "^3.4.0",
			postcss: "^8.4.0",
			autoprefixer: "^10.4.0",
		},
		scripts: {
			"dev:client": "bun run --watch client/index.html",
			"build:client": "bun build ./client/src/main.tsx --outdir ./dist/client",
		},
	};
}
