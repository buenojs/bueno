/**
 * Template Loader
 *
 * Loads templates from the filesystem with support for:
 * - YAML front matter (metadata)
 * - Template variants (channel-specific sections)
 * - In-memory caching with TTL
 * - Hot reload in development mode
 */

import { readFileSync, watch } from "fs";
import { existsSync } from "fs";
import { extname, resolve } from "path";
import type {
	Template,
	TemplateLoaderOptions,
	TemplateMetadata,
} from "./types";

/**
 * Parses YAML-like front matter from template
 * Format: ---\nkey: value\n---\n
 */
function parseFrontMatter(content: string): {
	metadata: TemplateMetadata;
	body: string;
} {
	const lines = content.split("\n");

	// Check for front matter delimiter
	if (lines[0]?.trim() !== "---") {
		return { metadata: {}, body: content };
	}

	// Find closing delimiter
	let endIdx = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			endIdx = i;
			break;
		}
	}

	if (endIdx === -1) {
		return { metadata: {}, body: content };
	}

	// Parse front matter
	const frontMatterLines = lines.slice(1, endIdx);
	const metadata: TemplateMetadata = {};

	for (const line of frontMatterLines) {
		if (!line.trim()) continue;

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.substring(0, colonIdx).trim();
		let value: unknown = line.substring(colonIdx + 1).trim();

		// Simple type conversion
		if (value === "true") value = true;
		else if (value === "false") value = false;
		else if (value === "null") value = null;
		else if (!isNaN(Number(value)) && value !== "") value = Number(value);
		else if (value.startsWith("[") && value.endsWith("]")) {
			// Parse simple arrays: [email, sms, push] or ["email", "sms", "push"]
			const arrayContent = value.slice(1, -1).trim();
			value = arrayContent.split(",").map((v) => {
				let item = v.trim();
				// Remove quotes if present
				if (
					(item.startsWith('"') && item.endsWith('"')) ||
					(item.startsWith("'") && item.endsWith("'"))
				) {
					item = item.slice(1, -1);
				}
				return item;
			});
		}

		metadata[key] = value;
	}

	const body = lines.slice(endIdx + 1).join("\n");
	return { metadata, body };
}

/**
 * Parses template variants from sections
 * Format: ## Email\n...\n---\n## SMS\n...\n---\n## Push\n...
 *
 * Supports:
 * - Single variant per section: "## Email"
 * - Multiple variants (slash): "## SMS/Push"
 * - Multiple variants (comma): "## SMS, Push"
 */
