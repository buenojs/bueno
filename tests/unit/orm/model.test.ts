import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../../../src/database";
import { Model } from "../../../src/database/orm/model";
import { setDefaultDatabase, clearDefaultDatabase, clearModelDatabaseRegistry } from "../../../src/database/orm";

let db: Database;

class User extends Model {
	static table ="users";
	fillable = ["name", "email", "age"];
	timestamps = true;

	override async posts() {
		return this.hasMany(Post, "user_id");
	}
}

class Post extends Model {
	static table ="posts";
	fillable = ["user_id", "title"];
	timestamps = true;

	override async author() {
		return this.belongsTo(User, "user_id");
	}
}

beforeEach(async () => {
	db = new Database({ url: ":memory:" });
	await db.connect();
	setDefaultDatabase(db);
	clearModelDatabaseRegistry();

	await db.raw(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT,
			email TEXT,
			age INTEGER,
			created_at TEXT,
			updated_at TEXT,
			deleted_at TEXT
		)
	`);

	await db.raw(`
		CREATE TABLE posts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			title TEXT,
			created_at TEXT,
			updated_at TEXT
		)
	`);
});

afterEach(async () => {
	clearDefaultDatabase();
	clearModelDatabaseRegistry();
	await db.close();
});

describe("Model", () => {
	describe("definition & query", () => {
		test("Model.query() returns ModelQueryBuilder", () => {
			const query = User.query();
			expect(query).toBeDefined();
			expect(query.get).toBeDefined();
		});

		test("Model.all() returns all instances", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			await User.create({ name: "Jane", email: "jane@example.com" });
			const users = await User.all();
			expect(users.length).toBe(2);
			expect(users[0] instanceof User).toBe(true);
		});

		test("Model.find(id) returns instance or null", async () => {
			const inserted = await User.create({ name: "John" });
			const user = await User.find(inserted.id);
			expect(user).not.toBeNull();
			expect(user!.name).toBe("John");
		});

		test("Model.find(id) returns null if not found", async () => {
			const user = await User.find(9999);
			expect(user).toBeNull();
		});

		test("Model.where() filters results", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			await User.create({ name: "Jane", email: "jane@example.com" });
			const users = await User.query().where("name", "John").get();
			expect(users.length).toBe(1);
			expect(users[0].name).toBe("John");
		});
	});

	describe("persistence", () => {
		test("Model.create() inserts and returns instance", async () => {
			const user = await User.create({ name: "John", email: "john@example.com" });
			expect(user.id).toBeDefined();
			expect(user.name).toBe("John");
			expect((user as any)._exists).toBe(true);
		});

		test("instance.save() on new model inserts", async () => {
			const user = new User();
			user.name = "John";
			user.email = "john@example.com";
			await user.save();
			expect(user.id).toBeDefined();
			const found = await User.find(user.id!);
			expect(found!.name).toBe("John");
		});

		test("instance.save() on existing model updates", async () => {
			const user = await User.create({ name: "John" });
			user.name = "Jane";
			await user.save();
			const updated = await User.find(user.id!);
			expect(updated!.name).toBe("Jane");
		});

		test("instance.save() skips update if clean", async () => {
			const user = await User.create({ name: "John" });
			// save() on a clean model is a no-op — should not throw
			await expect(user.save()).resolves.toBeUndefined();
			expect(user.isDirty()).toBe(false);
		});

		test("instance.delete() hard-deletes row", async () => {
			const user = await User.create({ name: "John" });
			const id = user.id;
			await user.delete();
			const found = await User.find(id!);
			expect(found).toBeNull();
		});

		test("instance.refresh() re-fetches from DB", async () => {
			const user = await User.create({ name: "John" });
			await User.query().where("id", user.id).update({ name: "Jane" });
			await user.refresh();
			expect(user.name).toBe("Jane");
		});

		test("instance.fresh() returns new instance", async () => {
			const user = await User.create({ name: "John" });
			user.name = "Jane";
			const fresh = await user.fresh();
			expect(fresh!.name).toBe("John");
			expect(user.name).toBe("Jane");
		});
	});

	describe("attribute access", () => {
		test("Proxy getter calls getAttribute", async () => {
			const user = await User.create({ name: "John", email: "john@example.com" });
			expect(user.name).toBe("John");
			expect(user.email).toBe("john@example.com");
		});

		test("Proxy setter calls setAttribute", async () => {
			const user = new User();
			user.name = "John";
			expect(user.name).toBe("John");
		});

		test("fill() respects fillable", async () => {
			const user = new User();
			user.fill({ name: "John", email: "john@example.com", age: 30 });
			expect(user.name).toBe("John");
			expect(user.email).toBe("john@example.com");
		});

		test("fill() ignores guarded attributes", async () => {
			class GuardedUser extends Model {
				static table = "users";
				static guarded = ["id"];
			}
			const user = new GuardedUser();
			user.fill({ id: 999, name: "John" });
			expect((user as any).getAttribute("id")).toBeUndefined();
			expect(user.name).toBe("John");
		});

		test("forceFill() bypasses fillable/guarded", async () => {
			const user = new User();
			user.forceFill({ id: 999, name: "John" });
			expect((user as any).getAttribute("id")).toBe(999);
		});

		test("toJSON() returns plain object", async () => {
			const user = await User.create({ name: "John", email: "john@example.com" });
			const json = user.toJSON();
			expect(typeof json).toBe("object");
			expect(json.name).toBe("John");
		});
	});

	describe("dirty tracking", () => {
		test("isDirty() true after setAttribute", async () => {
			const user = await User.create({ name: "John" });
			user.name = "Jane";
			expect(user.isDirty()).toBe(true);
		});

		test("isDirty(key) true for changed key", async () => {
			const user = await User.create({ name: "John", email: "john@example.com" });
			user.name = "Jane";
			expect(user.isDirty("name")).toBe(true);
			expect(user.isDirty("email")).toBe(false);
		});

		test("isClean() true before changes", async () => {
			const user = await User.create({ name: "John" });
			expect(user.isClean()).toBe(true);
		});

		test("getDirty() returns changed keys", async () => {
			const user = await User.create({ name: "John", email: "john@example.com" });
			user.name = "Jane";
			user.email = "jane@example.com";
			const dirty = user.getDirty();
			expect(dirty).toEqual({ name: "Jane", email: "jane@example.com" });
		});

		test("getOriginal() returns snapshot", async () => {
			const user = await User.create({ name: "John" });
			user.name = "Jane";
			const original = user.getOriginal();
			expect(original.name).toBe("John");
		});

		test("save() clears dirty state", async () => {
			const user = await User.create({ name: "John" });
			user.name = "Jane";
			await user.save();
			expect(user.isClean()).toBe(true);
		});
	});

	describe("timestamps", () => {
		test("timestamps: true sets created_at and updated_at on INSERT", async () => {
			const user = await User.create({ name: "John" });
			expect(user.created_at).toBeDefined();
			expect(user.updated_at).toBeDefined();
		});

		test("timestamps: true updates updated_at on UPDATE", async () => {
			const user = await User.create({ name: "John" });
			const createdAt = user.created_at;
			await new Promise((resolve) => setTimeout(resolve, 10));
			user.name = "Jane";
			await user.save();
			expect(user.updated_at).not.toBe(createdAt);
		});

		test("timestamps: false skips timestamp columns", async () => {
			class NoTimestampUser extends Model {
				static table = "users";
				static timestamps = false;
			}
			const user = await NoTimestampUser.create({ name: "John" });
			// Table has the column but it was not set — SQLite returns null
			expect(user.created_at).toBeNull();
		});
	});

	describe("soft deletes", () => {
		test("softDeletes: true sets deleted_at", async () => {
			class SoftDeleteUser extends Model {
				static table ="users";
				static softDeletes = true;
			}
		const user = await SoftDeleteUser.create({ name: "John" });
		await user.delete();
		const inDb = await SoftDeleteUser.query().where("id", user.id).first();
			expect(inDb).not.toBeNull();
			expect(inDb!.deleted_at).not.toBeNull();
		});

		test("softDeletes: true restore() clears deleted_at", async () => {
			class SoftDeleteUser extends Model {
				static table ="users";
				static softDeletes = true;
			}
			const user = await SoftDeleteUser.create({ name: "John" });
			await user.delete();
			await user.restore();
		const inDb = await SoftDeleteUser.query().where("id", user.id).first();
			expect(inDb!.deleted_at).toBeNull();
		});

		test("softDeletes: false hard-deletes", async () => {
			const user = await User.create({ name: "John" });
			await user.delete();
			const inDb = await User.query().where("id", user.id).first();
			expect(inDb).toBeNull();
		});
	});

	describe("firstOrCreate / updateOrCreate", () => {
		test("firstOrCreate finds existing", async () => {
			const created = await User.create({ name: "John", email: "john@example.com" });
			const found = await User.query().firstOrCreate({ email: "john@example.com" }, { name: "Jane" });
			expect(found.id).toBe(created.id);
			expect(found.name).toBe("John");
		});

		test("firstOrCreate creates if not found", async () => {
			const user = await User.query().firstOrCreate({ email: "new@example.com" }, { name: "New User" });
			expect(user.id).toBeDefined();
			expect(user.name).toBe("New User");
			expect(user.email).toBe("new@example.com");
		});

		test("updateOrCreate updates existing", async () => {
			const created = await User.create({ name: "John", email: "john@example.com" });
			const updated = await User.query().updateOrCreate(
				{ email: "john@example.com" },
				{ name: "Jane" },
			);
			expect(updated.id).toBe(created.id);
			expect(updated.name).toBe("Jane");
		});

		test("updateOrCreate creates if not found", async () => {
			const user = await User.query().updateOrCreate(
				{ email: "new@example.com" },
				{ name: "New User" },
			);
			expect(user.id).toBeDefined();
			expect(user.name).toBe("New User");
		});
	});

	describe("hydrate()", () => {
		test("creates instances from raw rows", async () => {
			await User.create({ name: "John", email: "john@example.com" });
			await User.create({ name: "Jane", email: "jane@example.com" });
			const rows = await db.raw<{name:string}>("SELECT * FROM users");
			const users = User.hydrate(rows);
			expect(users.length).toBe(2);
			expect(users[0] instanceof User).toBe(true);
			expect(users[0].name).toBe("John");
		});

		test("hydrate() sets _exists = true", async () => {
			await User.create({ name: "John" });
			const rows = await db.raw<{name:string}>("SELECT * FROM users");
			const users = User.hydrate(rows);
			expect((users[0] as any)._exists).toBe(true);
		});
	});

	describe("relationships", () => {
		test("hasMany() returns relationship", async () => {
			const user = new User();
			user.id = 1;
			const relation = user.hasMany(Post, "user_id");
			expect(relation).toBeDefined();
		});

		test("belongsTo() returns relationship", async () => {
			const post = new Post();
			post.user_id = 1;
			const relation = post.belongsTo(User, "user_id");
			expect(relation).toBeDefined();
		});
	});
});
