/**
 * Fullstack Project Template
 */

import { noneTemplate } from "../frontend/none";
import { reactTemplate } from "../frontend/react";
import { solidTemplate } from "../frontend/solid";
import { svelteTemplate } from "../frontend/svelte";
import { vueTemplate } from "../frontend/vue";
import type { ProjectConfig, ProjectTemplateResult } from "./types";

export function fullstackTemplate(
	config: ProjectConfig,
): ProjectTemplateResult {
	// Get frontend template based on framework
	const frontendTemplates: Record<string, () => ProjectTemplateResult> = {
		react: reactTemplate,
		vue: vueTemplate,
		svelte: svelteTemplate,
		solid: solidTemplate,
		none: noneTemplate,
	};

	const frontendTemplate = frontendTemplates[config.framework]
		? frontendTemplates[config.framework]()
		: reactTemplate();

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
    return { message: 'Welcome to Bueno!', items: [] };
  }
}

// Controllers
@Controller('/api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  hello() {
    return { message: 'Welcome to Bueno API!', version: '1.0.0' };
  }

  @Get('health')
  health(ctx: Context) {
    return { status: 'ok', timestamp: new Date().toISOString() };
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

// Serve static files in production
// app.serveStatic('./dist/client');

await app.listen(3000);
console.log('🚀 Server running at http://localhost:3000');
`,
			},
			// Include frontend files
			...frontendTemplate.files,
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
			// Include frontend directories
			...frontendTemplate.directories,
		],
		dependencies: {
			zod: "^3.24.0",
			// Include frontend dependencies
			...frontendTemplate.dependencies,
		},
		devDependencies: {
			// Include frontend dev dependencies
			...frontendTemplate.devDependencies,
		},
		scripts: {
			dev: "bun run --watch server/main.ts",
			build: "bun build ./server/main.ts --outdir ./dist --target bun",
			start: "bun run dist/main.js",
			test: "bun test",
			// Include frontend scripts
			...frontendTemplate.scripts,
		},
	};
}
