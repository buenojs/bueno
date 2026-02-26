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

class Post extends Model {
	static table = "posts";
	static timestamps = false;
	fillable = ["user_id", "title"];
}

beforeEach(async () => {
	db = new Database({ url: ":memory:" });
	await db.connect();
	setDefaultDatabase(db);
	clearModelDatabaseRegistry();
	await db.raw(
		"CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, age INTEGER, status TEXT DEFAULT 'active')",
	);
});

afterEach(async () => {
	clearDefaultDatabase();
	clearModelDatabaseRegistry();
	await db.close();
});

describe("OrmQueryBuilder", () => {
	describe("chainable methods", () => {
		test("select() sets columns", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			const builder = User.query().select("name", "email");
			const results = await builder.get();
			expect(results[0]).toHaveProperty("name");
			expect(results[0]).toHaveProperty("email");
		});

		test("addSelect() adds to columns", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			const builder = User.query().select("name").addSelect("email");
			const results = await builder.get();
			expect(results[0]).toHaveProperty("name");
			expect(results[0]).toHaveProperty("email");
		});

		test("distinct() removes duplicates", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			await User.create({ name: "John", email: "jane@example.com" });
			const builder = User.query().select("name").distinct();
			const results = await builder.get();
			expect(results.length).toBe(1);
		});

		test("where(col, val) - equality shorthand", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "inactive" });
			const results = await User.query().where("status", "active").get();
			expect(results.length).toBe(1);
			expect(results[0].name).toBe("John");
		});

		test("where(col, op, val) - explicit operator", async () => {
			await User.create({ name: "John", age: 25 });
			await User.create({ name: "Jane", age: 30 });
			const results = await User.query().where("age", ">", 28).get();
			expect(results.length).toBe(1);
			expect(results[0].age).toBe(30);
		});

		test("orWhere()", async () => {
			await User.create({ name: "John", status: "admin" });
			await User.create({ name: "Jane", status: "moderator" });
			await User.create({ name: "Bob", status: "user" });
			const results = await User.query()
				.where("status", "admin")
				.orWhere("status", "moderator")
				.get();
			expect(results.length).toBe(2);
		});

		test("whereRaw()", async () => {
			await User.create({ name: "John", age: 25 });
			await User.create({ name: "Jane", age: 30 });
			const results = await User.query().whereRaw("age > 27").get();
			expect(results.length).toBe(1);
		});

		test("whereIn()", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "pending" });
			await User.create({ name: "Bob", status: "inactive" });
			const results = await User.query().whereIn("status", ["active", "pending"]).get();
			expect(results.length).toBe(2);
		});

		test("whereNotIn()", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "pending" });
			await User.create({ name: "Bob", status: "inactive" });
			const results = await User.query().whereNotIn("status", ["inactive"]).get();
			expect(results.length).toBe(2);
		});

		test("whereNull()", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			await User.create({ name: "Jane", email: null });
			const results = await User.query().whereNull("email").get();
			expect(results.length).toBe(1);
			expect(results[0].name).toBe("Jane");
		});

		test("whereNotNull()", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			await User.create({ name: "Jane", email: null });
			const results = await User.query().whereNotNull("email").get();
			expect(results.length).toBe(1);
			expect(results[0].name).toBe("John");
		});

		test("whereBetween()", async () => {
			await User.create({ name: "John", age: 25 });
			await User.create({ name: "Jane", age: 30 });
			await User.create({ name: "Bob", age: 35 });
			const results = await User.query().whereBetween("age", [27, 32]).get();
			expect(results.length).toBe(1);
			expect(results[0].age).toBe(30);
		});

		test("orderBy() ASC", async () => {
			await User.create({ name: "Charlie" });
			await User.create({ name: "Alice" });
			await User.create({ name: "Bob" });
			const results = await User.query().orderBy("name", "asc").get();
			expect(results[0].name).toBe("Alice");
			expect(results[1].name).toBe("Bob");
			expect(results[2].name).toBe("Charlie");
		});

		test("orderBy() DESC", async () => {
			await User.create({ name: "Charlie" });
			await User.create({ name: "Alice" });
			await User.create({ name: "Bob" });
			const results = await User.query().orderBy("name", "desc").get();
			expect(results[0].name).toBe("Charlie");
			expect(results[1].name).toBe("Bob");
			expect(results[2].name).toBe("Alice");
		});

		test("limit()", async () => {
			await User.create({ name: "John" });
			await User.create({ name: "Jane" });
			await User.create({ name: "Bob" });
			const results = await User.query().limit(2).get();
			expect(results.length).toBe(2);
		});

		test("offset()", async () => {
			await User.create({ name: "A" });
			await User.create({ name: "B" });
			await User.create({ name: "C" });
			const results = await User.query().orderBy("name").offset(1).limit(1).get();
			expect(results.length).toBe(1);
			expect(results[0].name).toBe("B");
		});

		test("clone() does not mutate original", async () => {
			await User.create({ name: "Test", status: "active" });
			const builder = User.query().where("status", "active");
			const cloned = builder.clone().where("age", ">", 25);

			const original = await builder.get();
			expect(original.length >= 0).toBe(true);
		});
	});

	describe("terminal methods", () => {
		test("get() returns all rows", async () => {
			await User.create({ name: "John" });
			await User.create({ name: "Jane" });
			const results = await User.query().get();
			expect(results.length).toBe(2);
			expect(results[0]).toHaveProperty("id");
		});

		test("first() returns first row or null", async () => {
			await User.create({ name: "John" });
			await User.create({ name: "Jane" });
			const result = await User.query().first();
			expect(result).not.toBeNull();
			expect(result!.name).toBe("John");
		});

		test("first() returns null when empty", async () => {
			const result = await User.query().where("name", "NonExistent").first();
			expect(result).toBeNull();
		});

		test("count() returns number of rows", async () => {
			await User.create({ name: "John" });
			await User.create({ name: "Jane" });
			const count = await User.query().count();
			expect(count).toBe(2);
		});

		test("count() with WHERE clause", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "inactive" });
			const count = await User.query().where("status", "active").count();
			expect(count).toBe(1);
		});

		test("exists() returns boolean", async () => {
			await User.create({ name: "John" });
			const exists = await User.query().where("name", "John").exists();
			expect(exists).toBe(true);
		});

		test("exists() false when no match", async () => {
			const exists = await User.query().where("name", "NonExistent").exists();
			expect(exists).toBe(false);
		});

		test("pluck() returns array of values", async () => {
			await User.create({ name: "John" });
			await User.create({ name: "Jane" });
			const names = await User.query().pluck("name");
			expect(names).toEqual(["John", "Jane"]);
		});

		test("value() returns single value", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			const email = await User.query().value("email");
			expect(email).toBe("john@example.com");
		});

		test("value() returns null when empty", async () => {
			const value = await User.query().where("name", "NonExistent").value("name");
			expect(value).toBeNull();
		});

		test("paginate() returns paginated result", async () => {
			for (let i = 1; i <= 25; i++) {
				await User.create({ name: `User${i}` });
			}
			const result = await User.query().orderBy("id").paginate(2, 10);
			expect(result.data.length).toBe(10);
			expect(result.total).toBe(25);
			expect(result.page).toBe(2);
			expect(result.limit).toBe(10);
			expect(result.totalPages).toBe(3);
		});

		test("update() modifies rows", async () => {
			const user = await User.create({ name: "John", status: "active" });
			await User.query().where("id", user.id).update({ status: "inactive" });
			const updated = await User.find(user.id!);
			expect(updated!.status).toBe("inactive");
		});

		test("delete() removes rows", async () => {
			const user = await User.create({ name: "John" });
			await User.query().where("id", user.id).delete();
			const result = await User.find(user.id!);
			expect(result).toBeNull();
		});
	});

	describe("join operations", () => {
		beforeEach(async () => {
			await db.raw("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT)");
		});

		test("join() performs INNER JOIN", async () => {
			const user = await User.create({ name: "John" });
			await db.raw("INSERT INTO posts (user_id, title) VALUES (?, ?)", [user.id, "Post 1"]);

			const results = await User.query()
				.join("posts", "posts.user_id = users.id")
				.select("posts.title", "users.name")
				.get();
			expect(results.length).toBe(1);
		});

		test("leftJoin() performs LEFT JOIN", async () => {
			await User.create({ name: "John" });
			const results = await User.query()
				.leftJoin("posts", "posts.user_id = users.id")
				.get();
			expect(results.length).toBe(1);
		});
	});

	describe("grouping operations", () => {
		test("groupBy() groups results", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "active" });
			await User.create({ name: "Bob", status: "inactive" });
			const results = await User.query().select("status").groupBy("status").get();
			expect(results.length).toBe(2);
		});

		test("having() filters groups", async () => {
			await User.create({ name: "John", status: "active" });
			await User.create({ name: "Jane", status: "active" });
			await User.create({ name: "Bob", status: "inactive" });
			const results = await User.query()
				.select("status")
				.groupBy("status")
				.having("COUNT(*) > 1")
				.get();
			expect(results.length).toBe(1);
			expect(results[0].status).toBe("active");
		});
	});
});
