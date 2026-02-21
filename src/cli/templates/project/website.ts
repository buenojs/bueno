/**
 * Website Project Template
 *
 * Static website template using SSG (Static Site Generation)
 */

import type { ProjectConfig, ProjectTemplateResult } from './types';
import { getBuenoDependency } from '../../utils/version';

export function websiteTemplate(config: ProjectConfig): ProjectTemplateResult {
	return {
		files: [
			{
				path: 'src/build.ts',
				content: `/**
 * Build script for ${config.name}
 *
 * Uses Bueno's SSG module to generate static HTML from markdown content
 */

import { SSG, createSSG, type SiteConfig, type LayoutContext } from 'bueno';

// Site configuration
const siteConfig: Partial<SiteConfig> = {
  title: '${config.name}',
  description: 'A static website built with Bueno',
  baseUrl: '/',
};

// Create SSG instance
const ssg = createSSG(
  {
    contentDir: './content',
    outputDir: './dist',
    publicDir: './public',
    defaultLayout: 'default',
  },
  siteConfig
);

// Register custom layouts
ssg.registerLayout('default', renderDefaultLayout);

// Build the site
console.log('Building website...');
await ssg.build();
console.log('Build complete!');

// ============= Layout Templates =============

function renderDefaultLayout(ctx: LayoutContext): string {
  const title = ctx.page.frontmatter.title || ctx.site.title;
  const description = ctx.page.frontmatter.description || ctx.site.description;
  
  return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${title}</title>
  <meta name="description" content="\${description}">
  <link rel="stylesheet" href="\${ctx.site.baseUrl}styles/main.css">
</head>
<body>
  <header>
    <nav>
      <a href="\${ctx.site.baseUrl}">Home</a>
      <a href="\${ctx.site.baseUrl}about">About</a>
    </nav>
  </header>
  <main>
    \${ctx.content}
  </main>
  <footer>
    <p>&copy; \${new Date().getFullYear()} \${ctx.site.title}</p>
  </footer>
</body>
</html>\`;
}
`,
			},
			{
				path: 'src/serve.ts',
				content: `/**
 * Development server for serving the built website
 */

const PORT = 3001;

async function serve() {
  console.log(\`Starting server at http://localhost:\${PORT}\`);
  
  Bun.serve({
    port: PORT,
    async fetch(request) {
      const url = new URL(request.url);
      let path = url.pathname;
      
      // Serve index.html for root
      if (path === '/') {
        path = '/index.html';
      }
      
      // Try to serve from dist directory
      const filePath = \`./dist\${path}\`;
      const file = Bun.file(filePath);
      
      if (await file.exists()) {
        return new Response(file);
      }
      
      // For SPA-like behavior, try adding .html extension
      if (!path.includes('.')) {
        const htmlPath = \`./dist\${path}/index.html\`;
        const htmlFile = Bun.file(htmlPath);
        
        if (await htmlFile.exists()) {
          return new Response(htmlFile);
        }
      }
      
      // 404
      return new Response('Not Found', { status: 404 });
    },
  });
  
  console.log(\`Server running at http://localhost:\${PORT}\`);
}

serve();
`,
			},
			{
				path: 'content/index.md',
				content: `---
title: Welcome
description: Welcome to my website
layout: default
---

# Welcome to ${config.name}

This is a static website built with [Bueno Framework](https://buenojs.dev).

## Getting Started

1. Edit content in the \`content/\` directory
2. Run \`bun run dev\` to start development
3. Run \`bun run build\` to generate static files
`,
			},
			{
				path: 'public/styles/main.css',
				content: `/* Main styles for the website */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #333;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

header {
  padding: 20px 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 20px;
}

nav {
  display: flex;
  gap: 20px;
}

nav a {
  color: #2563eb;
  text-decoration: none;
}

nav a:hover {
  text-decoration: underline;
}

main {
  min-height: 60vh;
}

footer {
  padding: 20px 0;
  border-top: 1px solid #eee;
  margin-top: 40px;
  text-align: center;
  color: #666;
}

h1 {
  color: #2563eb;
  margin-bottom: 20px;
}

h2 {
  margin-top: 30px;
  margin-bottom: 15px;
}

p {
  margin-bottom: 15px;
}

ul, ol {
  margin-left: 20px;
  margin-bottom: 15px;
}

code {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
}

pre {
  background: #f3f4f6;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 15px;
}
`,
			},
			{
				path: '.env.example',
				content: `# ${config.name} Environment Variables
# Copy this file to .env and customize as needed

# Site Configuration
SITE_URL=http://localhost:3001

# Build Configuration
NODE_ENV=development
`,
			},
		],
		directories: ['src', 'content', 'public/styles', 'layouts'],
		dependencies: {
			...getBuenoDependency(),
		},
		devDependencies: {
			'@types/bun': 'latest',
			typescript: '^5.3.0',
		},
		scripts: {
			dev: 'bun run --watch src/build.ts --dev',
			build: 'bun run src/build.ts',
			serve: 'bun run src/serve.ts',
		},
	};
}