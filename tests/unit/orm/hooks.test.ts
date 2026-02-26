import { describe, test, expect, beforeEach } from "bun:test";
import { HookRunner } from "../../../src/database/orm/hooks";
import { Model } from "../../../src/database/orm/model";

describe("HookRunner", () => {
	describe("on() + run()", () => {
		test("callback called with correct model argument", async () => {
			let called = false;
			let capturedModel: Model | null = null;

			const runner = new HookRunner();
			runner.on("saving", (model) => {
				called = true;
				capturedModel = model;
			});

			const model = new Model();
			await runner.run("saving", model);

			expect(called).toBe(true);
			expect(capturedModel).toBe(model);
		});

		test("multiple callbacks run in order", async () => {
			const order: number[] = [];

			const runner = new HookRunner();
			runner.on("saving", () => order.push(1));
			runner.on("saving", () => order.push(2));
			runner.on("saving", () => order.push(3));

			const model = new Model();
			await runner.run("saving", model);

			expect(order).toEqual([1, 2, 3]);
		});

		test("returning false aborts remaining callbacks", async () => {
			const order: number[] = [];

			const runner = new HookRunner();
			runner.on("saving", () => {
				order.push(1);
				return false;
			});
			runner.on("saving", () => order.push(2));
			runner.on("saving", () => order.push(3));

			const model = new Model();
			const result = await runner.run("saving", model);

			expect(result).toBe(false);
			expect(order).toEqual([1]);
		});

		test("returning void/undefined continues, run returns true", async () => {
			const runner = new HookRunner();
			let callback1Called = false;
			let callback2Called = false;

			runner.on("saving", () => {
				callback1Called = true;
			});
			runner.on("saving", () => {
				callback2Called = true;
			});

			const model = new Model();
			const result = await runner.run("saving", model);

			expect(result).toBe(true);
			expect(callback1Called).toBe(true);
			expect(callback2Called).toBe(true);
		});

		test("async callbacks awaited correctly", async () => {
			let order: number[] = [];

			const runner = new HookRunner();
			runner.on("saving", async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				order.push(1);
			});
			runner.on("saving", () => order.push(2));

			const model = new Model();
			await runner.run("saving", model);

			expect(order).toEqual([1, 2]);
		});

		test("async callback returning false aborts", async () => {
			const order: number[] = [];

			const runner = new HookRunner();
			runner.on("saving", async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				order.push(1);
				return false;
			});
			runner.on("saving", () => order.push(2));

			const model = new Model();
			const result = await runner.run("saving", model);

			expect(result).toBe(false);
			expect(order).toEqual([1]);
		});

		test("hook name isolation - different hooks don't affect each other", async () => {
			const savingCalled = { count: 0 };
			const updatingCalled = { count: 0 };

			const runner = new HookRunner();
			runner.on("saving", () => savingCalled.count++);
			runner.on("updating", () => updatingCalled.count++);

			const model = new Model();
			await runner.run("saving", model);

			expect(savingCalled.count).toBe(1);
			expect(updatingCalled.count).toBe(0);
		});

		test("multiple hook types", async () => {
			const calls: string[] = [];

			const runner = new HookRunner();
			runner.on("creating", () => calls.push("creating"));
			runner.on("created", () => calls.push("created"));
			runner.on("updating", () => calls.push("updating"));
			runner.on("updated", () => calls.push("updated"));

			const model = new Model();
			await runner.run("creating", model);
			await runner.run("created", model);
			await runner.run("updating", model);
			await runner.run("updated", model);

			expect(calls).toEqual(["creating", "created", "updating", "updated"]);
		});
	});

	describe("Model.on() (static registration)", () => {
		test("Model.on() registers callback", async () => {
			class TestModel extends Model {
				table = "test";
			}

			let called = false;
			TestModel.on("saving", () => {
				called = true;
			});

			const callbacks = TestModel.getHookCallbacks("saving");
			expect(callbacks.length > 0).toBe(true);
		});

		test("Model.getHookCallbacks() returns array", async () => {
			class TestModel2 extends Model {
				static table = "test";
			}

			TestModel2.on("saving", () => {});
			TestModel2.on("saving", () => {});

			const callbacks = TestModel2.getHookCallbacks("saving");
			expect(Array.isArray(callbacks)).toBe(true);
			expect(callbacks.length).toBe(2);
		});

		test("static hooks isolated per model", async () => {
			class ModelA extends Model {
				table = "a";
			}

			class ModelB extends Model {
				table = "b";
			}

			ModelA.on("saving", () => {});
			ModelB.on("saving", () => {});

			const aCallbacks = ModelA.getHookCallbacks("saving");
			const bCallbacks = ModelB.getHookCallbacks("saving");

			expect(aCallbacks.length).toBe(1);
			expect(bCallbacks.length).toBe(1);
		});
	});
});
