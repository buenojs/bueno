/**
 * Static Site Generation (SSG) Module
 *
 * Provides markdown-to-HTML conversion with frontmatter support,
 * template system, and static site generation capabilities.
 */

import { Context } from "../context";
import { Router } from "../router";

export interface Frontmatter {
	title?: string;
	description?: string;
	layout?: string;
	date?: string;
	slug?: string;
	[key: string]: unknown;
}

export interface Page {
	path: string;
	content: string;
	html: string;
	frontmatter: Frontmatter;
	raw: string;
}

export interface SSGConfig {
	contentDir: string;
	outputDir: string;
	publicDir?: string;
	layoutsDir?: string;
	defaultLayout?: string;
	baseUrl?: string;
	minify?: boolean;
}

export interface LayoutContext {
	title?: string;
	description?: string;
	content: string;
	page: Page;
	site: SiteConfig;
	[key: string]: unknown;
}

export interface SiteConfig {
	title: string;
	description: string;
	baseUrl: string;
	[key: string]: unknown;
}

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const MARKDOWN_CODE_BLOCK = /```(\w+)?\n([\s\S]*?)```/g;
const MARKDOWN_INLINE_CODE = /`([^`]+)`/g;
const MARKDOWN_HEADERS = /^(#{1,6})\s+(.+)$/gm;
const MARKDOWN_BOLD = /\*\*(.+?)\*\*/g;
const MARKDOWN_ITALIC = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const MARKDOWN_LIST = /^(\s*)[-*+]\s+(.+)$/gm;
const MARKDOWN_ORDERED_LIST = /^(\s*)(\d+)\.\s+(.+)$/gm;
const MARKDOWN_BLOCKQUOTE = /^>\s+(.+)$/gm;
const MARKDOWN_HR = /^---$/gm;
const MARKDOWN_PARAGRAPH = /\n\n/g;

function parseFrontmatter(content: string): {
	frontmatter: Frontmatter;
	body: string;
} {
	const match = content.match(FRONTMATTER_REGEX);

	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const frontmatterRaw = match[1];
	const body = content.slice(match[0].length);
	const frontmatter: Frontmatter = {};

	for (const line of frontmatterRaw.split("\n")) {
		const colonIndex = line.indexOf(":");
		if (colonIndex > 0) {
			const key = line.slice(0, colonIndex).trim();
			let value: unknown = line.slice(colonIndex + 1).trim();

			if (typeof value === "string") {
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1);
				} else if (value === "true") {
					value = true;
				} else if (value === "false") {
					value = false;
				} else if (!Number.isNaN(Number(value))) {
					value = Number(value);
				}
			}

			frontmatter[key] = value;
		}
	}

	return { frontmatter, body };
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function parseMarkdown(markdown: string): string {
	let html = markdown;

	const codeBlocks: Array<{ placeholder: string; html: string }> = [];
	let codeIndex = 0;

	html = html.replace(MARKDOWN_CODE_BLOCK, (_, lang, code) => {
		const placeholder = `__CODE_BLOCK_${codeIndex}__`;
		const escapedCode = escapeHtml(code.trim());
		const langClass = lang ? ` class="language-${lang}"` : "";
		codeBlocks.push({
			placeholder,
			html: `<pre><code${langClass}>${escapedCode}</code></pre>`,
		});
		codeIndex++;
		return placeholder;
	});

	const inlineCodes: Array<{ placeholder: string; html: string }> = [];
	let inlineIndex = 0;

	html = html.replace(MARKDOWN_INLINE_CODE, (_, code) => {
		const placeholder = `__INLINE_CODE_${inlineIndex}__`;
		inlineCodes.push({
			placeholder,
			html: `<code>${escapeHtml(code)}</code>`,
		});
		inlineIndex++;
		return placeholder;
	});

	html = html.replace(MARKDOWN_IMAGE, '<img src="$2" alt="$1" />');
	html = html.replace(MARKDOWN_LINK, '<a href="$2">$1</a>');

	html = html.replace(MARKDOWN_HEADERS, (_, hashes, text) => {
		const level = hashes.length;
		return `<h${level}>${text.trim()}</h${level}>`;
	});

	html = html.replace(MARKDOWN_BOLD, "<strong>$1</strong>");
	html = html.replace(MARKDOWN_ITALIC, "<em>$1</em>");

	html = html.replace(MARKDOWN_BLOCKQUOTE, "<blockquote>$1</blockquote>");

	html = html.replace(MARKDOWN_HR, "<hr />");

	const listItems: Array<{
		indent: number;
		type: "ul" | "ol";
		items: string[];
	}> = [];
	let currentList: {
		indent: number;
		type: "ul" | "ol";
		items: string[];
	} | null = null;

	const lines = html.split("\n");
	const processedLines: string[] = [];

	for (const line of lines) {
		const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
		const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

		if (ulMatch || olMatch) {
			const match = ulMatch || olMatch;
			const indent = match?.[1].length ?? 0;
			const type = ulMatch ? "ul" : "ol";
			const text = ulMatch ? ulMatch[2] : (olMatch?.[3] ?? "");

			if (
				currentList &&
				currentList.indent === indent &&
				currentList.type === type
			) {
				currentList.items.push(text);
			} else {
				if (currentList) {
					const tag = currentList.type;
					processedLines.push(
						`<${tag}><li>${currentList.items.join("</li><li>")}</li></${tag}>`,
					);
				}
				currentList = { indent: indent ?? 0, type, items: [text] };
			}
		} else {
			if (currentList) {
				const tag = currentList.type;
				processedLines.push(
					`<${tag}><li>${currentList.items.join("</li><li>")}</li></${tag}>`,
				);
				currentList = null;
			}
			processedLines.push(line);
		}
	}

	if (currentList) {
		const tag = currentList.type;
		processedLines.push(
			`<${tag}><li>${currentList.items.join("</li><li>")}</li></${tag}>`,
		);
	}

	html = processedLines.join("\n");

	html = html
		.split(MARKDOWN_PARAGRAPH.source)
		.map((p) => {
			p = p.trim();
			if (!p) return "";
			if (p.startsWith("<")) return p;
			return `<p>${p}</p>`;
		})
		.join("\n");

	for (const { placeholder, html: codeHtml } of codeBlocks) {
		html = html.replace(placeholder, codeHtml);
	}

	for (const { placeholder, html: codeHtml } of inlineCodes) {
		html = html.replace(placeholder, codeHtml);
	}

	return html;
}

export class SSG {
	private config: SSGConfig;
	private pages: Map<string, Page> = new Map();
	private layouts: Map<string, (ctx: LayoutContext) => string> = new Map();
	private siteConfig: SiteConfig;
	private router: Router;

	constructor(config: SSGConfig, siteConfig?: Partial<SiteConfig>) {
		this.config = config;
		this.siteConfig = {
			title: "Bueno Documentation",
			description: "A Bun-Native Full-Stack Framework",
			baseUrl: config.baseUrl || "/",
			...siteConfig,
		};
		this.router = new Router();

		this.registerDefaultLayouts();
	}

	private registerDefaultLayouts(): void {
		this.layouts.set(
			"default",
			(ctx) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ctx.title || ctx.page.frontmatter.title || ctx.site.title}</title>
  <meta name="description" content="${ctx.description || ctx.page.frontmatter.description || ctx.site.description}">
  <link rel="stylesheet" href="${ctx.site.baseUrl}style.css">
</head>
<body>
  <nav>
    <a href="${ctx.site.baseUrl}">Home</a>
    <a href="${ctx.site.baseUrl}docs">Docs</a>
    <a href="${ctx.site.baseUrl}api">API</a>
  </nav>
  <main>
    ${ctx.content}
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()} Bueno Framework</p>
  </footer>
</body>
</html>`,
		);

		this.layouts.set(
			"docs",
			(ctx) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ctx.page.frontmatter.title || "Docs"} | ${ctx.site.title}</title>
  <meta name="description" content="${ctx.page.frontmatter.description || ctx.site.description}">
  <link rel="stylesheet" href="${ctx.site.baseUrl}style.css">
