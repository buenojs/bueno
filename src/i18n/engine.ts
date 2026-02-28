/**
 * i18n Engine — Translation Lookup and Interpolation
 *
 * Orchestrates locale loading and exposes the t() translation function.
 * Handles pluralisation, variable interpolation, fallback, and metrics.
 */

import { TranslationLoader } from "./loader";
import { LocaleNegotiator } from "./negotiator";
import type {
	I18nConfig,
	I18nMetrics,
	PluralKey,
	ResolvedI18nConfig,
	TranslationFunction,
	TranslationParams,
} from "./types";

// ============= Defaults =============

const DEFAULT_I18N_CONFIG: ResolvedI18nConfig = {
	defaultLocale: "en",
	supportedLocales: ["en"],
	basePath: "resources/i18n",
	fallbackToDefault: true,
	cookieName: "bueno_locale",
	cookieMaxAge: 31536000,
};

// ============= Plural Resolution =============

/**
 * Select the appropriate plural key based on the count value.
 * Uses simple English-style pluralisation (zero, one, other).
 *
 * Resolution:
 * - count === 0  → look for "{key}_zero", fall back to "{key}_other"
 * - count === 1  → look for "{key}_one", fall back to "{key}_other"
 * - else         → look for "{key}_other"
 *
 * If no plural variant is found, returns the bare key
 * (allowing non-plural strings to be used without variants).
 *
 * For full CLDR support (two, few, many forms), users can subclass
 * and override this function.
 *
 * @param count The count parameter from translation params
 * @param availableKeys Set of all available key names (for fast lookup)
 * @param base Base key name (without _zero/_one/_other suffix)
 * @returns The resolved plural key to use
 */
function selectPluralKey(
	count: number,
	availableKeys: Set<string>,
	base: string,
): string {
	const candidates: PluralKey[] =
		count === 0
			? ["zero", "other"]
			: count === 1
				? ["one", "other"]
				: ["other"];

	for (const form of candidates) {
		const candidate = `${base}_${form}`;
		if (availableKeys.has(candidate)) return candidate;
	}
	return base; // fall back to bare key (caller handles missing)
}

// ============= Interpolation =============

/**
 * Replace {{ name }} and {{ name }} placeholders with values from params.
 *
 * Regex: /\{\{\s*(\w+)\s*\}\}/g
 * Matches: {{ key }}, {{key}}, {{ key}} (with optional whitespace)
 *
 * Unresolved placeholders (key not in params) are replaced with empty string.
 *
 * @example
 * interpolate("Hello, {{name}}!", { name: "Alice" }) → "Hello, Alice!"
 * interpolate("You have {{count}} items", { count: 3 }) → "You have 3 items"
 * interpolate("Hello {{missing}}", {}) → "Hello "
 *
 * @param template Template string with {{ }} placeholders
 * @param params Key-value pairs for interpolation
 * @returns Interpolated string
 */
function interpolate(template: string, params: TranslationParams): string {
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
		const val = params[key];
		return val === undefined || val === null ? "" : String(val);
	});
}

// ============= I18n Engine =============

/**
 * Main i18n engine.
 * Handles translation lookup, plural forms, interpolation, and caching.
 *
 * Usage:
 * ```
 * const i18n = new I18n({ defaultLocale: 'en', supportedLocales: ['en', 'fr'] });
 * i18n.preload(); // optional
 * const t = i18n.createTranslator('fr');
 * console.log(t('greeting', { name: 'Alice' })); // from fr.json
 * ```
 */
export class I18n {
	private loader: TranslationLoader;
	private negotiator: LocaleNegotiator;
	readonly config: ResolvedI18nConfig;
	private metrics: I18nMetrics = {
		totalLookups: 0,
		hits: 0,
		fallbacks: 0,
		misses: 0,
		loadedLocales: [],
	};

	/**
	 * Create an i18n engine.
	 * @param config Optional configuration (all fields are optional)
	 */
	constructor(config: I18nConfig = {}) {
		this.config = {
			defaultLocale: config.defaultLocale ?? DEFAULT_I18N_CONFIG.defaultLocale,
			supportedLocales:
				config.supportedLocales ?? DEFAULT_I18N_CONFIG.supportedLocales,
			basePath: config.basePath ?? DEFAULT_I18N_CONFIG.basePath,
			fallbackToDefault:
				config.fallbackToDefault ?? DEFAULT_I18N_CONFIG.fallbackToDefault,
			cookieName: config.cookieName ?? DEFAULT_I18N_CONFIG.cookieName,
			cookieMaxAge: config.cookieMaxAge ?? DEFAULT_I18N_CONFIG.cookieMaxAge,
		};

		this.loader = new TranslationLoader(this.config);
		this.negotiator = new LocaleNegotiator(
			this.config.supportedLocales,
			this.config.defaultLocale,
		);
	}

