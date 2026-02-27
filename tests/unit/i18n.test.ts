/**
 * i18n System Unit Tests
 *
 * Tests for: locale negotiation, translation loader, translation engine,
 * plural forms, interpolation, fallback, middleware, and helpers.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
	I18n,
	createI18n,
	LocaleNegotiator,
	parseAcceptLanguage,
	normaliseLocale,
	TranslationLoader,
	i18nMiddleware,
	getLocale,
	getT,
} from "../../src/i18n";
import { Context } from "../../src/context";

const TEST_DIR = resolve("./tests/.i18n");

// ============= Helpers =============

/**
 * Create a locale JSON file for testing
 */
function createLocaleFile(locale: string, data: Record<string, unknown>) {
	mkdirSync(TEST_DIR, { recursive: true });
	writeFileSync(
		resolve(TEST_DIR, `${locale}.json`),
		JSON.stringify(data)
	);
}

/**
 * Clean up test directory
 */
function cleanup() {
	try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}

// ============= 1. parseAcceptLanguage =============

describe("parseAcceptLanguage", () => {
	test("should parse simple header", () => {
		const result = parseAcceptLanguage("en");
		expect(result).toHaveLength(1);
		expect(result[0]!.locale).toBe("en");
		expect(result[0]!.quality).toBe(1.0);
	});

	test("should parse multi-value header with qualities", () => {
		const result = parseAcceptLanguage("en-US,en;q=0.9,fr;q=0.8");
		expect(result).toHaveLength(3);
		expect(result[0]!.locale).toBe("en-US");
		expect(result[0]!.quality).toBe(1.0);
		expect(result[1]!.locale).toBe("en");
		expect(result[1]!.quality).toBe(0.9);
		expect(result[2]!.locale).toBe("fr");
		expect(result[2]!.quality).toBe(0.8);
	});

	test("should sort by quality descending", () => {
		const result = parseAcceptLanguage("fr;q=0.5,en;q=0.9,de;q=0.7");
		expect(result.map((e) => e.locale)).toEqual(["en", "de", "fr"]);
	});

	test("should return empty array for empty string", () => {
		expect(parseAcceptLanguage("")).toHaveLength(0);
		expect(parseAcceptLanguage("   ")).toHaveLength(0);
	});
});

// ============= 2. normaliseLocale =============

describe("normaliseLocale", () => {
	test("should lowercase language subtag", () => {
		expect(normaliseLocale("EN")).toBe("en");
	});

	test("should uppercase region subtag", () => {
		expect(normaliseLocale("en-us")).toBe("en-US");
	});

	test("should convert underscore to hyphen", () => {
		expect(normaliseLocale("en_US")).toBe("en-US");
	});

	test("should handle single subtag", () => {
		expect(normaliseLocale("fr")).toBe("fr");
	});
});

// ============= 3. LocaleNegotiator =============

describe("LocaleNegotiator", () => {
	let negotiator: LocaleNegotiator;

	beforeEach(() => {
		negotiator = new LocaleNegotiator(["en", "fr", "de"], "en");
	});

	test("should return exact match", () => {
		const match = negotiator.negotiate("fr");
		expect(match.locale).toBe("fr");
		expect(match.strategy).toBe("exact");
	});

	test("should match by language prefix ('fr-CA' → 'fr')", () => {
		const match = negotiator.negotiate("fr-CA");
		expect(match.locale).toBe("fr");
		expect(match.strategy).toBe("prefix");
	});

	test("should prefer higher quality locale", () => {
		const match = negotiator.negotiate("de;q=0.9,fr;q=0.8");
		expect(match.locale).toBe("de");
	});

	test("should fall back to default when no match", () => {
		const match = negotiator.negotiate("zh-TW,zh;q=0.9");
		expect(match.locale).toBe("en");
		expect(match.strategy).toBe("default");
	});

	test("should return default for empty header", () => {
		const match = negotiator.negotiate("");
		expect(match.locale).toBe("en");
		expect(match.strategy).toBe("default");
	});

	test("should validate supported locale", () => {
		expect(negotiator.isSupported("fr")).toBe(true);
		expect(negotiator.isSupported("zh")).toBe(false);
	});

	test("should prefer exact over prefix match across entries", () => {
		// fr-CA is exact candidate, fr is prefix candidate for fr-BE
		const neg = new LocaleNegotiator(["en", "fr", "fr-CA"], "en");
		const match = neg.negotiate("fr-CA,fr-BE;q=0.9");
		expect(match.locale).toBe("fr-CA");
		expect(match.strategy).toBe("exact");
	});
});

// ============= 4. TranslationLoader =============

