import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../../../src/database";
import { Model } from "../../../src/database/orm/model";
import { setDefaultDatabase, clearDefaultDatabase, clearModelDatabaseRegistry } from "../../../src/database/orm";

let db: Database;

class User extends Model {
	static table = "users";
	static timestamps = false;
	fillable = ["name", "email", "age", "status"];
}

beforeEach(async () => {
	db = new Database({ url: ":memory:" });
	await db.connect();
	setDefaultDatabase(db);
	clearModelDatabaseRegistry();
	await db.raw("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, age INTEGER, status TEXT)");
});

afterEach(async () => {
	clearDefaultDatabase();
	clearModelDatabaseRegistry();
	await db.close();
});

describe("QueryCompiler (via OrmQueryBuilder)", () => {
	describe("SELECT compilation", () => {
		test("simple SELECT * FROM table", async () => {
			await User.create({ name: "John" });
			const results = await User.all();
			expect(results.length).toBe(1);
		});

		test("SELECT with columns", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			const results = await User.query().select("name", "email").get();
			expect(results[0]).toHaveProperty("name");
			expect(results[0]).toHaveProperty("email");
		});

		test("SELECT DISTINCT", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			await User.create({ name: "John", email: "jane@example.com" });
			const results = await User.query().select("name").distinct().get();
			expect(results.length).toBe(1);
		});

		test("WHERE with equality", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "inactive" });
			const results = await User.query().where("status", "active").get();
			expect(results.length).toBe(1);
			expect(results[0].name).toBe("John");
		});

		test("WHERE with comparison operators", async () => {
			await User.create({ name: "John", age: 25 });
			await User.create({ name: "Jane", age: 30 });
			const results = await User.query().where("age", ">", 28).get();
			expect(results.length).toBe(1);
			expect(results[0].age).toBe(30);
		});

		test("WHERE IN with array", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "pending" });
			await User.create({ name: "Bob", status: "inactive" });
			const results = await User.query().whereIn("status", ["active", "pending"]).get();
			expect(results.length).toBe(2);
		});

		test("WHERE IS NULL", async () => {
			await User.create({ name: "John", email: null });
			await User.create({ name: "Jane", email: "jane@example.com" });
			const results = await User.query().whereNull("email").get();
			expect(results.length).toBe(1);
			expect(results[0].name).toBe("John");
		});

		test("WHERE IS NOT NULL", async () => {
			await User.create({ name: "John", email: null });
			await User.create({ name: "Jane", email: "jane@example.com" });
			const results = await User.query().whereNotNull("email").get();
			expect(results.length).toBe(1);
			expect(results[0].email).toBe("jane@example.com");
		});

		test("WHERE BETWEEN", async () => {
			await User.create({ name: "John", age: 25 });
			await User.create({ name: "Jane", age: 30 });
			await User.create({ name: "Bob", age: 35 });
			const results = await User.query().whereBetween("age", [27, 32]).get();
			expect(results.length).toBe(1);
			expect(results[0].age).toBe(30);
		});

		test("WHERE RAW", async () => {
			await User.create({ name: "John", age: 25 });
			await User.create({ name: "Jane", age: 30 });
			const results = await User.query().whereRaw("age > 27").get();
			expect(results.length).toBe(1);
		});

		test("OR WHERE", async () => {
			await User.create({ name: "John", status: "admin" });
			await User.create({ name: "Jane", status: "moderator" });
			await User.create({ name: "Bob", status: "user" });
			const results = await User.query().where("status", "admin").orWhere("status", "moderator").get();
			expect(results.length).toBe(2);
		});

		test("ORDER BY ASC", async () => {
			await User.create({ name: "Charlie" });
			await User.create({ name: "Alice" });
			await User.create({ name: "Bob" });
			const results = await User.query().orderBy("name", "asc").get();
			expect(results[0].name).toBe("Alice");
			expect(results[2].name).toBe("Charlie");
		});

		test("ORDER BY DESC", async () => {
			await User.create({ name: "Charlie" });
			await User.create({ name: "Alice" });
			const results = await User.query().orderBy("name", "desc").get();
			expect(results[0].name).toBe("Charlie");
			expect(results[1].name).toBe("Alice");
		});

		test("LIMIT", async () => {
			await User.create({ name: "John" });
			await User.create({ name: "Jane" });
			await User.create({ name: "Bob" });
			const results = await User.query().limit(2).get();
			expect(results.length).toBe(2);
		});

		test("LIMIT and OFFSET", async () => {
			for (let i = 1; i <= 5; i++) {
				await User.create({ name: `User${i}` });
			}
			const results = await User.query().orderBy("id").limit(2).offset(2).get();
			expect(results.length).toBe(2);
		});
	});

	describe("COUNT compilation", () => {
		test("count all", async () => {
			await User.create({ name: "John" });
			await User.create({ name: "Jane" });
			const count = await User.query().count();
			expect(count).toBe(2);
		});

		test("count with WHERE clause", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "inactive" });
			const count = await User.query().where("status", "active").count();
			expect(count).toBe(1);
		});
	});

	describe("EXISTS compilation", () => {
		test("exists returns true when record exists", async () => {
			await User.create({ name: "John" });
			const exists = await User.query().where("name", "John").exists();
			expect(exists).toBe(true);
		});

		test("exists returns false when no record matches", async () => {
			const exists = await User.query().where("name", "NonExistent").exists();
			expect(exists).toBe(false);
		});
	});

	describe("INSERT compilation", () => {
		test("single row insert", async () => {
			const result = await User.create({ name: "John", email: "john@example.com" });
			expect(result.id).toBeDefined();
			expect(result.name).toBe("John");
		});

		test("batch insert", async () => {
			const user1 = await User.create({ name: "John", email: "john@example.com" });
			const user2 = await User.create({ name: "Jane", email: "jane@example.com" });
			expect(user1.id).toBeDefined();
			expect(user2.id).toBeDefined();
			expect(user1.name).toBe("John");
			expect(user2.name).toBe("Jane");
		});
	});

	describe("UPDATE compilation", () => {
		test("update with WHERE clause", async () => {
			const user = await User.create({ name: "John" });
			user.name = "Jane";
			await user.save();
			const updated = await User.find(user.id!);
			expect(updated!.name).toBe("Jane");
		});
	});

	describe("DELETE compilation", () => {
		test("delete with WHERE clause", async () => {
			const user = await User.create({ name: "John" });
			await user.delete();
			const found = await User.find(user.id!);
			expect(found).toBeNull();
		});
	});

	describe("Placeholder dialect handling", () => {
		test("SQLite uses ? placeholders", async () => {
			await User.create({ name: "Test", status: "active" });
			const results = await User.query().where("status", "active").get();
			expect(results.length).toBe(1);
		});
	});
});
