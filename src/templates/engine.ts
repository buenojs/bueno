/**
 * Template Engine
 *
 * Main orchestration class for:
 * - Loading templates (with caching)
 * - Rendering with variable interpolation
 * - Converting Markdown to HTML/text
 * - Channel-specific variant selection
 */

import { TemplateLoader } from "./loader";
import { SimpleRenderer } from "./renderers/simple";
import { MarkdownRenderer } from "./renderers/markdown";
import {
  Template,
  TemplateData,
  RenderOptions,
  TemplateEngineConfig,
  TemplateEngineMetrics,
} from "./types";

/**
 * Default channel-to-variant mapping
 * When no variant is specified, auto-detect based on channel
 */
const DEFAULT_CHANNEL_VARIANT_MAP: Record<string, string> = {
  email: "email",
  sms: "sms",
  push: "push",
  whatsapp: "whatsapp",
  web: "web",
};

/**
 * Template engine
 */
export class TemplateEngine {
  private loader: TemplateLoader;
  private simpleRenderer: SimpleRenderer;
  private metrics: TemplateEngineMetrics = {
    loaded: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgRenderTime: 0,
    totalRenders: 0,
  };
  private renderTimes: number[] = [];
  private channelVariantMap: Record<string, string>;

  constructor(private config: TemplateEngineConfig) {
    this.loader = new TemplateLoader({
      basePath: config.basePath,
      cacheEnabled: config.cache?.enabled ?? true,
      cacheTtl: config.cache?.ttl ?? 3600,
      maxCacheSize: config.cache?.maxSize ?? 100,
      watch: config.watch ?? false,
    });

    this.simpleRenderer = new SimpleRenderer();
    this.channelVariantMap = config.channelVariantMap || DEFAULT_CHANNEL_VARIANT_MAP;
  }

  /**
   * Render a template with data
   */
  async render(
    templateId: string,
    data: TemplateData,
    options?: RenderOptions
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Load template
      const template = this.loader.load(templateId);

      // Determine variant to use
      const variant = this._getVariant(template, options?.variant);

      // Get variant content
      let content = template.variants[variant];
      if (!content) {
        // Fallback to first available variant
        content = Object.values(template.variants)[0] || "";
      }

      // Render with simple renderer (variables + filters + conditionals)
      const interpolated = this.simpleRenderer.render(content, data);

      // Determine output format
      const outputFormat = options?.outputFormat || "html";

      // Convert based on template format
      let result: string;
      if (template.format === "markdown") {
        if (outputFormat === "text") {
          result = MarkdownRenderer.toText(interpolated);
        } else {
          result = MarkdownRenderer.toHtml(interpolated);
        }
      } else {
        // Plain text or HTML template - return as-is
        result = interpolated;
      }

      // Update metrics
      const duration = Date.now() - startTime;
      this._updateMetrics(duration);

      return result;
    } catch (error) {
      // If loading fails, throw with context
      throw new Error(
        `Failed to render template "${templateId}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Render template to HTML (convenience method)
   */
  async renderToHtml(
    templateId: string,
    data: TemplateData,
    variant?: string
  ): Promise<string> {
    return this.render(templateId, data, {
      variant,
      outputFormat: "html",
    });
  }

  /**
   * Render template to plain text (convenience method)
   */
  async renderToText(
    templateId: string,
    data: TemplateData,
    variant?: string
  ): Promise<string> {
    return this.render(templateId, data, {
      variant,
      outputFormat: "text",
    });
  }

  /**
   * Get variant for rendering
   */
  private _getVariant(
    template: Template,
    explicitVariant?: string
  ): string {
    // Explicit variant takes priority
    if (explicitVariant && template.variants[explicitVariant]) {
      return explicitVariant;
    }

    // Fall back to template default
    if (template.metadata.default) {
      const defaultVariant = String(template.metadata.default);
      if (template.variants[defaultVariant]) {
        return defaultVariant;
      }
    }

    // Use first available variant
    return Object.keys(template.variants)[0] || "default";
  }

  /**
   * Get variant for a specific channel
   * Useful for NotificationService to auto-detect correct variant
   */
  getVariantForChannel(channel: string): string {
    return this.channelVariantMap[channel.toLowerCase()] || channel;
  }

  /**
   * Register custom filter
   */
  registerFilter(
    name: string,
    fn: (value: unknown, ...args: unknown[]) => unknown
  ): void {
    this.simpleRenderer.registerFilter(name, fn);
  }

  /**
   * Update metrics
   */
  private _updateMetrics(duration: number): void {
    this.metrics.totalRenders++;
    this.renderTimes.push(duration);

    // Keep only recent 100 measurements for average
    if (this.renderTimes.length > 100) {
      this.renderTimes.shift();
    }

    this.metrics.avgRenderTime =
      this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;

    // Update loader metrics
    const loaderMetrics = this.loader.getMetrics();
    this.metrics.loaded = loaderMetrics.loads;
    this.metrics.cacheHits = loaderMetrics.cacheHits;
    this.metrics.cacheMisses = loaderMetrics.cacheMisses;
  }

  /**
   * Get engine metrics
   */
  getMetrics(): TemplateEngineMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear caches
   */
  clear(): void {
    this.loader.clear();
  }
}
