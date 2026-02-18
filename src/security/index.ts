/**
 * Security Primitives
 *
 * Provides password hashing, JWT handling, CSRF protection,
 * and authentication middleware using Bun's built-in capabilities.
 */

import type { Context } from "../context";
import type { Middleware } from "../middleware";

// ============= Password Utilities =============

export interface PasswordOptions {
	algorithm?: "argon2id" | "bcrypt";
	cost?: number;
}

export const Password = {
	/**
	 * Hash a password using Bun's built-in password hashing
	 */
	async hash(password: string, options?: PasswordOptions): Promise<string> {
		const algorithm = options?.algorithm ?? "argon2id";
		// Bun.password.hash returns a string hash
		return Bun.password.hash(password, {
			algorithm,
		});
	},

	/**
	 * Verify a password against a hash
	 */
	async verify(password: string, hash: string): Promise<boolean> {
		return Bun.password.verify(password, hash);
	},

	/**
	 * Check if a hash needs rehashing (e.g., algorithm upgrade)
	 */
	needsRehash(hash: string, options?: PasswordOptions): boolean {
		const algorithm = options?.algorithm ?? "argon2id";
		// Check if needsRehash exists on Bun.password (it may not in all versions)
		if (typeof (Bun.password as unknown as Record<string, unknown>).needsRehash === 'function') {
			const needsRehashFn = (Bun.password as unknown as Record<string, unknown>).needsRehash as (hash: string, options: { algorithm: string }) => boolean;
			return !needsRehashFn(hash, { algorithm });
		}
		// Fallback: check if hash starts with the expected algorithm prefix
		if (algorithm === 'argon2id' && !hash.startsWith('$argon2id')) {
			return true;
		}
		if (algorithm === 'bcrypt' && !hash.startsWith('$2')) {
			return true;
		}
		return false;
	},
};

// ============= JWT Utilities =============

export interface JWTOptions {
	expiresIn?: number | string; // seconds or string like '1h', '7d'
	issuer?: string;
	audience?: string;
}

export interface JWTPayload {
	[key: string]: unknown;
	iat?: number;
	exp?: number;
	iss?: string;
	aud?: string;
}

export class JWT {
	private secret: string;
	private options: JWTOptions;

	constructor(secret: string, options: JWTOptions = {}) {
		this.secret = secret;
		this.options = options;
	}

	/**
	 * Sign a payload and create a JWT
	 */
	async sign(payload: JWTPayload): Promise<string> {
		const now = Math.floor(Date.now() / 1000);

		const fullPayload: JWTPayload = {
			...payload,
			iat: now,
		};

		// Add expiry
		if (this.options.expiresIn) {
			if (typeof this.options.expiresIn === "number") {
				fullPayload.exp = now + this.options.expiresIn;
			} else {
				// Parse string like '1h', '7d'
				fullPayload.exp = now + this.parseExpiry(this.options.expiresIn);
			}
		}

		// Add issuer
		if (this.options.issuer) {
			fullPayload.iss = this.options.issuer;
		}

		// Add audience
		if (this.options.audience) {
			fullPayload.aud = this.options.audience;
		}

		// Create JWT using Bun's JWT support or fallback to manual creation
		return this.createToken(fullPayload);
	}

	/**
	 * Verify and decode a JWT
	 */
	async verify(token: string): Promise<JWTPayload | null> {
		try {
			const payload = await this.decodeToken(token);

			if (!payload) {
				return null;
			}

			// Check expiry
			if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
				return null;
			}

			return payload;
		} catch {
			return null;
		}
	}

	/**
	 * Decode token without verification (for debugging)
	 */
	decode(token: string): JWTPayload | null {
		try {
			return this.decodeTokenUnsafe(token);
		} catch {
			return null;
		}
	}

	/**
	 * Parse expiry string to seconds
	 */
	private parseExpiry(expiresIn: string): number {
		const match = expiresIn.match(/^(\d+)([smhd])$/);
		if (!match) {
			throw new Error(`Invalid expiresIn format: ${expiresIn}`);
		}

		const value = Number.parseInt(match[1], 10);
		const unit = match[2];

		switch (unit) {
			case "s":
				return value;
			case "m":
				return value * 60;
			case "h":
				return value * 60 * 60;
			case "d":
				return value * 60 * 60 * 24;
			default:
				throw new Error(`Unknown time unit: ${unit}`);
		}
	}

	/**
	 * Create JWT token manually
	 */
	private async createToken(payload: JWTPayload): Promise<string> {
		const header = { alg: "HS256", typ: "JWT" };

		const encoder = new TextEncoder();
		const headerB64 = this.base64UrlEncode(
			encoder.encode(JSON.stringify(header)),
		);
		const payloadB64 = this.base64UrlEncode(
			encoder.encode(JSON.stringify(payload)),
		);

		const data = `${headerB64}.${payloadB64}`;
		const signature = await this.signData(data);

		return `${data}.${signature}`;
	}

	/**
	 * Decode and verify token
	 */
	private async decodeToken(token: string): Promise<JWTPayload | null> {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}

		const [headerB64, payloadB64, signature] = parts;
		const data = `${headerB64}.${payloadB64}`;

		// Verify signature
		const expectedSignature = await this.signData(data);
		if (signature !== expectedSignature) {
			return null;
		}

		// Decode payload
		return this.base64UrlDecode<JWTPayload>(payloadB64);
	}

	/**
	 * Decode token without verification
	 */
	private decodeTokenUnsafe(token: string): JWTPayload | null {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}
		return this.base64UrlDecode<JWTPayload>(parts[1]);
	}

	/**
	 * Sign data using HMAC-SHA256
	 */
	private async signData(data: string): Promise<string> {
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(this.secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);

		const signature = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(data),
		);

		return this.base64UrlEncode(new Uint8Array(signature));
	}

	/**
	 * Base64URL encode
	 */
	private base64UrlEncode(data: Uint8Array): string {
		const base64 = btoa(String.fromCharCode(...data));
		return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
	}

	/**
	 * Base64URL decode
	 */
	private base64UrlDecode<T>(data: string): T {
		const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
		const decoded = atob(padded);
		return JSON.parse(decoded);
	}
}