function parseVariants(content: string): Record<string, string> {
	const sections = content.split(/^## /m);
	const variants: Record<string, string> = {};

	for (const section of sections) {
		if (!section.trim()) continue;

		const lines = section.split("\n");
		const headerLine = lines[0];

		if (!headerLine) continue;

		// Extract variant names from header
		// Supports: "Email", "SMS/Push", "SMS, Push", etc.
		const variantNames = headerLine
			.split(/[,/]\s*/)
			.map((s) => s.trim().toLowerCase())
			.filter((s) => s);

		// Get section content (skip header and empty lines at start)
		const contentLines = lines.slice(1);
		let contentStart = 0;
		while (
			contentStart < contentLines.length &&
			!contentLines[contentStart]?.trim()
		) {
			contentStart++;
		}
		const sectionContent = contentLines.slice(contentStart).join("\n").trim();

		// Handle separator line (---)
		const separatorIdx = sectionContent.indexOf("\n---");
		const finalContent =
			separatorIdx !== -1
				? sectionContent.substring(0, separatorIdx)
				: sectionContent;

		// Map all variant names to same content
		for (const variantName of variantNames) {
			variants[variantName] = finalContent;
		}
	}

	return variants;
}

/**
 * Detects template format from file extension or metadata
 */
function detectFormat(
	filePath: string,
	metadata: TemplateMetadata,
): "markdown" | "text" | "html" {
	// Check metadata override
	if (metadata.format) {
		const fmt = String(metadata.format).toLowerCase();
		if (["markdown", "text", "html"].includes(fmt)) {
			return fmt as "markdown" | "text" | "html";
		}
	}

	// Detect from extension
	const ext = extname(filePath).toLowerCase();
	if (ext === ".md" || ext === ".markdown") return "markdown";
	if (ext === ".txt" || ext === ".text") return "text";
	if (ext === ".html" || ext === ".htm") return "html";

	// Default to markdown (most common)
	return "markdown";
}

/**
 * Template loader with caching and hot reload
 */
export class TemplateLoader {
	private cache: Map<string, { template: Template; timestamp: number }> =
		new Map();
	private watchers: Map<string, ReturnType<typeof watch>> = new Map();
	private metrics = {
		loads: 0,
		cacheHits: 0,
		cacheMisses: 0,
	};

	constructor(private options: TemplateLoaderOptions) {
		// Set defaults
		this.options.cacheEnabled = options.cacheEnabled ?? true;
		this.options.cacheTtl = options.cacheTtl ?? 3600;
		this.options.maxCacheSize = options.maxCacheSize ?? 100;
		this.options.extension = options.extension ?? ".md";
	}

	/**
	 * Load a template by ID (path like "emails/welcome")
	 */
	load(templateId: string): Template {
		const now = Date.now();

		// Check cache
		if (this.options.cacheEnabled) {
			const cached = this.cache.get(templateId);
			if (cached) {
				const age = (now - cached.timestamp) / 1000;
				if (age < (this.options.cacheTtl ?? 3600)) {
					this.metrics.cacheHits++;
					return cached.template;
				}
			}
		}

		// Load from disk
		this.metrics.cacheMisses++;
		const template = this._loadFromDisk(templateId);

		// Cache it
		if (this.options.cacheEnabled) {
			// Prune cache if too large
			if (
				this.cache.size >= (this.options.maxCacheSize ?? 100) &&
				!this.cache.has(templateId)
			) {
				// Remove oldest entry
				const oldest = Array.from(this.cache.entries()).sort(
					(a, b) => a[1].timestamp - b[1].timestamp,
				)[0];
				if (oldest) {
					this.cache.delete(oldest[0]);
				}
			}

			this.cache.set(templateId, { template, timestamp: now });

			// Set up file watcher in development mode
			if (this.options.watch) {
				this._watchTemplate(templateId, template.id);
			}
		}

		this.metrics.loads++;
		return template;
	}

	/**
	 * Load template from disk with variant parsing
	 */
	private _loadFromDisk(templateId: string): Template {
		// Try multiple extensions
		let filePath = resolve(
			this.options.basePath,
			templateId + this.options.extension,
		);

		if (!existsSync(filePath)) {
			// Try .md if original extension didn't work
			filePath = resolve(this.options.basePath, templateId + ".md");
		}

		if (!existsSync(filePath)) {
			// Try .txt
			filePath = resolve(this.options.basePath, templateId + ".txt");
		}

		if (!existsSync(filePath)) {
			throw new Error(`Template not found: ${templateId}`);
		}

		// Read file
		const content = readFileSync(filePath, "utf-8");

		// Parse front matter
		const { metadata, body } = parseFrontMatter(content);

		// Parse variants from body
		const variants = parseVariants(body);

		// If no variants found, treat entire body as default variant
		if (Object.keys(variants).length === 0) {
			const defaultVariant = metadata.default || "default";
			variants[defaultVariant] = body;
		}

		// Detect format
		const format = detectFormat(filePath, metadata);

		return {
			id: templateId,
			format,
			content: body,
			variants,
			metadata,
			loadedAt: Date.now(),
		};
	}

	/**
	 * Watch template file for changes (development mode)
	 */
	private _watchTemplate(templateId: string, filePath: string): void {
		if (this.watchers.has(templateId)) {
			return; // Already watching
		}

		try {
			const fullPath = resolve(this.options.basePath, filePath);
			const watcher = watch(fullPath, () => {
				// Invalidate cache on file change
				this.cache.delete(templateId);
				this.watchers.delete(templateId);
			});

			this.watchers.set(templateId, watcher);
		} catch {
			// Silently fail if file watching not available
		}
	}

	/**
	 * Clear all caches and watchers
	 */
	clear(): void {
		this.cache.clear();
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
	}

	/**
	 * Get loader metrics
	 */
	getMetrics() {
		return { ...this.metrics };
	}
}