</head>
<body class="docs-page">
  <aside class="sidebar">
    <div class="logo">
      <a href="${ctx.site.baseUrl}">Bueno</a>
    </div>
    <nav class="sidebar-nav">
      <a href="${ctx.site.baseUrl}docs/getting-started">Getting Started</a>
      <a href="${ctx.site.baseUrl}docs/router">Router</a>
      <a href="${ctx.site.baseUrl}docs/context">Context</a>
      <a href="${ctx.site.baseUrl}docs/middleware">Middleware</a>
      <a href="${ctx.site.baseUrl}docs/validation">Validation</a>
      <a href="${ctx.site.baseUrl}docs/database">Database</a>
      <a href="${ctx.site.baseUrl}docs/rpc">RPC Client</a>
    </nav>
  </aside>
  <main class="content">
    <article>
      <h1>${ctx.page.frontmatter.title || ""}</h1>
      ${ctx.content}
    </article>
  </main>
</body>
</html>`,
		);
	}

	registerLayout(name: string, render: (ctx: LayoutContext) => string): void {
		this.layouts.set(name, render);
	}

	async loadContent(): Promise<void> {
		const contentDir = this.config.contentDir;

		try {
			const fs = require("node:fs");
			if (!fs.existsSync(contentDir)) {
				console.warn(`Content directory not found: ${contentDir}`);
				return;
			}
		} catch {
			console.warn(`Content directory not found: ${contentDir}`);
			return;
		}

		await this.scanDirectory(contentDir, "");
	}

	private async scanDirectory(
		dirPath: string,
		relativePath: string,
	): Promise<void> {
		const glob = new Bun.Glob("**/*.{md,markdown}");

		for await (const file of glob.scan(dirPath)) {
			const filePath = `${dirPath}/${file}`;
			await this.processFile(filePath, file);
		}
	}

	private async processFile(
		filePath: string,
		relativePath: string,
	): Promise<void> {
		const file = Bun.file(filePath);
		const content = await file.text();

		const { frontmatter, body } = parseFrontmatter(content);
		const html = parseMarkdown(body);

		let pagePath = relativePath
			.replace(/\.(md|markdown)$/, "")
			.replace(/\\/g, "/");

		if (pagePath.endsWith("index")) {
			pagePath = pagePath.replace(/\/?index$/, "") || "/";
		}

		if (!pagePath.startsWith("/")) {
			pagePath = `/${pagePath}`;
		}

		const page: Page = {
			path: pagePath,
			content: body,
			html,
			frontmatter,
			raw: content,
		};

		this.pages.set(pagePath, page);
	}

	renderPage(page: Page): string {
		const layoutName =
			page.frontmatter.layout || this.config.defaultLayout || "default";
		const layout = this.layouts.get(layoutName);

		if (!layout) {
			console.warn(`Layout not found: ${layoutName}, using default`);
			return this.layouts.get("default")?.({
				content: page.html,
				page,
				site: this.siteConfig,
			}) ?? "";
		}

		return layout({
			title: page.frontmatter.title,
			description: page.frontmatter.description,
			content: page.html,
			page,
			site: this.siteConfig,
		});
	}

	async build(): Promise<void> {
		await this.loadContent();

		const outputDir = this.config.outputDir;

		await Bun.$`mkdir -p ${outputDir}`.quiet();

		for (const [path, page] of this.pages) {
			const html = this.renderPage(page);
			const outputPath =
				path === "/"
					? `${outputDir}/index.html`
					: `${outputDir}${path}/index.html`;

			const outputDirPath = outputPath.replace(/\/index\.html$/, "");
			await Bun.$`mkdir -p ${outputDirPath}`.quiet();

			await Bun.write(outputPath, html);
			console.log(`Generated: ${path}`);
		}

		if (this.config.publicDir) {
			await this.copyPublicDir();
		}

		console.log(`\nBuild complete: ${this.pages.size} pages generated`);
	}

	private async copyPublicDir(): Promise<void> {
		const publicDir = this.config.publicDir;
		const outputDir = this.config.outputDir;

		try {
			const glob = new Bun.Glob("**/*");

			for await (const file of glob.scan(publicDir!)) {
				const srcPath = `${publicDir}/${file}`;
				const destPath = `${outputDir}/${file}`;

				const destDir = destPath.substring(0, destPath.lastIndexOf("/"));
				await Bun.$`mkdir -p ${destDir}`.quiet();

				await Bun.write(destPath, Bun.file(srcPath));
			}
		} catch (e) {
			console.warn(`Failed to copy public directory: ${e}`);
		}
	}

	createRouter(): Router {
		for (const [path, page] of this.pages) {
			this.router.get(path, (ctx) => {
				const html = this.renderPage(page);
				return (ctx as Context).html(html);
			});
		}

		if (this.config.publicDir) {
			this.router.all("/*", async (ctx) => {
				const context = ctx as Context;
				const publicPath = `${this.config.publicDir}${context.path}`;
				const file = Bun.file(publicPath);

				if (await file.exists()) {
					return new Response(file);
				}

				return context.notFound();
			});
		}

		return this.router;
	}

	async serve(port = 3000): Promise<void> {
		await this.loadContent();
		const router = this.createRouter();

		Bun.serve({
			port,
			fetch: async (request: Request): Promise<Response> => {
				const url = new URL(request.url);
				const match = router.match(request.method as "GET", url.pathname);

				if (!match) {
					return new Response("Not Found", { status: 404 });
				}

				const context = new Context(request, match.params);

				if (match.middleware && match.middleware.length > 0) {
					console.warn("Middleware not yet supported in SSG dev server");
				}

				return match.handler(context) as Response;
			},
		});

		console.log(`SSG dev server running at http://localhost:${port}`);
	}

	getPages(): Page[] {
		return Array.from(this.pages.values());
	}

	getPage(path: string): Page | undefined {
		return this.pages.get(path);
	}
}

export function createSSG(
	config: SSGConfig,
	siteConfig?: Partial<SiteConfig>,
): SSG {
	return new SSG(config, siteConfig);
}

export { parseMarkdown, parseFrontmatter };
