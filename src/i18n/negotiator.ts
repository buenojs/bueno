/**
 * Locale Negotiation — Accept-Language Header Parsing
 *
 * Parses RFC 7231 Accept-Language headers and matches them against
 * supported locales using exact and language-prefix matching.
 *
 * @see https://tools.ietf.org/html/rfc7231#section-5.3.5
 */

import type { LocaleMatch } from "./types";

// ============= Types =============

/**
 * Parsed entry from an Accept-Language header.
 */
interface AcceptEntry {
	locale: string; // e.g. "en-US"
	quality: number; // 0.0–1.0, default 1.0
}

// ============= Parsing =============

/**
 * Parse RFC 7231 Accept-Language header value into quality-sorted entries.
 *
 * @example
 * Input: "en-US,en;q=0.9,fr;q=0.8"
 * Output: [
 *   { locale: "en-US", quality: 1.0 },
 *   { locale: "en", quality: 0.9 },
 *   { locale: "fr", quality: 0.8 }
 * ]
 *
 * @param header Raw Accept-Language header value
 * @returns Array of entries sorted by quality (highest first)
 */
export function parseAcceptLanguage(header: string): AcceptEntry[] {
	if (!header.trim()) return [];

	return header
		.split(",")
		.map((part) => {
			const [localeRaw, qRaw] = part.trim().split(";");
			const locale = localeRaw?.trim() ?? "";
			const quality = qRaw
				? Number.parseFloat(qRaw.trim().replace("q=", ""))
				: 1.0;
			return { locale, quality: isNaN(quality) ? 1.0 : quality };
		})
		.filter((e) => e.locale.length > 0)
		.sort((a, b) => b.quality - a.quality);
}

/**
 * Normalise a locale tag:
 * - Converts underscore to hyphen ("en_US" → "en-US")
 * - Lowercases language subtag ("EN" → "en")
 * - Uppercases region subtag ("us" → "US")
 *
 * @example
 * normaliseLocale("en_US") → "en-US"
 * normaliseLocale("EN-us") → "en-US"
 * normaliseLocale("fr") → "fr"
 *
 * @param locale Raw locale string
 * @returns Normalised locale string
 */
export function normaliseLocale(locale: string): string {
	const parts = locale.replace("_", "-").split("-");
	if (parts.length === 0) return locale;
	const lang = parts[0]!.toLowerCase();
	if (parts.length === 1) return lang;
	const region = parts[1]!.toUpperCase();
	return `${lang}-${region}`;
}

/**
 * Extract the language subtag from a locale.
 * @example languageSubtag("en-US") → "en"
 * @param locale Locale identifier
 * @returns Language subtag (first part before hyphen)
 */
function languageSubtag(locale: string): string {
	return locale.split("-")[0]!.toLowerCase();
}

// ============= Negotiator =============

/**
 * Negotiates the best locale match given an Accept-Language header
 * and a list of supported locales.
 *
 * Matching strategy (two-pass):
 * 1. Exact match: find a supported locale that exactly matches (case-normalised) any entry
 * 2. Language prefix match: find a supported locale whose language subtag matches any entry
 * 3. Default: return the configured default locale
 *
 * This two-pass approach ensures correct behavior even when entries
 * are out of quality order, e.g. "fr-CA,de;q=0.9" against ["de","fr"]
 * should return "fr" (via prefix match), not "de".
 */
export class LocaleNegotiator {
	private supported: string[];
	private defaultLocale: string;

	constructor(supportedLocales: string[], defaultLocale: string) {
		this.supported = supportedLocales;
		this.defaultLocale = defaultLocale;
	}

	/**
	 * Find the best matching locale given a raw Accept-Language header string.
	 *
	 * @param acceptLanguageHeader Raw Accept-Language header value
	 * @returns LocaleMatch with matched locale and strategy used
	 */
	negotiate(acceptLanguageHeader: string): LocaleMatch {
		const entries = parseAcceptLanguage(acceptLanguageHeader);

		// Pass 1: exact match (case-normalised)
		for (const entry of entries) {
			const norm = normaliseLocale(entry.locale);

			const exact = this.supported.find((s) => normaliseLocale(s) === norm);
			if (exact) {
				return { locale: exact, strategy: "exact", source: entry.locale };
			}
		}

		// Pass 2: language prefix match ("en-US" matches supported "en")
		for (const entry of entries) {
			const lang = languageSubtag(entry.locale);

			const prefix = this.supported.find((s) => languageSubtag(s) === lang);
			if (prefix) {
				return { locale: prefix, strategy: "prefix", source: entry.locale };
			}
		}

		// Default fallback
		return {
			locale: this.defaultLocale,
			strategy: "default",
			source: "",
		};
	}

	/**
	 * Validate whether a given locale string is in the supported list.
	 * Used to validate cookie values before trusting them.
	 *
	 * Performs strict membership check — does not normalise or approximate.
	 * If a cookie contains "fr-CA" but only "fr" is supported, this returns false.
	 *
	 * @param locale Locale to validate
	 * @returns true if locale is in supportedLocales
	 */
	isSupported(locale: string): boolean {
		return this.supported.includes(locale);
	}
}
