import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../../../src/database";
import { Model } from "../../../src/database/orm/model";
import { setDefaultDatabase, clearDefaultDatabase, clearModelDatabaseRegistry } from "../../../src/database/orm";

let db: Database;

class User extends Model {
	static table = "users";
	static timestamps = false;
	fillable = ["name"];

	override posts() {
		return this.hasMany(Post, "user_id");
	}

	override profile() {
		return this.hasOne(Profile, "user_id");
	}
}

class Post extends Model {
	static table = "posts";
	static timestamps = false;
	fillable = ["user_id", "title"];

	override author() {
		return this.belongsTo(User, "user_id");
	}

	override comments() {
		return this.hasMany(Comment, "post_id");
	}
}

class Comment extends Model {
	static table = "comments";
	static timestamps = false;
	fillable = ["post_id", "body"];

	override post() {
		return this.belongsTo(Post, "post_id");
	}
}

class Profile extends Model {
	static table = "profiles";
	static timestamps = false;
	fillable = ["user_id", "bio"];

	override user() {
		return this.belongsTo(User, "user_id");
	}
}

beforeEach(async () => {
	db = new Database({ url: ":memory:" });
	await db.connect();
	setDefaultDatabase(db);
	clearModelDatabaseRegistry();

	await db.raw(`
		CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)
	`);
	await db.raw(`
		CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT)
	`);
	await db.raw(`
		CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, body TEXT)
	`);
	await db.raw(`
		CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, bio TEXT)
	`);
});

afterEach(async () => {
	clearDefaultDatabase();
	clearModelDatabaseRegistry();
	await db.close();
});

