/**
 * Minimal Project Template
 */

import type { ProjectConfig, ProjectTemplateResult } from './types';
import { getBuenoDependency } from '../../utils/version';

export function minimalTemplate(config: ProjectConfig): ProjectTemplateResult {
	return {
		files: [
			{
				path: 'server/main.ts',
				content: `import { createServer } from '@buenojs/bueno';

const app = createServer();

app.router.get('/', () => {
		return Response.json({ message: 'Hello, Bueno!' });
});

app.router.get('/health', () => {
		return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

await app.listen(3000);
console.log('🚀 Server running at http://localhost:3000');
`,
			},
		],
		directories: ['server', 'tests'],
		dependencies: {
			...getBuenoDependency(),
		},
		devDependencies: {
			'@types/bun': 'latest',
			typescript: '^5.3.0',
		},
		scripts: {
			dev: 'bun run --watch server/main.ts',
			build: 'bun build ./server/main.ts --outdir ./dist --target bun',
			start: 'bun run dist/main.js',
			test: 'bun test',
		},
	};
}