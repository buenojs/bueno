/**
 * i18n Module — Internationalisation for Bueno Framework
 *
 * Locale detection (cookie → Accept-Language), translation lookup with
 * dot-notation keys, variable interpolation, plural forms, and caching.
 */

// Types
export type {
	PluralKey,
	TranslationMap,
	FlatTranslations,
	TranslationParams,
	TranslationFunction,
	LocaleMatch,
	I18nContext,
	I18nConfig,
	ResolvedI18nConfig,
	LocaleBundle,
	I18nMetrics,
} from "./types";

// Core engine
export { I18n, createI18n } from "./engine";

// Loader (advanced use)
export { TranslationLoader } from "./loader";

// Negotiator (advanced use)
export {
	LocaleNegotiator,
	parseAcceptLanguage,
	normaliseLocale,
} from "./negotiator";

// Middleware
export { i18nMiddleware, getLocale, getT } from "./middleware";
export type { I18nMiddlewareOptions } from "./middleware";
