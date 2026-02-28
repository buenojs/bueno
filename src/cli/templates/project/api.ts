/**
 * API Project Template
 */

import { getBuenoDependency } from "../../utils/version";
import type { ProjectConfig, ProjectTemplateResult } from "./types";

export function apiTemplate(config: ProjectConfig): ProjectTemplateResult {
	return {
		files: [
			{
				path: "server/main.ts",
				content: `import { createApp, Module, Controller, Get, Post, Injectable } from '@buenojs/bueno';
import type { Context } from '@buenojs/bueno';

// Services
@Injectable()
export class AppService {
		findAll() {
				return { message: 'Welcome to Bueno API!', items: [] };
		}
}

// Controllers
@Controller('/api')
export class AppController {
		constructor(private readonly appService: AppService) {}

		@Get()
		hello() {
				return Response.json({ message: 'Welcome to Bueno API!', version: '1.0.0' });
		}

		@Get('health')
		health(ctx: Context) {
				return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
		}
}

// Module
@Module({
		controllers: [AppController],
		providers: [AppService],
})
export class AppModule {}

// Bootstrap
const app = createApp(AppModule);
await app.listen(3000);
console.log('🚀 API server running at http://localhost:3000/api');
`,
			},
		],
		directories: [
			"server/modules/app",
			"server/common/middleware",
			"server/common/guards",
			"server/common/interceptors",
			"server/common/pipes",
			"server/common/filters",
			"server/database/migrations",
			"server/config",
			"tests/unit",
			"tests/integration",
		],
		dependencies: {
			...getBuenoDependency(),
			zod: "^3.24.0",
		},
		devDependencies: {
			"@types/bun": "latest",
			typescript: "^5.3.0",
		},
		scripts: {
			dev: "bun run --watch server/main.ts",
			build: "bun build ./server/main.ts --outdir ./dist --target bun",
			start: "bun run dist/main.js",
			test: "bun test",
		},
	};
}
