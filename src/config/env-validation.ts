/**
 * Environment variable validation for Bueno Framework
 */

import type { ValidationResult } from "../validation";
import { validateEnvSync } from "../validation";
import { envSchema } from "../validation/schemas";

/**
 * Validate environment variables against the Bueno schema
 *
 * @param envVars - Environment variables to validate
 * @returns Validation result with transformed values or error details
 */
export function validateEnvVars(envVars: Record<string, string>): ValidationResult {
    return validateEnvSync(envSchema, envVars);
}

/**
 * Validate and load environment variables from .env files
 *
 * @param options - Options for loading and validating environment variables
 * @returns Validation result with transformed values or error details
 */
export async function validateAndLoadEnv(options?: {
    /** Custom list of env files to load */
    files?: string[];
    /** Whether to also load NODE_ENV-specific file */
    loadNodeEnv?: boolean;
    /** Base directory for env files */
    cwd?: string;
    /** Whether to merge with existing Bun.env */
    mergeWithProcess?: boolean;
}): Promise<ValidationResult> {
    try {
        // Load environment variables from files
        const { loadEnvFiles } = await import("./env");
        const rawEnvVars = await loadEnvFiles(options);

        // Validate the environment variables
        return validateEnvVars(rawEnvVars);
    } catch (error) {
        return {
            success: false,
            issues: [
                {
                    message: `Failed to load and validate environment variables: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
            ],
        };
    }
}

/**
 * Get validation error messages as a single string
 *
 * @param result - Validation result
 * @returns Formatted error message or null if valid
 */
export function getValidationErrorMessage(result: ValidationResult): string | null {
    if (result.success) {
        return null;
    }

    return result.issues
        .map((issue) => issue.message)
        .join('\n');
}

/**
 * Check if required environment variables are set
 *
 * @param envVars - Environment variables to check
 * @returns True if all required variables are present and valid
 */
export function hasRequiredEnvVars(envVars: Record<string, string>): boolean {
    const result = validateEnvVars(envVars);
    return result.success;
}

/**
 * Get missing required environment variables
 *
 * @param envVars - Environment variables to check
 * @returns Array of missing required variable names
 */
export function getMissingEnvVars(envVars: Record<string, string>): string[] {
    const result = validateEnvVars(envVars);
    if (result.success) {
        return [];
    }

    return result.issues
        .filter((issue) => issue.message.includes('This environment variable is required'))
        .map((issue) => issue.path?.[0] || 'unknown');
}