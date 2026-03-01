/**
 * Default Project Template
 */

import { noneTemplate } from "../frontend/none";
import { reactTemplate } from "../frontend/react";
import { solidTemplate } from "../frontend/solid";
import { svelteTemplate } from "../frontend/svelte";
import { vueTemplate } from "../frontend/vue";
import type { ProjectConfig, ProjectTemplateResult } from "./types";

export function defaultTemplate(config: ProjectConfig): ProjectTemplateResult {
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
				content: `import { createApp, Module, Controller, Get, Injectable } from '@buenojs/bueno';
import type { Context } from '@buenojs/bueno';

// Services
@Injectable()
export class AppService {
  findAll() {
    return { message: 'Welcome to Bueno!', items: [] };
  }
}

// Controllers
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  hello() {
    return new Response(\`<html>
<head>
  <title>Welcome to Bueno</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #2563eb; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>🎉 Welcome to Bueno Framework!</h1>
  <p>Your Bun-native full-stack framework is running successfully.</p>
  
  <h2>Getting Started</h2>
  <ul>
    <li>Edit <code>server/main.ts</code> to modify this app</li>
    <li>Add routes using the <code>@Get()</code>, <code>@Post()</code> decorators</li>
    <li>Create services with <code>@Injectable()</code> and inject them in controllers</li>
  </ul>
  
  <h2>Documentation</h2>
  <p>Visit <a href="https://bueno.github.io">https://bueno.github.io</a> for full documentation.</p>
  
  <h2>Quick Example</h2>
  <pre><code>@Controller('/api')
class MyController {
  @Get('/users')
  getUsers() {
    return { users: [] };
  }
}</code></pre>
</body>
</html>\`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
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
await app.listen(3000);
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
