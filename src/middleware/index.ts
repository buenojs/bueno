/**
 * Middleware System
 *
 * Provides a composable middleware pipeline with async/await support
 * and context mutation capabilities.
 */

import type { Context } from "../context";

// ============= Types =============

/**
 * Middleware function type
 */
export type Middleware = (
	context: Context,
	next: () => Promise<Response>,
) => Promise<Response> | Response;

/**
 * Route handler type
 */
export type Handler = (context: Context) => Promise<Response> | Response;

// ============= Compose =============

/**
 * Compose multiple middleware into a single function
 * Following Koa-style middleware pattern
 */
export function compose(
	middleware: Middleware[],
): (context: Context, handler: Handler) => Promise<Response> {
	return async (context: Context, handler: Handler): Promise<Response> => {
		let index = -1;

		const dispatch = async (i: number): Promise<Response> => {
			if (i <= index) {
				throw new Error("next() called multiple times");
			}

			index = i;

			// If we've run all middleware, call the handler
			if (i >= middleware.length) {
				return handler(context);
			}

			const fn = middleware[i];

			return fn(context, async () => {
				return dispatch(i + 1);
			});
		};

		return dispatch(0);
	};
}

// ============= Pipeline Class =============

export class Pipeline {
	private middleware: Middleware[] = [];

	/**
	 * Add middleware to the pipeline
	 */
	use(middleware: Middleware): this {
		this.middleware.push(middleware);
		return this;
	}

	/**
	 * Execute the pipeline with a handler
	 */
	async execute(context: Context, handler: Handler): Promise<Response> {
		const fn = compose(this.middleware);
		return fn(context, handler);
	}

	/**
	 * Get middleware count
	 */
	get length(): number {
		return this.middleware.length;
	}
}

/**
 * Create a new middleware pipeline
 */
export function createPipeline(): Pipeline {
	return new Pipeline();
}
