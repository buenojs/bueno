/**
 * Model Scopes
 *
 * Local scopes (scopeXxx methods) and global scopes (auto-applied to all queries)
 */

export type ScopeDefinition<M> = (query: any) => any;

export class ScopeRegistry<M> {
	private globalScopes: Map<string, ScopeDefinition<M>> = new Map();

	/**
	 * Register a global scope
	 */
	addGlobalScope(name: string, scope: ScopeDefinition<M>): void {
		this.globalScopes.set(name, scope);
	}

	/**
	 * Remove a global scope by name
	 */
	removeGlobalScope(name: string): void {
		this.globalScopes.delete(name);
	}

	/**
	 * Get all global scopes
	 */
	getGlobalScopes(): ScopeDefinition<M>[] {
		return Array.from(this.globalScopes.values());
	}

	/**
	 * Clear all global scopes
	 */
	clearGlobalScopes(): void {
		this.globalScopes.clear();
	}

	/**
	 * Check if a global scope exists
	 */
	hasGlobalScope(name: string): boolean {
		return this.globalScopes.has(name);
	}
}

/**
 * Soft delete global scope — automatically added when model has softDeletes = true
 */
export class SoftDeleteScope {
	apply(query: any): void {
		query.whereNull("deleted_at");
	}
}