describe("TranslationLoader", () => {
	afterEach(cleanup);

	test("should load flat JSON locale file", () => {
		createLocaleFile("en", { welcome: "Welcome", "nav.home": "Home" });
		const loader = new TranslationLoader({
			defaultLocale: "en",
			supportedLocales: ["en"],
			basePath: TEST_DIR,
			fallbackToDefault: true,
			cookieName: "bueno_locale",
			cookieMaxAge: 31536000,
		});
		const bundle = loader.load("en");
		expect(bundle.translations.get("welcome")).toBe("Welcome");
		expect(bundle.translations.get("nav.home")).toBe("Home");
	});

	test("should flatten nested JSON keys", () => {
		createLocaleFile("en", {
			nav: { home: "Home", about: "About" },
			greeting: "Hi",
		});
		const loader = new TranslationLoader({
			defaultLocale: "en",
			supportedLocales: ["en"],
			basePath: TEST_DIR,
			fallbackToDefault: true,
			cookieName: "bueno_locale",
			cookieMaxAge: 31536000,
		});
		const bundle = loader.load("en");
		expect(bundle.translations.get("nav.home")).toBe("Home");
		expect(bundle.translations.get("nav.about")).toBe("About");
		expect(bundle.translations.get("greeting")).toBe("Hi");
	});

	test("should return empty bundle for missing non-default locale", () => {
		createLocaleFile("en", { welcome: "Welcome" });
		const loader = new TranslationLoader({
			defaultLocale: "en",
			supportedLocales: ["en", "fr"],
			basePath: TEST_DIR,
			fallbackToDefault: true,
			cookieName: "bueno_locale",
			cookieMaxAge: 31536000,
		});
		const bundle = loader.load("fr");
		expect(bundle.translations.size).toBe(0);
	});

	test("should throw for missing default locale file", () => {
		const loader = new TranslationLoader({
			defaultLocale: "en",
			supportedLocales: ["en"],
			basePath: TEST_DIR,
			fallbackToDefault: true,
			cookieName: "bueno_locale",
			cookieMaxAge: 31536000,
		});
		expect(() => loader.load("en")).toThrow(/Default locale file not found/);
	});

	test("should cache loaded bundle", () => {
		createLocaleFile("en", { welcome: "Welcome" });
		const loader = new TranslationLoader({
			defaultLocale: "en",
			supportedLocales: ["en"],
			basePath: TEST_DIR,
			fallbackToDefault: true,
			cookieName: "bueno_locale",
			cookieMaxAge: 31536000,
		});
		const b1 = loader.load("en");
		const b2 = loader.load("en");
		// Same object reference (from cache)
		expect(b1).toBe(b2);
	});

	test("should invalidate cache", () => {
		createLocaleFile("en", { welcome: "Welcome" });
		const loader = new TranslationLoader({
			defaultLocale: "en",
			supportedLocales: ["en"],
			basePath: TEST_DIR,
			fallbackToDefault: true,
			cookieName: "bueno_locale",
			cookieMaxAge: 31536000,
		});
		const b1 = loader.load("en");
		loader.invalidate("en");
		const b2 = loader.load("en");
		expect(b1).not.toBe(b2);
	});
});

// ============= 5. I18n Engine — Core Translation =============

describe("I18n engine", () => {
	afterEach(cleanup);

	function makeEngine() {
		createLocaleFile("en", {
			welcome: "Welcome",
			greeting: "Hello, {{name}}!",
			nav: { home: "Home", about: "About" },
			items_zero: "No items",
			items_one: "One item",
			items_other: "{{count}} items",
		});
		createLocaleFile("fr", {
			welcome: "Bienvenue",
			greeting: "Bonjour, {{name}}!",
		});
		return createI18n({
			defaultLocale: "en",
			supportedLocales: ["en", "fr"],
			basePath: TEST_DIR,
		});
	}

	test("should translate a flat key", () => {
		const engine = makeEngine();
		expect(engine.t("en", "welcome")).toBe("Welcome");
	});

	test("should translate a nested key using dot notation", () => {
		const engine = makeEngine();
		expect(engine.t("en", "nav.home")).toBe("Home");
	});

	test("should interpolate variables", () => {
		const engine = makeEngine();
		expect(engine.t("en", "greeting", { name: "Alice" })).toBe("Hello, Alice!");
	});

	test("should return empty string for missing variable", () => {
		const engine = makeEngine();
		expect(engine.t("en", "greeting", {})).toBe("Hello, !");
	});

	test("should fall back to default locale for missing key", () => {
		const engine = makeEngine();
		// 'nav.home' exists in 'en' but not in 'fr'
		expect(engine.t("fr", "nav.home")).toBe("Home");
	});

	test("should return key string for complete miss", () => {
		const engine = makeEngine();
		expect(engine.t("en", "nonexistent.key")).toBe("nonexistent.key");
	});

	test("should translate in requested locale when available", () => {
		const engine = makeEngine();
		expect(engine.t("fr", "welcome")).toBe("Bienvenue");
	});

	// ============= Plural forms =============

	describe("Plural forms", () => {
		test("should use _zero form for count=0", () => {
			const engine = makeEngine();
			expect(engine.t("en", "items", { count: 0 })).toBe("No items");
		});

		test("should use _one form for count=1", () => {
			const engine = makeEngine();
			expect(engine.t("en", "items", { count: 1 })).toBe("One item");
		});

		test("should use _other form for count=3", () => {
			const engine = makeEngine();
			expect(engine.t("en", "items", { count: 3 })).toBe("3 items");
		});

		test("should fall back to bare key when plural variants missing", () => {
			const engine = makeEngine();
			// count=1 → looks for welcome_one → not found → falls back to welcome
			expect(engine.t("en", "welcome", { count: 1 })).toBe("Welcome");
		});
	});

	// ============= Metrics =============

	describe("Metrics", () => {
		test("should track hits, fallbacks, misses", () => {
			const engine = makeEngine();
			engine.t("en", "welcome");             // hit
			engine.t("fr", "nav.home");            // fallback
			engine.t("en", "does.not.exist");      // miss
			const m = engine.getMetrics();
			expect(m.totalLookups).toBe(3);
			expect(m.hits).toBe(1);
			expect(m.fallbacks).toBe(1);
			expect(m.misses).toBe(1);
		});
	});

	// ============= createTranslator =============

	test("createTranslator should return bound t function", () => {
		const engine = makeEngine();
		const t = engine.createTranslator("fr");
		expect(t("welcome")).toBe("Bienvenue");
		expect(t("nav.home")).toBe("Home"); // falls back to 'en'
	});
});