describe("Eager Loading", () => {
	describe("simple eager load", () => {
		test("with('posts').get() loads posts into users", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });
			await Post.create({ user_id: user.id, title: "Post 2" });

			const users = await User.query().with("posts").get();
			expect(users.length).toBe(1);
			expect((users[0] as any)._relations.has("posts")).toBe(true);
			expect(users[0].posts).toEqual(expect.any(Array));
			expect(users[0].posts.length).toBe(2);
		});

		test("with('posts').first() loads posts into user", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });

			const foundUser = await User.query().with("posts").first();
			expect(foundUser).not.toBeNull();
			expect(foundUser!.posts).toEqual(expect.any(Array));
			expect(foundUser!.posts.length).toBe(1);
		});

		test("user with no relations returns empty array", async () => {
			const user = await User.create({ name: "John" });
			const users = await User.query().with("posts").get();
			expect(users[0].posts).toEqual([]);
		});
	});

	describe("BelongsTo eager load", () => {
		test("with('author').get() loads author into posts", async () => {
			const user = await User.create({ name: "John" });
			const post = await Post.create({ user_id: user.id, title: "Post 1" });

			const posts = await Post.query().with("author").get();
			expect(posts.length).toBe(1);
			expect(posts[0].author).not.toBeNull();
			expect(posts[0].author!.name).toBe("John");
		});

		test("post with null foreign key returns null", async () => {
			await Post.create({ user_id: null, title: "Post 1" });

			const posts = await Post.query().with("author").get();
			expect(posts[0].author).toBeNull();
		});
	});

	describe("nested eager load", () => {
		test("with('posts.comments').get() loads nested relations", async () => {
			const user = await User.create({ name: "John" });
			const post = await Post.create({ user_id: user.id, title: "Post 1" });
			await Comment.create({ post_id: post.id, body: "Comment 1" });
			await Comment.create({ post_id: post.id, body: "Comment 2" });

			const users = await User.query().with("posts.comments").get();
			expect(users.length).toBe(1);
			expect(users[0].posts).toEqual(expect.any(Array));
			expect(users[0].posts.length).toBe(1);
			expect(users[0].posts[0].comments).toEqual(expect.any(Array));
			expect(users[0].posts[0].comments.length).toBe(2);
		});

		test("nested eager load with multiple levels", async () => {
			const user = await User.create({ name: "John" });
			const post = await Post.create({ user_id: user.id, title: "Post 1" });
			await Comment.create({ post_id: post.id, body: "Comment 1" });

			const users = await User.query().with("posts.comments").get();
			expect(users[0].posts[0].comments[0].body).toBe("Comment 1");
		});

		test("nested eager load with empty relations", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });

			const users = await User.query().with("posts.comments").get();
			expect(users[0].posts[0].comments).toEqual([]);
		});
	});

	describe("constrained eager load", () => {
		test("with('posts', callback) applies constraint", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Published" });
			await Post.create({ user_id: user.id, title: "Draft" });

			const users = await User.query()
				.with("posts", (q) => q.where("title", "Published"))
				.get();
			expect(users[0].posts.length).toBe(1);
			expect(users[0].posts[0].title).toBe("Published");
		});

		test("constraint on nested relation", async () => {
			const user = await User.create({ name: "John" });
			const post = await Post.create({ user_id: user.id, title: "Post 1" });
			await Comment.create({ post_id: post.id, body: "Keep this" });
			await Comment.create({ post_id: post.id, body: "Filter this" });

			const users = await User.query()
				.with("posts.comments", (q) => q.where("body", "Keep this"))
				.get();
			expect(users[0].posts[0].comments.length).toBe(1);
			expect(users[0].posts[0].comments[0].body).toBe("Keep this");
		});
	});

	describe("multiple eager loads", () => {
		test("with() called multiple times loads all relations", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });
			await Profile.create({ user_id: user.id, bio: "Developer" });

			const users = await User.query().with("posts").with("profile").get();
			expect(users[0].posts).toEqual(expect.any(Array));
			expect(users[0].profile).not.toBeNull();
		});

		test("multiple relations on same parent", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });
			await Profile.create({ user_id: user.id, bio: "Developer" });

			const users = await User.query().with("posts").with("profile").get();
			expect((users[0] as any)._relations.has("posts")).toBe(true);
			expect((users[0] as any)._relations.has("profile")).toBe(true);
		});
	});

	describe("eager load with filtering", () => {
		test("where() before with() filters parent", async () => {
			await User.create({ name: "John" });
			const user2 = await User.create({ name: "Jane" });
			await Post.create({ user_id: user2.id, title: "Post 1" });

			const users = await User.query().where("name", "Jane").with("posts").get();
			expect(users.length).toBe(1);
			expect(users[0].name).toBe("Jane");
			expect(users[0].posts.length).toBe(1);
		});

		test("constraint narrows child relations without filtering parent", async () => {
			const user1 = await User.create({ name: "John" });
			const user2 = await User.create({ name: "Jane" });
			await Post.create({ user_id: user1.id, title: "Published" });
			await Post.create({ user_id: user1.id, title: "Draft" });
			await Post.create({ user_id: user2.id, title: "Published" });

			const users = await User.query()
				.with("posts", (q) => q.where("title", "Published"))
				.get();
			expect(users.length).toBe(2);
			expect(users[0].posts.length).toBe(1);
			expect(users[1].posts.length).toBe(1);
		});
	});

	describe("eager load return value", () => {
		test("get() with eager loading returns Model instances", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });

			const users = await User.query().with("posts").get();
			expect(users[0] instanceof User).toBe(true);
			expect(users[0].posts[0] instanceof Post).toBe(true);
		});

		test("first() with eager loading returns Model instance", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });

			const foundUser = await User.query().with("posts").first();
			expect(foundUser instanceof User).toBe(true);
			expect(foundUser!.posts[0] instanceof Post).toBe(true);
		});
	});

	describe("edge cases", () => {
		test("eager load with no results", async () => {
			const users = await User.query().with("posts").get();
			expect(users.length).toBe(0);
		});

		test("eager load same relation twice", async () => {
			const user = await User.create({ name: "John" });
			await Post.create({ user_id: user.id, title: "Post 1" });

			const users = await User.query().with("posts").with("posts").get();
			expect(users[0].posts.length).toBe(1);
		});

		test("complex nested eager load chain", async () => {
			const user = await User.create({ name: "John" });
			const post = await Post.create({ user_id: user.id, title: "Post 1" });
			const comment = await Comment.create({ post_id: post.id, body: "Comment 1" });

			const users = await User.query().with("posts.comments").get();
			expect(users[0].posts[0].comments[0].id).toBe(comment.id);
		});
	});
});