// ============= CSRF Protection =============

export const CSRF = {
	/**
	 * Generate a CSRF token
	 */
	generate(): string {
		return crypto.randomUUID();
	},

	/**
	 * Get the secret for a token (for cookie-based validation)
	 */
	getSecret(): string {
		return crypto.randomUUID();
	},

	/**
	 * Verify a CSRF token against a secret
	 */
	verify(token: string, secret: string): boolean {
		// Simple comparison - in production, use constant-time comparison
		return token === secret;
	},

	/**
	 * Create CSRF middleware
	 */
	middleware(): Middleware {
		return async (context: Context, next: () => Promise<Response>) => {
			// Skip for safe methods
			if (["GET", "HEAD", "OPTIONS"].includes(context.method)) {
				return next();
			}

			const token = context.getHeader("x-csrf-token");
			const cookieToken = context.getCookie("csrf-token");

			if (!token || !cookieToken || token !== cookieToken) {
				return context.status(403).json({ error: "Invalid CSRF token" });
			}

			return next();
		};
	},
};

// ============= Authentication Middleware =============

export interface AuthMiddlewareOptions {
	jwt: JWT;
	header?: string;
	prefix?: string;
	skipPaths?: string[];
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(
	options: AuthMiddlewareOptions,
): Middleware {
	const {
		jwt,
		header = "authorization",
		prefix = "Bearer ",
		skipPaths = [],
	} = options;

	return async (context: Context, next: () => Promise<Response>) => {
		// Skip certain paths
		if (skipPaths.some((path) => context.path.startsWith(path))) {
			return next();
		}

		const authHeader = context.getHeader(header);

		if (!authHeader) {
			return context
				.status(401)
				.json({ error: "Missing authorization header" });
		}

		if (!authHeader.startsWith(prefix)) {
			return context
				.status(401)
				.json({ error: "Invalid authorization format" });
		}

		const token = authHeader.slice(prefix.length);
		const payload = await jwt.verify(token);

		if (!payload) {
			return context.status(401).json({ error: "Invalid or expired token" });
		}

		// Store user in context
		context.set("user", payload);

		return next();
	};
}

// ============= Role-Based Access Control =============

export interface RBACOptions {
	getUserRoles: (userId: string | number) => Promise<string[]>;
}

/**
 * Create RBAC middleware
 */
export function createRBACMiddleware(
	options: RBACOptions,
): (roles: string[]) => Middleware {
	const { getUserRoles } = options;

	return (allowedRoles: string[]): Middleware => {
		return async (context: Context, next: () => Promise<Response>) => {
			const user = context.get("user") as { userId?: string | number } | undefined;

			if (!user?.userId) {
				return context.status(401).json({ error: "Unauthorized" });
			}

			const userRoles = await getUserRoles(user.userId);
			const hasRole = allowedRoles.some((role) => userRoles.includes(role));

			if (!hasRole) {
				return context.status(403).json({ error: "Forbidden" });
			}

			return next();
		};
	};
}

// ============= API Key Authentication =============

export interface APIKeyOptions {
	validateKey: (apiKey: string) => Promise<boolean>;
	header?: string;
}

/**
 * Create API key authentication middleware
 */
export function createAPIKeyMiddleware(options: APIKeyOptions): Middleware {
	const { validateKey, header = "x-api-key" } = options;

	return async (context: Context, next: () => Promise<Response>) => {
		const apiKey = context.getHeader(header);

		if (!apiKey) {
			return context.status(401).json({ error: "Missing API key" });
		}

		const isValid = await validateKey(apiKey);

		if (!isValid) {
			return context.status(401).json({ error: "Invalid API key" });
		}

		return next();
	};
}