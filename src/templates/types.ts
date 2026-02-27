/**
 * Template System Types
 *
 * Core interfaces for the lightweight, multi-purpose template engine.
 * Supports: Variables, filters, conditionals, Markdown rendering, and channel-specific variants.
 */

/**
 * Job status enumeration
 */
export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "delayed";

/**
 * Template metadata from front matter
 */
export interface TemplateMetadata {
  /** Channel variants supported by this template */
  variants?: string[];
  /** Default variant if not specified */
  default?: string;
  /** Template description */
  description?: string;
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Parsed template with content and metadata
 */
export interface Template {
  /** Template identifier (path without extension) */
  id: string;
  /** Template format: "markdown", "text", or "html" */
  format: "markdown" | "text" | "html";
  /** Raw template content */
  content: string;
  /** Channel-specific variants: { "email": "...", "sms": "...", "push": "..." } */
  variants: Record<string, string>;
  /** Front matter metadata */
  metadata: TemplateMetadata;
  /** When template was loaded (for cache invalidation) */
  loadedAt: number;
}

/**
 * Options for rendering a template
 */
export interface RenderOptions {
  /** Specific variant to use (overrides auto-detection) */
  variant?: string;
  /** Output format: "html" for email, "text" for SMS/plain text */
  outputFormat?: "html" | "text";
  /** Timezone for date filters */
  timezone?: string;
  /** Locale for i18n (future) */
  locale?: string;
}

/**
 * Template engine data (variables passed to renderer)
 */
export interface TemplateData {
  [key: string]: unknown;
}

/**
 * Renderer interface (implemented by SimpleRenderer, MarkdownRenderer, etc.)
 */
export interface IRenderer {
  /** Render template with data */
  render(template: string, data: TemplateData): Promise<string>;
}

/**
 * Filter function signature
 */
export type FilterFn = (value: unknown, ...args: unknown[]) => unknown;

/**
 * Built-in filters registry
 */
export interface FilterRegistry {
  [filterName: string]: FilterFn;
}

/**
 * Template loader options
 */
export interface TemplateLoaderOptions {
  /** Base path to templates directory */
  basePath: string;
  /** Enable caching */
  cacheEnabled?: boolean;
  /** Cache time-to-live in seconds */
  cacheTtl?: number;
  /** Max number of templates in cache */
  maxCacheSize?: number;
  /** Watch for file changes in development */
  watch?: boolean;
  /** File extension to look for */
  extension?: string;
}

/**
 * Template engine configuration
 */
export interface TemplateEngineConfig {
  /** Base path for templates */
  basePath: string;
  /** Cache configuration */
  cache?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  /** Watch for changes in development */
  watch?: boolean;
  /** Default locale (future i18n) */
  locale?: string;
  /** Default output format */
  defaultFormat?: "html" | "text";
  /** Channel to variant mapping for auto-detection */
  channelVariantMap?: Record<string, string>;
}

/**
 * Template load event
 */
export interface TemplateLoadedEvent {
  templateId: string;
  source: "memory" | "disk";
  duration: number;
}

/**
 * Template engine metrics
 */
export interface TemplateEngineMetrics {
  /** Total templates loaded */
  loaded: number;
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
  /** Average render time in milliseconds */
  avgRenderTime: number;
  /** Total renders */
  totalRenders: number;
}
