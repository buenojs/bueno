import {
	createEvent,
	createEventCategory,
	createEventListener,
	createEventManager,
	createEventRegistry,
	deserializeEvent,
	serializeEvent,
	validateEvent,
} from "../index";

describe("Event System", () => {
	let manager: any;
	let registry: any;

	beforeEach(() => {
		manager = createEventManager();
		registry = createEventRegistry();
	});

	describe("Event Manager", () => {
		it("should emit and handle events", async () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData);

			const handler = jest.fn();
			manager.on("test.event", handler);

			await manager.emit(event);

			expect(handler).toHaveBeenCalledWith(event);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should support one-time listeners", async () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData);

			const handler = jest.fn();
			manager.once("test.event", handler);

			await manager.emit(event);
			await manager.emit(event);

			expect(handler).toHaveBeenCalledWith(event);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should support event filtering", async () => {
			const eventData1 = { type: "important" };
			const eventData2 = { type: "normal" };
			const event1 = createEvent("test.event", eventData1);
			const event2 = createEvent("test.event", eventData2);

			const handler = jest.fn();
			const filter = (e: any) => e.data.type === "important";
			manager.on("test.event", handler, { filter });

			await manager.emit(event1);
			await manager.emit(event2);

			expect(handler).toHaveBeenCalledWith(event1);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should support event middleware", async () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData);

			const middleware = jest.fn(async (e, next) => {
				e.data.middleware = true;
				await next();
			});

			manager.addMiddleware(middleware);
			const handler = jest.fn();
			manager.on("test.event", handler);

			await manager.emit(event);

			expect(middleware).toHaveBeenCalled();
			expect(handler).toHaveBeenCalledWith(event);
			expect(event.data.middleware).toBe(true);
		});

		it("should handle errors gracefully", async () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData);

			const failingHandler = jest.fn(() => {
				throw new Error("Test error");
			});
			const successHandler = jest.fn();

			manager.on("test.event", failingHandler);
			manager.on("test.event", successHandler);

			await manager.emit(event);

			expect(failingHandler).toHaveBeenCalled();
			expect(successHandler).toHaveBeenCalled();
		});

		it("should support event categories", () => {
			const category = createEventCategory("database", "Database operations");
			manager.registerEventCategory(category);

			expect(manager.getEventCategories()).toContainEqual(category);
		});
	});

	describe("Event Registry", () => {
		it("should register and retrieve events", () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData);

			registry.registerEvent(event);

			expect(registry.getEvent(event.id)).toEqual(event);
		});

		it("should support event cleanup", () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData, {
				timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
			});

			registry.registerEvent(event);
			registry.cleanupOldEvents();

			expect(registry.getEvent(event.id)).toBeUndefined();
		});

		it("should support event search", () => {
			const event1 = createEvent("user.created", { name: "John" });
			const event2 = createEvent("user.deleted", { name: "Jane" });

			registry.registerEvent(event1);
			registry.registerEvent(event2);

			const results = registry.searchEvents("user");

			expect(results).toHaveLength(2);
			expect(results).toContainEqual(event1);
			expect(results).toContainEqual(event2);
		});

		it("should support event history", () => {
			const events = [
				createEvent(
					"test.event",
					{ count: 1 },
					{ timestamp: new Date(Date.now() - 3000) },
				),
				createEvent(
					"test.event",
					{ count: 2 },
					{ timestamp: new Date(Date.now() - 2000) },
				),
				createEvent(
					"test.event",
					{ count: 3 },
					{ timestamp: new Date(Date.now() - 1000) },
				),
			];

			events.forEach((event) => registry.registerEvent(event));

			const history = registry.getEventHistory({
				category: undefined,
				startTime: new Date(Date.now() - 60 * 60 * 1000),
				endTime: new Date(),
				limit: 2,
			});

			expect(history).toHaveLength(2);
			expect(history[0].data.count).toBe(3);
			expect(history[1].data.count).toBe(2);
		});
	});

	describe("Event Utilities", () => {
		it("should create valid events", () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData);

			expect(event).toHaveProperty("id");
			expect(event).toHaveProperty("name", "test.event");
			expect(event).toHaveProperty("timestamp");
			expect(event).toHaveProperty("data", eventData);
		});

		it("should validate events", () => {
			const validEvent = createEvent("test.event", { message: "test" });
			const invalidEvent = { name: "test", data: {} };

			expect(validateEvent(validEvent)).toBe(true);
			expect(validateEvent(invalidEvent)).toBe(false);
		});

		it("should serialize and deserialize events", () => {
			const eventData = { message: "test" };
			const event = createEvent("test.event", eventData);
			const serialized = serializeEvent(event);
			const deserialized = deserializeEvent(serialized);

			expect(deserialized).toEqual(event);
		});

		it("should create event listeners", () => {
			const handler = () => {};
			const listener = createEventListener("test.listener", handler, {
				priority: 10,
				once: true,
			});

			expect(listener).toHaveProperty("id");
			expect(listener).toHaveProperty("name", "test.listener");
			expect(listener).toHaveProperty("handler", handler);
			expect(listener).toHaveProperty("priority", 10);
			expect(listener).toHaveProperty("once", true);
		});

		it("should create event categories", () => {
			const category = createEventCategory("database", "Database operations", [
				"query",
				"mutation",
			]);

			expect(category).toHaveProperty("name", "database");
			expect(category).toHaveProperty("description", "Database operations");
			expect(category).toHaveProperty("events", ["query", "mutation"]);
		});
	});
});
