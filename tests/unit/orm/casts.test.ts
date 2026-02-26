import { describe, test, expect } from "bun:test";
import { CastRegistry } from "../../../src/database/orm/casts";
import { Model } from "../../../src/database/orm/model";

describe("CastRegistry", () => {
	describe("deserialize (read from DB)", () => {
		test("json: string → object", () => {
			const result = CastRegistry.deserialize("json", '{"key":"value"}');
			expect(result).toEqual({ key: "value" });
		});

		test("json: already-object pass-through", () => {
			const obj = { key: "value" };
			const result = CastRegistry.deserialize("json", obj);
			expect(result).toBe(obj);
		});

		test("boolean: 1 → true", () => {
			expect(CastRegistry.deserialize("boolean", 1)).toBe(true);
		});

		test("boolean: 0 → false", () => {
			expect(CastRegistry.deserialize("boolean", 0)).toBe(false);
		});

		test('boolean: "false" → false', () => {
			expect(CastRegistry.deserialize("boolean", "false")).toBe(false);
		});

		test("boolean: true → true", () => {
			expect(CastRegistry.deserialize("boolean", true)).toBe(true);
		});

		test("integer: '42' → 42", () => {
			expect(CastRegistry.deserialize("integer", "42")).toBe(42);
		});

		test("integer: 42 → 42", () => {
			expect(CastRegistry.deserialize("integer", 42)).toBe(42);
		});

		test("float: '3.14' → 3.14", () => {
			expect(CastRegistry.deserialize("float", "3.14")).toBe(3.14);
		});

		test("float: 3.14 → 3.14", () => {
			expect(CastRegistry.deserialize("float", 3.14)).toBe(3.14);
		});

		test("date: ISO string → Date", () => {
			const date = CastRegistry.deserialize("date", "2024-02-27");
			expect(date instanceof Date).toBe(true);
		});

		test("date: null → null", () => {
			expect(CastRegistry.deserialize("date", null)).toBeNull();
		});

		test("datetime: ISO string → Date", () => {
			const date = CastRegistry.deserialize("datetime", "2024-02-27T10:30:00Z");
			expect(date instanceof Date).toBe(true);
		});

		test("timestamp: number → Date", () => {
			const ms = 1709031000000;
			const date = CastRegistry.deserialize("timestamp", ms);
			expect(date instanceof Date).toBe(true);
			expect((date as Date).getTime()).toBe(ms);
		});

		test("timestamp: string → Date", () => {
			const ms = 1709031000000;
			const date = CastRegistry.deserialize("timestamp", ms.toString());
			expect(date instanceof Date).toBe(true);
		});
	});

	describe("serialize (write to DB)", () => {
		test("json: object → JSON string", () => {
			const result = CastRegistry.serialize("json", { key: "value" });
			expect(result).toBe('{"key":"value"}');
		});

		test("boolean: true → 1", () => {
			expect(CastRegistry.serialize("boolean", true)).toBe(1);
		});

		test("boolean: false → 0", () => {
			expect(CastRegistry.serialize("boolean", false)).toBe(0);
		});

		test("date: Date → 'YYYY-MM-DD' string", () => {
			const date = new Date("2024-02-27");
			const result = CastRegistry.serialize("date", date);
			expect(typeof result).toBe("string");
			expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
		});

		test("datetime: Date → ISO string", () => {
			const date = new Date("2024-02-27T10:30:00Z");
			const result = CastRegistry.serialize("datetime", date);
			expect(typeof result).toBe("string");
			expect(result).toContain("T");
		});

		test("timestamp: Date → millisecond number", () => {
			const date = new Date("2024-02-27T10:30:00Z");
			const result = CastRegistry.serialize("timestamp", date);
			expect(typeof result).toBe("number");
		});

		test("integer: number → number", () => {
			expect(CastRegistry.serialize("integer", 42)).toBe(42);
		});

		test("float: number → number", () => {
			expect(CastRegistry.serialize("float", 3.14)).toBe(3.14);
		});
	});

	describe("custom cast object", () => {
		test("custom get/set round-trips correctly", () => {
			const customCast = {
				get: (v: number) => v * 2,
				set: (v: number) => v / 2,
			};
			const serialized = CastRegistry.serialize(customCast, 10);
			expect(serialized).toBe(5);
			const deserialized = CastRegistry.deserialize(customCast, serialized);
			expect(deserialized).toBe(10);
		});
	});

	describe("integration: cast applied during hydrate()", () => {
		test("Model with casts applies during hydration", () => {
			class User extends Model {
				static table = "users";
				static casts = {
					is_admin: "boolean",
					settings: "json",
					age: "integer",
				};
			}

			const users = User.hydrate([
				{
					id: 1,
					name: "John",
					is_admin: 1,
					settings: '{"theme":"dark"}',
					age: "30",
				},
			]);

			expect(users[0].is_admin).toBe(true);
			expect(typeof users[0].settings).toBe("object");
			expect(users[0].age).toBe(30);
		});

		test("Model with null values handles gracefully", () => {
			class User extends Model {
				static table = "users";
				static casts = {
					is_admin: "boolean",
				};
			}

			const users = User.hydrate([
				{
					id: 1,
					name: "John",
					is_admin: null,
				},
			]);

			expect(users[0].is_admin).toBeNull();
		});
	});
});
