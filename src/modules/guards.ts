/**
 * Guards System
 *
 * Guards determine whether a request should be allowed to proceed to the handler.
 * They run before interceptors and pipes in the request pipeline.
 * 
 * Execution Order:
 * Incoming Request → Guards → Interceptors → Pipes → Handler
 * 
 * If any guard returns false, the request is rejected with 403 Forbidden.
 */

import type { Context } from "../context";
import type { Token } from "../container";

// ============= Types =============

/**
 * Guard interface for authorization checks
 * 
 * @example
 * ```typescript
 * @Injectable()
 * class AuthGuard implements CanActivate {
 *   canActivate(context: Context): boolean {
 *     return !!context.request.headers.get('Authorization');
 *   }
 * }
 * ```
 */
export interface CanActivate {
	canActivate(context: Context): boolean | Promise<boolean>;
}

/**
 * Guard function type (for functional guards)
 * 
 * @example
 * ```typescript
 * const authGuard: GuardFn = (context) => {
 *   return !!context.request.headers.get('Authorization');
 * };
 * ```
 */
export type GuardFn = (context: Context) => boolean | Promise<boolean>;

/**
 * Guard type - can be:
 * - A token for a guard class registered in the container
 * - A guard class instance
 * - A guard function
 */
export type Guard = Token<CanActivate> | CanActivate | GuardFn;

/**
 * Metadata key for storing guards on classes and methods
 */
const GUARDS_METADATA_KEY = "guards";

// ============= Metadata Storage =============

// Type alias for class constructors
type Constructor = new (...args: unknown[]) => unknown;

// WeakMap for storing guards metadata on classes
const guardsClassMetadata = new WeakMap<Constructor, Guard[]>();

// WeakMap for storing guards metadata on method prototypes
const guardsMethodMetadata = new WeakMap<object, Map<string | symbol, Guard[]>>();

/**
 * Set guards on a class constructor
 */
function setClassGuards(target: Constructor, guards: Guard[]): void {
	guardsClassMetadata.set(target, guards);
}

/**
 * Get guards from a class constructor
 */
export function getClassGuards(target: Constructor): Guard[] | undefined {
	return guardsClassMetadata.get(target);
}

/**
 * Set guards on a method
 */
function setMethodGuards(
	target: object,
	propertyKey: string | symbol,
	guards: Guard[],
): void {
	if (!guardsMethodMetadata.has(target)) {
		guardsMethodMetadata.set(target, new Map());
	}
	guardsMethodMetadata.get(target)?.set(propertyKey, guards);
}

/**
 * Get guards from a method
 */
export function getMethodGuards(
	target: object,
	propertyKey: string | symbol,
): Guard[] | undefined {
	return guardsMethodMetadata.get(target)?.get(propertyKey);
}

// ============= Decorators =============

/**
 * Decorator to apply guards to a controller class or method.
 * Guards are executed in the order they are provided.
 *
 * @param guards - Guards to apply
 * @returns ClassDecorator & MethodDecorator
 *
 * @example
 * ```typescript
 * // Apply to all methods in controller
 * @Controller('users')
 * @UseGuards(AuthGuard)
 * class UsersController {
 *   @Get()
 *   getUsers() {} // Protected by AuthGuard
 *
 *   @Get(':id')
 *   @UseGuards(RolesGuard) // Additional guard
 *   getUser() {} // Protected by AuthGuard AND RolesGuard
 * }
 * ```
 */
export function UseGuards(...guards: Guard[]): MethodDecorator & ClassDecorator {
	const decorator = (
		target: unknown,
		propertyKey?: string | symbol,
		descriptor?: PropertyDescriptor,
	): PropertyDescriptor | void => {
		if (propertyKey !== undefined && descriptor !== undefined) {
			// Method decorator
			const targetObj = target as object;
			const existingGuards = getMethodGuards(targetObj, propertyKey) ?? [];
			setMethodGuards(targetObj, propertyKey, [...existingGuards, ...guards]);
			return descriptor;
		} else {
			// Class decorator
			const targetClass = target as Constructor;
			const existingGuards = getClassGuards(targetClass) ?? [];
			setClassGuards(targetClass, [...existingGuards, ...guards]);
		}
	};
	return decorator as MethodDecorator & ClassDecorator;
}

// ============= Built-in Guards =============

/**
 * AuthGuard - Checks for Authorization header
 *
 * This guard verifies that the request has an Authorization header.
 * It does not validate the token - that should be done by a custom guard.
 *
 * @example
 * ```typescript
 * @Controller('api')
 * @UseGuards(AuthGuard)
 * class ApiController {
 *   @Get('protected')
 *   protectedRoute() {} // Requires Authorization header
 * }
 * ```
 */
export class AuthGuard implements CanActivate {
	canActivate(context: Context): boolean {
		const authHeader = context.req.headers.get("Authorization");
		return authHeader !== null && authHeader.length > 0;
	}
}

/**
 * Role metadata key for storing required roles on methods
 */
const ROLES_METADATA_KEY = "roles";

// WeakMap for storing roles metadata on method prototypes
const rolesMethodMetadata = new WeakMap<object, Map<string | symbol, string[]>>();

/**
 * Set required roles on a method
 */
function setMethodRoles(
	target: object,
	propertyKey: string | symbol,
	roles: string[],
): void {
	if (!rolesMethodMetadata.has(target)) {
		rolesMethodMetadata.set(target, new Map());
	}
	rolesMethodMetadata.get(target)?.set(propertyKey, roles);
}

