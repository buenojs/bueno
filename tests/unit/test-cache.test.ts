import { describe, test, expect } from "bun:test";
import {
	createTestCache,
	TestCache,
	assertCacheHas,
	assertCacheNotHas,
	assertCacheValue,
	assertCacheStats,
} from "../../src/testing/index";

describe("TestCache", () => {
	test("should create cache with initial data", async () => {
		const cache = await createTestCache({ user: { id: 1, name: "Test" } });
		const user = await cache.get("user");
		expect(user).toEqual({ id: 1, name: "Test" });
	});

	test("should track operations", async () => {
		const cache = new TestCache();
		await cache.set("key1", "value1");
		await cache.get("key1");
		await cache.get("missing");

		expect(cache.operations).toHaveLength(3);
		expect(cache.operations[0].type).toBe("set");
		expect(cache.operations[1].type).toBe("get");
	});

	test("should track statistics", async () => {
		const cache = new TestCache();
		await cache.set("key1", "value1");
		await cache.get("key1"); // hit
		await cache.get("missing"); // miss

		const stats = cache.getStats();
		expect(stats.hits).toBe(1);
		expect(stats.misses).toBe(1);
		expect(stats.sets).toBe(1);
		expect(stats.keyCount).toBe(1);
	});

	test("peek should not affect stats", async () => {
		const cache = new TestCache();
		await cache.set("key1", "value1");
		cache.peek("key1");
		cache.peek("missing");

		const stats = cache.getStats();
		expect(stats.hits).toBe(0);
		expect(stats.misses).toBe(0);
	});

	test("setMany should set multiple entries", async () => {
		const cache = new TestCache();
		await cache.setMany({ a: 1, b: 2, c: 3 });

		expect(cache.getKeys()).toContain("a");
		expect(cache.getKeys()).toContain("b");
		expect(cache.getKeys()).toContain("c");
	});

	test("reset should clear everything", async () => {
		const cache = new TestCache();
		await cache.set("key1", "value1");
		await cache.get("key1");
		cache.reset();

		expect(cache.getKeys()).toHaveLength(0);
		expect(cache.operations).toHaveLength(0);
		expect(cache.getStats().sets).toBe(0);
	});

	test("assertions should work", async () => {
		const cache = await createTestCache({ existing: "value" });

		assertCacheHas(cache, "existing");
		assertCacheNotHas(cache, "missing");
		assertCacheValue(cache, "existing", "value");
		assertCacheStats(cache, { keyCount: 1 });
	});

	test("getEntries should return all key-value pairs", async () => {
		const cache = new TestCache();
		await cache.set("a", 1);
		await cache.set("b", 2);

		const entries = cache.getEntries();
		expect(entries).toHaveLength(2);
		expect(Object.fromEntries(entries)).toEqual({ a: 1, b: 2 });
	});

	test("clearAll should clear all keys", async () => {
		const cache = new TestCache();
		await cache.set("a", 1);
		await cache.set("b", 2);
		await cache.clearAll();

		expect(cache.getKeys()).toHaveLength(0);
	});

	test("delete should track deletes in stats", async () => {
		const cache = new TestCache();
		await cache.set("key1", "value1");
		await cache.delete("key1");

		const stats = cache.getStats();
		expect(stats.deletes).toBe(1);
		expect(stats.keyCount).toBe(0);
	});
});