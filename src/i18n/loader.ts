/**
 * Translation Loader — JSON File Loading and Caching
 *
 * Loads locale JSON files from disk, flattens nested keys to dot-notation,
 * caches in memory, and supports hot-reload via file watching.
 */

import { existsSync, readFileSync, watch } from "fs";
import { resolve, join } from "path";
import type { FlatTranslations, LocaleBundle, ResolvedI18nConfig } from "./types";

// ============= Flattening =============

/**
 * Recursively flatten a nested object into dot-notation keys.
 *
 * @example
 * flattenTranslations({ nav: { home: "Home", about: "About" } })
 * → Map { "nav.home" → "Home", "nav.about" → "About" }
 *
 * Already-flat keys pass through unchanged.
 * Non-string leaf values are converted via String().
 * Arrays are not recursed — they are stringified as-is.
 *
 * @param obj Object to flatten (or nested structure)
 * @param prefix Current dot-notation prefix (used recursively)
 * @param result Accumulator map (used recursively)
 * @returns Flattened Map with all keys in dot-notation form
 */
function flattenTranslations(
	obj: Record<string, unknown>,
	prefix = "",
	result: FlatTranslations = new Map()
): FlatTranslations {
	for (const [key, value] of Object.entries(obj)) {
		const dotKey = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			flattenTranslations(value as Record<string, unknown>, dotKey, result);
		} else {
			result.set(dotKey, String(value ?? ""));
		}
	}
	return result;
}

// ============= Loader =============

/**
 * Loads and caches locale translation bundles from JSON files.
 * Supports file watching for hot-reload in development.
 */
export class TranslationLoader {
	private cache: Map<string, LocaleBundle> = new Map();
	private watchers: Map<string, ReturnType<typeof watch>> = new Map();
	private config: ResolvedI18nConfig;

	constructor(config: ResolvedI18nConfig) {
		this.config = config;
	}

	/**
	 * Load a locale bundle. Returns from cache if already loaded.
	 *
	 * For the default locale:
	 *   - Throws if the file is not found (cannot proceed without defaults)
	 *
	 * For non-default locales:
	 *   - Returns an empty bundle if the file is not found
	 *   - Fallback in the engine will handle the miss
	 *
	 * @param locale Locale identifier to load
	 * @returns LocaleBundle with flattened translations
	 * @throws Error if default locale file is not found
	 */
	load(locale: string): LocaleBundle {
		const cached = this.cache.get(locale);
		if (cached) return cached;

		return this._loadFromDisk(locale);
	}

	/**
	 * Pre-load all supported locales eagerly.
	 * Call this once at application startup for best performance.
	 *
	 * Non-default locales that are missing are silently skipped
	 * (returning empty bundles).
	 */
	preload(): void {
		for (const locale of this.config.supportedLocales) {
			try {
				this._loadFromDisk(locale);
			} catch {
				// Non-default locales may legitimately have no file yet
				if (locale !== this.config.defaultLocale) {
					this.cache.set(locale, {
						locale,
						translations: new Map(),
						loadedAt: Date.now(),
					});
				}
			}
		}
	}

	/**
	 * Invalidate a locale's cache entry.
	 * Forces a reload from disk on the next access.
	 *
	 * @param locale Locale to invalidate
	 */
	invalidate(locale: string): void {
		this.cache.delete(locale);
	}

	/**
	 * Return all currently loaded locale names.
	 *
	 * @returns Array of loaded locale identifiers
	 */
	loadedLocales(): string[] {
		return Array.from(this.cache.keys());
	}

	/**
	 * Enable file watching for a locale (hot reload in dev mode).
	 * Invalidates cache and reloads on file change.
	 *
	 * @param locale Locale file to watch
	 */
	watch(locale: string): void {
		const filePath = this._resolvePath(locale);
		if (!existsSync(filePath)) return;
		if (this.watchers.has(locale)) return;

		const watcher = watch(filePath, () => {
			this.invalidate(locale);
			try {
				this._loadFromDisk(locale);
			} catch {
				// Ignore parse errors during hot reload — log in production
			}
		});

		this.watchers.set(locale, watcher);
	}

	/**
	 * Stop all file watchers.
	 * Call this when the application shuts down.
	 */
	stopWatching(): void {
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
	}

	// ============= Private Helpers =============

	/**
	 * Resolve the full file path for a locale.
	 * @param locale Locale identifier
	 * @returns Full file path to the locale JSON file
	 */
	private _resolvePath(locale: string): string {
		return resolve(join(this.config.basePath, `${locale}.json`));
	}

	/**
	 * Load a locale file from disk and cache it.
	 * @param locale Locale to load
	 * @returns LocaleBundle with flattened translations
	 * @throws Error if default locale file is not found or JSON is invalid
	 */
	private _loadFromDisk(locale: string): LocaleBundle {
		const filePath = this._resolvePath(locale);

		if (!existsSync(filePath)) {
			if (locale === this.config.defaultLocale) {
				throw new Error(
					`[i18n] Default locale file not found: ${filePath}. ` +
					`Create ${locale}.json in ${this.config.basePath}`
				);
			}
			// For non-default locales, silently return an empty bundle
			const empty: LocaleBundle = {
				locale,
				translations: new Map(),
				loadedAt: Date.now(),
			};
			this.cache.set(locale, empty);
			return empty;
		}

		const raw = readFileSync(filePath, "utf-8");
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			throw new Error(`[i18n] Failed to parse locale file ${filePath}: ${String(err)}`);
		}

		const bundle: LocaleBundle = {
			locale,
			translations: flattenTranslations(parsed),
			loadedAt: Date.now(),
		};
		this.cache.set(locale, bundle);
		return bundle;
	}
}