/**
 * Get required roles from a method
 */
export function getMethodRoles(
	target: object,
	propertyKey: string | symbol,
): string[] | undefined {
	return rolesMethodMetadata.get(target)?.get(propertyKey);
}

/**
 * Decorator to specify required roles for a route
 * Must be used in conjunction with RolesGuard
 * 
 * @param roles - Required roles
 * @returns MethodDecorator
 * 
 * @example
 * ```typescript
 * @Controller('admin')
 * @UseGuards(AuthGuard, RolesGuard)
 * class AdminController {
 *   @Get('users')
 *   @Roles('admin', 'moderator')
 *   getUsers() {} // Requires 'admin' or 'moderator' role
 * }
 * ```
 */
export function Roles(...roles: string[]): MethodDecorator {
	return (
		target: unknown,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const targetObj = target as object;
		setMethodRoles(targetObj, propertyKey, roles);
		return descriptor;
	};
}

/**
 * User interface for type safety
 * Applications should extend this interface with their user type
 */
export interface User {
	id: string | number;
	roles?: string[];
}

/**
 * Context extension for user data
 * This extends the Context type to include user information
 */
declare module "../context" {
	interface Context {
		user?: User;
	}
}

/**
 * RolesGuard - Checks user roles
 *
 * This guard checks if the authenticated user has the required roles.
 * It should be used after AuthGuard in the guard chain.
 *
 * The user object must be set on the context before this guard runs.
 * This is typically done by an authentication middleware or a previous guard.
 *
 * @example
 * ```typescript
 * @Controller('admin')
 * @UseGuards(AuthGuard, RolesGuard)
 * class AdminController {
 *   @Get('dashboard')
 *   @Roles('admin')
 *   getDashboard() {} // Requires 'admin' role
 * }
 * ```
 */
export class RolesGuard implements CanActivate {
	canActivate(context: Context): boolean {
		// Get required roles from context (set by the framework during route matching)
		const requiredRoles = (context as unknown as { requiredRoles?: string[] }).requiredRoles;

		// If no roles are required, allow access
		if (!requiredRoles || requiredRoles.length === 0) {
			return true;
		}

		// Check if user exists and has at least one required role
		const user = (context as unknown as { user?: User }).user;
		if (!user || !user.roles) {
			return false;
		}

		return requiredRoles.some((role) => user.roles?.includes(role));
	}
}

// ============= Guard Executor =============

/**
 * Guard executor options
 */
export interface GuardExecutorOptions {
	/** Global guards applied to all routes */
	globalGuards?: Guard[];
	/** Guards from controller class */
	classGuards?: Guard[];
	/** Guards from method */
	methodGuards?: Guard[];
	/** Container for resolving guard instances */
	resolveGuard?: (guard: Guard) => CanActivate | GuardFn | null;
}

/**
 * Execute guards in order and return whether the request should proceed
 * 
 * @param context - Request context
 * @param options - Guard executor options
 * @returns true if all guards pass, false otherwise
 */
export async function executeGuards(
	context: Context,
	options: GuardExecutorOptions,
): Promise<boolean> {
	const { globalGuards = [], classGuards = [], methodGuards = [], resolveGuard } = options;

	// Combine all guards in execution order
	const allGuards = [...globalGuards, ...classGuards, ...methodGuards];

	// Execute each guard in order
	for (const guard of allGuards) {
		let guardInstance: CanActivate | GuardFn | null = null;

		// Resolve the guard
		if (typeof guard === "function") {
			// Check if it's a guard function or a class constructor
			const funcGuard = guard as { prototype?: unknown; canActivate?: unknown };
			if (funcGuard.prototype && typeof funcGuard.prototype === "object" &&
				"canActivate" in (funcGuard.prototype as object)) {
				// It's a class constructor - try to resolve from container or create instance
				guardInstance = resolveGuard ? resolveGuard(guard) : null;
				if (!guardInstance) {
					// Create a new instance if not in container
					// Use unknown first to safely convert
					const GuardClass = guard as unknown as new () => CanActivate;
					guardInstance = new GuardClass();
				}
			} else {
				// It's a guard function
				guardInstance = guard as GuardFn;
			}
		} else if (typeof guard === "object" && guard !== null) {
			// It's a token or already an instance
			const objGuard = guard as { canActivate?: unknown };
			if ("canActivate" in objGuard && typeof objGuard.canActivate === "function") {
				// It's already a CanActivate instance
				guardInstance = guard as CanActivate;
			} else {
				// It's a token - try to resolve
				guardInstance = resolveGuard ? resolveGuard(guard) : null;
			}
		}

		if (!guardInstance) {
			console.warn("Guard could not be resolved:", guard);
			continue;
		}

		// Execute the guard
		let result: boolean;
		if (typeof guardInstance === "function") {
			// Guard function
			result = await guardInstance(context);
		} else {
			// CanActivate instance
			result = await guardInstance.canActivate(context);
		}

		// If any guard returns false, stop and return false
		if (!result) {
			return false;
		}
	}

	return true;
}

/**
 * Create a 403 Forbidden response
 */
export function createForbiddenResponse(): Response {
	return new Response(JSON.stringify({
		statusCode: 403,
		error: "Forbidden",
		message: "Access denied",
	}), {
		status: 403,
		headers: {
			"Content-Type": "application/json",
		},
	});
}