/**
 * i18n Types and Interfaces
 *
 * Core types for the internationalisation system:
 * locale negotiation, translation lookup, plural forms, and configuration.
 */

// ============= CLDR Plural Keys =============

/**
 * CLDR-standard plural form categories.
 * Used to select the appropriate plural variant of a translation.
 *
 * @see https://cldr.unicode.org/index/cldr-spec/plural-rules
 */
export type PluralKey = "zero" | "one" | "two" | "few" | "many" | "other";

// ============= Translation Types =============

/**
 * Raw translation file shape — can be flat or nested JSON.
 * @example
 * { "nav.home": "Home" } or { "nav": { "home": "Home" } }
 */
export type TranslationMap = Record<string, unknown>;

/**
 * Flat map of dot-notation keys → string values.
 * The loader always normalises nested keys to this format before caching.
 * @example
 * Map { "nav.home" → "Home", "nav.about" → "About" }
 */
export type FlatTranslations = Map<string, string>;

/**
 * Parameters passed to the translation function.
 * `count` is special — it drives plural form selection.
 * Other keys are used for variable interpolation ({{ key }}).
 */
export interface TranslationParams {
	count?: number;
	[key: string]: unknown;
}

/**
 * The t() function signature stored on context and returned by the engine.
 * @example
 * t('greeting', { name: 'Alice' }) → "Hello, Alice!"
 */
export type TranslationFunction = (key: string, params?: TranslationParams) => string;

// ============= Locale Negotiation =============

/**
 * Result of a locale negotiation attempt against supported locales.
 * Used to determine which locale to load based on client preferences.
 */
export interface LocaleMatch {
	/** The matched locale from supportedLocales (e.g. "fr") */
	locale: string;
	/** How the match was found: exact string match, language prefix match, or default */
	strategy: "exact" | "prefix" | "default";
	/** The original value that was negotiated (e.g. "fr-CA" from Accept-Language) */
	source: string;
}

// ============= I18n Context (what is stored on ctx) =============

/**
 * What the middleware stores on the Bueno Context instance.
 * Accessed via ctx.get('locale') and ctx.get('t').
 * Typed helpers getLocale(ctx) and getT(ctx) are recommended.
 */
export interface I18nContext {
	locale: string;
	t: TranslationFunction;
}

// ============= I18n Configuration =============

/**
 * User-facing i18n configuration.
 * All fields are optional; defaults are applied by the engine.
 * Environment variable pattern: BUENO_I18N_*
 */
export interface I18nConfig {
	/** Enable/disable the i18n system (default: false) */
	enabled?: boolean;
	/** Default locale — used as fallback when requested locale has missing keys (default: "en") */
	defaultLocale?: string;
	/** List of all supported locale identifiers (default: ["en"]) */
	supportedLocales?: string[];
	/** Base directory for locale JSON files (default: "resources/i18n") */
	basePath?: string;
	/**
	 * When a key is missing in the requested locale,
	 * fall back to the defaultLocale before returning the key string (default: true)
	 */
	fallbackToDefault?: boolean;
	/** Cookie name used to persist locale choice (default: "bueno_locale") */
	cookieName?: string;
	/** Cookie max-age in seconds (default: 31536000 = 1 year) */
	cookieMaxAge?: number;
	/** Enable file watching for hot reload in development (default: false) */
	watch?: boolean;
}

// ============= Resolved I18n Config (internal) =============

/**
 * Fully-resolved i18n configuration with all defaults applied.
 * All fields are required (non-optional) — used internally by the engine.
 */
export interface ResolvedI18nConfig {
	defaultLocale: string;
	supportedLocales: string[];
	basePath: string;
	fallbackToDefault: boolean;
	cookieName: string;
	cookieMaxAge: number;
}

// ============= Loader Types =============

/**
 * A loaded and cached locale bundle.
 * Contains flattened translations and metadata.
 */
export interface LocaleBundle {
	/** Locale identifier e.g. "en", "fr-CA" */
	locale: string;
	/** Flat dot-notation key → string value map */
	translations: FlatTranslations;
	/** When this bundle was loaded (ms epoch) */
	loadedAt: number;
}

// ============= Metrics =============

/**
 * Metrics collected by the translation engine.
 * Useful for debugging and performance monitoring.
 */
export interface I18nMetrics {
	/** Total number of t() calls */
	totalLookups: number;
	/** Lookups that found a key in the requested locale */
	hits: number;
	/** Lookups that fell back to the default locale */
	fallbacks: number;
	/** Lookups that returned the key string (complete miss) */
	misses: number;
	/** Locales currently loaded in memory */
	loadedLocales: string[];
}
