/**
 * Model Hooks / Lifecycle Events
 *
 * Provides lifecycle callbacks for model events:
 * creating, created, updating, updated, saving, saved,
 * deleting, deleted, restoring, restored
 */

export type ModelHookName =
	| "creating"
	| "created"
	| "updating"
	| "updated"
	| "saving"
	| "saved"
	| "deleting"
	| "deleted"
	| "restoring"
	| "restored";

export type ModelHookCallback<M> = (
	model: M,
) => void | Promise<void> | boolean | Promise<boolean>;

/**
 * Model hook registry for a specific model class
 */
export class HookRunner<M> {
	private hooks: Map<ModelHookName, ModelHookCallback<M>[]> = new Map();

	constructor(private modelClass: typeof Model) {
		this.initializeHooks();
	}

	/**
	 * Initialize hooks from model class static definitions
	 */
	private initializeHooks(): void {
		// Hooks are registered statically on the model class
		// They're accessed via Model.on() / Model.once() methods
	}

	/**
	 * Register a hook callback
	 */
	on(hookName: ModelHookName, callback: ModelHookCallback<M>): void {
		if (!this.hooks.has(hookName)) {
			this.hooks.set(hookName, []);
		}
		this.hooks.get(hookName)!.push(callback);
	}

	/**
	 * Run all callbacks for a hook
	 * Returns false if any callback explicitly returns false (to abort operation)
	 */
	async run(hookName: ModelHookName, model: M): Promise<boolean> {
		const callbacks = this.hooks.get(hookName) ?? [];

		for (const callback of callbacks) {
			const result = await callback(model);
			if (result === false) {
				return false; // Abort
			}
		}

		return true; // Continue
	}
}

/**
 * Placeholder to avoid circular dependency issues
 */
export abstract class Model {
	private static hookRegistry = new Map<string, Map<string, Function[]>>();

	/**
	 * Get or create the hook registry for this model class
	 */
	private static getHookRegistry(
		modelName: string,
	): Map<ModelHookName, Function[]> {
		if (!Model.hookRegistry.has(modelName)) {
			Model.hookRegistry.set(modelName, new Map<ModelHookName, Function[]>());
		}
		return Model.hookRegistry.get(modelName)! as Map<ModelHookName, Function[]>;
	}

	/**
	 * Register a hook callback on the model class
	 */
	static on<M extends Model>(
		this: { new (): M } & typeof Model,
		hookName: ModelHookName,
		callback: ModelHookCallback<M>,
	): void {
		const registry = Model.getHookRegistry(this.name);
		if (!registry.has(hookName)) {
			registry.set(hookName, []);
		}
		registry.get(hookName)!.push(callback as any);
	}

	/**
	 * Get all callbacks for a hook
	 */
	static getHookCallbacks<M extends Model>(
		this: { new (): M } & typeof Model,
		hookName: ModelHookName,
	): ModelHookCallback<M>[] {
		const registry = Model.getHookRegistry(this.name);
		return (registry.get(hookName) ?? []) as any;
	}
}
