/**
 * i18n Middleware — Locale Detection and Translation Binding
 *
 * Detects locale from cookie (priority 1) then Accept-Language header (priority 2),
 * binds t() and locale to context, persists locale choice in a cookie.
 */

import type { Context } from "../context";
import type { Middleware } from "../middleware";
import { type I18n, createI18n } from "./engine";
import type { I18nConfig, TranslationFunction } from "./types";

// ============= Typed Context Helpers =============

/**
 * Get the current locale from context.
 * Typed helper for accessing the locale set by i18nMiddleware.
 *
 * Returns the default locale ("en") if middleware has not run.
 * Useful in route handlers:
 *
 * @example
 * router.get('/locale', (ctx) => {
 *   const locale = getLocale(ctx);  // 'fr', 'en', etc.
 *   return ctx.json({ locale });
 * });
 *
 * @param ctx Bueno Context instance
 * @returns Current locale, or "en" if middleware hasn't run
 */
export function getLocale(ctx: Context): string {
	return (ctx.get("locale") as string | undefined) ?? "en";
}

/**
 * Get the bound translation function from context.
 * Typed helper for accessing the t() set by i18nMiddleware.
 *
 * Returns an identity function (returns key as-is) if middleware has not run.
 * Useful in route handlers:
 *
 * @example
 * router.get('/greeting', (ctx) => {
 *   const t = getT(ctx);
 *   const message = t('greeting', { name: 'Alice' });
 *   return ctx.text(message);
 * });
 *
 * @param ctx Bueno Context instance
 * @returns Translation function, or identity function if middleware hasn't run
 */
export function getT(ctx: Context): TranslationFunction {
	return (ctx.get("t") as TranslationFunction | undefined) ?? ((key) => key);
}

// ============= Middleware Options =============

/**
 * Options for i18nMiddleware.
 * Extends I18nConfig and adds an optional pre-constructed I18n instance.
 */
export interface I18nMiddlewareOptions extends I18nConfig {
	/**
	 * Pre-constructed I18n instance.
	 * If not provided, one is created from the other options.
	 *
	 * Pass this when you want a single shared instance across multiple
	 * middleware chains or route groups (prevents double-loading locale files).
	 */
	i18n?: I18n;
}

// ============= Middleware Factory =============

/**
 * Create i18n middleware.
 *
 * Locale detection priority:
 * 1. Cookie (bueno_locale or custom cookieName)
 * 2. Accept-Language header
 * 3. Default locale (config.defaultLocale)
 *
 * Sets on context (available via getLocale/getT):
 * - ctx.set('locale', detectedLocale)
 * - ctx.set('t', translationFunction)
 *
 * Sets on response:
 * - Set-Cookie header to persist locale choice
 * - Vary: Accept-Language header (for correct CDN caching)
 *
 * @example
 * ```typescript
 * const router = new Router();
 * router.use(i18nMiddleware({
 *   defaultLocale: 'en',
 *   supportedLocales: ['en', 'fr', 'de'],
 *   basePath: 'resources/i18n'
 * }));
 *
 * router.get('/hello', (ctx) => {
 *   const locale = getLocale(ctx);
 *   const t = getT(ctx);
 *   return ctx.json({ message: t('greeting') });
 * });
 * ```
 *
 * @param options Configuration options
 * @returns Koa-style middleware function
 */
export function i18nMiddleware(
	options: I18nMiddlewareOptions = {},
): Middleware {
	const engine = options.i18n ?? createI18n(options);
	const negotiator = engine.getNegotiator();
	const cookieName = engine.config.cookieName;
	const cookieMaxAge = engine.config.cookieMaxAge;

	return async (
		ctx: Context,
		next: () => Promise<Response>,
	): Promise<Response> => {
		// --- Step 1: Detect locale ---
		let locale: string;

		// Priority 1: Cookie
		const cookieLocale = ctx.getCookie(cookieName);
		if (cookieLocale && negotiator.isSupported(cookieLocale)) {
			locale = cookieLocale;
		} else {
			// Priority 2: Accept-Language header
			const acceptLanguage = ctx.getHeader("accept-language") ?? "";
			if (acceptLanguage) {
				const match = negotiator.negotiate(acceptLanguage);
				locale = match.locale;
			} else {
				locale = engine.config.defaultLocale;
			}
		}

		// --- Step 2: Store on context ---
		// Use 'as never' cast for now (same pattern as requestId middleware)
		// Typed access via getLocale(ctx) and getT(ctx) helpers
		ctx.set("locale" as never, locale);
		ctx.set("t" as never, engine.createTranslator(locale));

		// --- Step 3: Call next ---
		const response = await next();

		// --- Step 4: Set cookie on response ---
		// Always refresh the cookie so it stays alive during user session
		const cookieValue = `${cookieName}=${locale}; Max-Age=${cookieMaxAge}; Path=/; SameSite=Lax`;
		response.headers.append("Set-Cookie", cookieValue);

		// --- Step 5: Set Vary header ---
		// Instruct caches to vary on Accept-Language so different locales are cached separately
		const existing = response.headers.get("Vary");
		response.headers.set(
			"Vary",
			existing ? `${existing}, Accept-Language` : "Accept-Language",
		);

		return response;
	};
}
