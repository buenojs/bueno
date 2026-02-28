/**
 * Base Channel Service
 *
 * Abstract base class for all channel implementations
 */

import type {
	ChannelHealth,
	ChannelService,
	NotificationMessage,
} from "../types";

// ============= Abstract Base Channel Service =============

export abstract class BaseChannelService<
	T extends NotificationMessage = NotificationMessage,
> implements ChannelService<T>
{
	abstract readonly name: string;
	readonly configSchema?: unknown;

	/**
	 * Validate message structure
	 * Should throw if message is invalid
	 */
	abstract validate(message: unknown): asserts message is T;

	/**
	 * Send a notification message
	 */
	abstract send(message: T): Promise<string | undefined>;

	/**
	 * Get health status
	 */
	async getHealth(): Promise<ChannelHealth> {
		return {
			status: "healthy",
			message: "Channel is operational",
			checkedAt: new Date(),
		};
	}

	/**
	 * Validate that value matches expected type
	 */
	protected validateField(
		value: unknown,
		expectedType: string,
		fieldName: string,
	): void {
		const actualType = typeof value;
		if (actualType !== expectedType) {
			throw new Error(
				`Invalid ${this.name} message: ${fieldName} must be ${expectedType}, got ${actualType}`,
			);
		}
	}

	/**
	 * Validate that required field exists
	 */
	protected validateRequired(value: unknown, fieldName: string): void {
		if (value === undefined || value === null) {
			throw new Error(`Invalid ${this.name} message: ${fieldName} is required`);
		}
	}
}