// ============= 6. i18nMiddleware =============

describe("i18nMiddleware", () => {
	afterEach(cleanup);

	function createRequest(headers: Record<string, string> = {}): Request {
		return new Request("http://localhost/test", { headers });
	}

	function runMiddleware(req: Request, options: Record<string, unknown> = {}) {
		createLocaleFile("en", { welcome: "Welcome" });
		createLocaleFile("fr", { welcome: "Bienvenue" });
		const middleware = i18nMiddleware({
			defaultLocale: "en",
			supportedLocales: ["en", "fr"],
			basePath: TEST_DIR,
			...options,
		});
		const ctx = new Context(req);
		const handler = async () => new Response("OK");
		return { ctx, run: () => middleware(ctx, handler) };
	}

	test("should detect locale from Accept-Language header", async () => {
		const req = createRequest({ "accept-language": "fr,en;q=0.9" });
		const { ctx, run } = runMiddleware(req);
		await run();
		expect(getLocale(ctx)).toBe("fr");
	});

	test("should prefer cookie over Accept-Language header", async () => {
		const req = createRequest({
			"accept-language": "fr",
			"cookie": "bueno_locale=en",
		});
		const { ctx, run } = runMiddleware(req);
		await run();
		expect(getLocale(ctx)).toBe("en");
	});

	test("should fall back to default locale", async () => {
		const req = createRequest({ "accept-language": "zh-TW" });
		const { ctx, run } = runMiddleware(req);
		await run();
		expect(getLocale(ctx)).toBe("en");
	});

	test("should set t() on context", async () => {
		const req = createRequest({ "accept-language": "fr" });
		const { ctx, run } = runMiddleware(req);
		await run();
		const t = getT(ctx);
		expect(t("welcome")).toBe("Bienvenue");
	});

	test("should set Set-Cookie header on response", async () => {
		const req = createRequest({ "accept-language": "fr" });
		const { run } = runMiddleware(req);
		const response = await run();
		const setCookie = response.headers.get("set-cookie");
		expect(setCookie).toContain("bueno_locale=fr");
		expect(setCookie).toContain("Max-Age=31536000");
	});

	test("should set Vary: Accept-Language header", async () => {
		const req = createRequest();
		const { run } = runMiddleware(req);
		const response = await run();
		expect(response.headers.get("vary")).toContain("Accept-Language");
	});

	test("should ignore unsupported cookie locale and use header", async () => {
		const req = createRequest({
			"accept-language": "fr",
			"cookie": "bueno_locale=zh",  // unsupported
		});
		const { ctx, run } = runMiddleware(req);
		await run();
		expect(getLocale(ctx)).toBe("fr"); // fell through to header
	});
});

// ============= 7. getLocale / getT helpers =============

describe("getLocale and getT helpers", () => {
	test("getLocale should return 'en' when middleware has not run", () => {
		const ctx = new Context(new Request("http://localhost/"));
		expect(getLocale(ctx)).toBe("en");
	});

	test("getT should return identity function when middleware has not run", () => {
		const ctx = new Context(new Request("http://localhost/"));
		const t = getT(ctx);
		expect(t("any.key")).toBe("any.key");
	});
});