	/**
	 * Pre-load all supported locale files at startup.
	 * Optional — lazy loading works without calling this.
	 * Useful for production to catch missing files early.
	 */
	preload(): void {
		this.loader.preload();
	}

	/**
	 * Enable hot-reload file watching for all supported locales.
	 * Should only be called in development mode.
	 */
	watchAll(): void {
		for (const locale of this.config.supportedLocales) {
			this.loader.watch(locale);
		}
	}

	/**
	 * Stop all file watchers.
	 * Call this when the application shuts down.
	 */
	stopWatching(): void {
		this.loader.stopWatching();
	}

	/**
	 * Return a bound translation function for the given locale.
	 * This is what gets stored on context: ctx.set('t', ...)
	 *
	 * @param locale Locale to create translator for
	 * @returns TranslationFunction bound to that locale
	 */
	createTranslator(locale: string): TranslationFunction {
		return (key: string, params?: TranslationParams): string => {
			return this.t(locale, key, params);
		};
	}

	/**
	 * Primary translation lookup.
	 *
	 * Resolution order:
	 * 1. Check `locale` translations
	 *    a. If `params.count` is provided, try plural key first ({key}_one, {key}_other, etc.)
	 *    b. Then try bare key
	 * 2. If fallbackToDefault and locale !== defaultLocale, repeat step 1 for defaultLocale
	 * 3. Return the key string as last resort
	 *
	 * Metrics are tracked: hits (found in locale), fallbacks (found in default),
	 * misses (returned key string).
	 *
	 * @param locale Locale to translate in
	 * @param key Translation key (supports dot-notation for nested keys)
	 * @param params Optional translation parameters (interpolation + plural count)
	 * @returns Translated string, or key string if not found
	 */
	t(locale: string, key: string, params?: TranslationParams): string {
		this.metrics.totalLookups++;

		const hasCount =
			params !== undefined &&
			"count" in params &&
			typeof params.count === "number";

		// Attempt resolution in given locale
		const result = this._resolve(locale, key, params, hasCount);
		if (result !== null) {
			this.metrics.hits++;
			return result;
		}

		// Fallback to default locale
		if (this.config.fallbackToDefault && locale !== this.config.defaultLocale) {
			const fallbackResult = this._resolve(
				this.config.defaultLocale,
				key,
				params,
				hasCount,
			);
			if (fallbackResult !== null) {
				this.metrics.fallbacks++;
				return fallbackResult;
			}
		}

		// Complete miss — return the key path
		this.metrics.misses++;
		return key;
	}

	/**
	 * Returns the LocaleNegotiator instance for use by middleware.
	 * @returns LocaleNegotiator instance
	 */
	getNegotiator(): LocaleNegotiator {
		return this.negotiator;
	}

	/**
	 * Get current translation metrics.
	 * Useful for debugging and performance monitoring.
	 * @returns Current I18nMetrics
	 */
	getMetrics(): I18nMetrics {
		return {
			...this.metrics,
			loadedLocales: this.loader.loadedLocales(),
		};
	}

	// ============= Private Helpers =============

	/**
	 * Resolve a translation key in a specific locale.
	 * Returns null if not found (to distinguish from a successful empty string).
	 *
	 * @param locale Locale to resolve in
	 * @param key Translation key
	 * @param params Translation parameters
	 * @param hasCount Whether params contains a count field
	 * @returns Translated string, or null if not found
	 */
	private _resolve(
		locale: string,
		key: string,
		params: TranslationParams | undefined,
		hasCount: boolean,
	): string | null {
		const bundle = this.loader.load(locale);
		const translations = bundle.translations;
		const availableKeys = new Set(translations.keys());

		let resolvedKey = key;

		// Plural selection
		if (hasCount) {
			resolvedKey = selectPluralKey(params!.count!, availableKeys, key);
		}

		const raw = translations.get(resolvedKey);
		if (raw === undefined) return null;

		return params ? interpolate(raw, params) : raw;
	}
}

// ============= Factory =============

/**
 * Create an i18n engine.
 * Convenience factory for new I18n(config).
 *
 * @param config Optional configuration
 * @returns New I18n instance
 */
export function createI18n(config?: I18nConfig): I18n {
	return new I18n(config);
}
