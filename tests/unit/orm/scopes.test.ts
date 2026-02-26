import { describe, test, expect } from "bun:test";
import { ScopeRegistry, SoftDeleteScope } from "../../../src/database/orm/scopes";

describe("ScopeRegistry", () => {
	test("addGlobalScope() registers a scope", () => {
		const registry = new ScopeRegistry();
		const scope = (query: any) => query.whereNull("deleted_at");
		registry.addGlobalScope("soft-delete", scope);
		expect(registry.getGlobalScopes().length).toBe(1);
	});

	test("getGlobalScopes() returns array of scopes", () => {
		const registry = new ScopeRegistry();
		const scope1 = (query: any) => query.whereNull("deleted_at");
		const scope2 = (query: any) => query.where("active", true);
		registry.addGlobalScope("soft-delete", scope1);
		registry.addGlobalScope("active", scope2);
		const scopes = registry.getGlobalScopes();
		expect(scopes.length).toBe(2);
	});

	test("removeGlobalScope() removes a scope", () => {
		const registry = new ScopeRegistry();
		const scope = (query: any) => query.whereNull("deleted_at");
		registry.addGlobalScope("soft-delete", scope);
		registry.removeGlobalScope("soft-delete");
		expect(registry.getGlobalScopes().length).toBe(0);
	});

	test("hasGlobalScope() checks if scope exists", () => {
		const registry = new ScopeRegistry();
		const scope = (query: any) => query.whereNull("deleted_at");
		registry.addGlobalScope("soft-delete", scope);
		expect(registry.hasGlobalScope("soft-delete")).toBe(true);
	});

	test("hasGlobalScope() returns false if not added", () => {
		const registry = new ScopeRegistry();
		const scope1 = (query: any) => query.whereNull("deleted_at");
		registry.addGlobalScope("soft-delete", scope1);
		expect(registry.hasGlobalScope("archived")).toBe(false);
	});

	test("clearGlobalScopes() removes all scopes", () => {
		const registry = new ScopeRegistry();
		registry.addGlobalScope("soft-delete", (q) => q);
		registry.addGlobalScope("active", (q) => q);
		registry.clearGlobalScopes();
		expect(registry.getGlobalScopes().length).toBe(0);
	});
});

describe("SoftDeleteScope", () => {
	test("apply() can be instantiated", () => {
		const scope = new SoftDeleteScope();
		expect(scope).toBeDefined();
		expect(scope.apply).toBeDefined();
	});

	test("soft delete scope applies whereNull constraint", () => {
		const scope = new SoftDeleteScope();
		const queryMock = {
			whereNullCalled: false,
			whereNull(column: string) {
				this.whereNullCalled = true;
				this.deletedAtColumn = column;
				return this;
			},
		};
		scope.apply(queryMock as any);
		expect(queryMock.whereNullCalled).toBe(true);
		expect((queryMock as any).deletedAtColumn).toBe("deleted_at");
	});
});
