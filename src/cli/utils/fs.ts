/**
 * File System Utilities for Bueno CLI
 *
 * Provides file system operations using Bun's native APIs
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		return await Bun.file(filePath).exists();
	} catch {
		return false;
	}
}

/**
 * Check if a file exists (sync)
 */
export function fileExistsSync(filePath: string): boolean {
	return fs.existsSync(filePath);
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.promises.stat(dirPath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Check if a path is a directory (sync)
 */
export function isDirectorySync(dirPath: string): boolean {
	try {
		return fs.statSync(dirPath).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Create a directory recursively
 */
export async function createDirectory(dirPath: string): Promise<void> {
	await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Create a directory recursively (sync)
 */
export function createDirectorySync(dirPath: string): void {
	fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Read a file as string
 */
export async function readFile(filePath: string): Promise<string> {
	return await Bun.file(filePath).text();
}

/**
 * Read a file as string (sync)
 */
export function readFileSync(filePath: string): string {
	return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write a file
 */
export async function writeFile(
	filePath: string,
	content: string,
): Promise<void> {
	// Ensure directory exists
	const dir = path.dirname(filePath);
	await createDirectory(dir);

	await Bun.write(filePath, content);
}

/**
 * Write a file (sync)
 */
export function writeFileSync(filePath: string, content: string): void {
	// Ensure directory exists
	const dir = path.dirname(filePath);
	createDirectorySync(dir);

	fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
	await fs.promises.unlink(filePath);
}

/**
 * Delete a file (sync)
 */
export function deleteFileSync(filePath: string): void {
	fs.unlinkSync(filePath);
}

/**
 * Delete a directory recursively
 */
export async function deleteDirectory(dirPath: string): Promise<void> {
	await fs.promises.rm(dirPath, { recursive: true, force: true });
}

/**
 * Delete a directory recursively (sync)
 */
export function deleteDirectorySync(dirPath: string): void {
	fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Copy a file
 */
export async function copyFile(
	src: string,
	dest: string,
): Promise<void> {
	// Ensure destination directory exists
	const dir = path.dirname(dest);
	await createDirectory(dir);

	await fs.promises.copyFile(src, dest);
}

/**
 * Copy a directory recursively
 */
export async function copyDirectory(
	src: string,
	dest: string,
	options: { exclude?: string[] } = {},
): Promise<void> {
	const exclude = options.exclude ?? [];

	await createDirectory(dest);

	const entries = await fs.promises.readdir(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		if (exclude.includes(entry.name)) {
			continue;
		}

		if (entry.isDirectory()) {
			await copyDirectory(srcPath, destPath, options);
		} else if (entry.isFile()) {
			await copyFile(srcPath, destPath);
		}
	}
}

/**
 * List files in a directory
 */
export async function listFiles(
	dirPath: string,
	options: { recursive?: boolean; pattern?: RegExp } = {},
): Promise<string[]> {
	const files: string[] = [];

	async function walk(dir: string): Promise<void> {
		const entries = await fs.promises.readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory() && options.recursive) {
				await walk(fullPath);
			} else if (entry.isFile()) {
				if (!options.pattern || options.pattern.test(entry.name)) {
					files.push(fullPath);
				}
			}
		}
	}

	await walk(dirPath);
	return files;
}

/**
 * Find a file by name in parent directories
 */
export async function findFileUp(
	startDir: string,
	fileName: string,
	options: { stopAt?: string } = {},
): Promise<string | null> {
	let currentDir = startDir;
	const stopAt = options.stopAt ?? '/';

	while (currentDir !== stopAt && currentDir !== '/') {
		const filePath = path.join(currentDir, fileName);
		if (await fileExists(filePath)) {
			return filePath;
		}
		currentDir = path.dirname(currentDir);
	}

	return null;
}

/**
 * Get the project root directory
 */
export async function getProjectRoot(
	startDir: string = process.cwd(),
): Promise<string | null> {
	// Look for package.json as indicator
	const packageJsonPath = await findFileUp(startDir, 'package.json');
	if (packageJsonPath) {
		return path.dirname(packageJsonPath);
	}
	return null;
}

/**
 * Check if path is inside a Bueno project
 */
export async function isBuenoProject(
	dir: string = process.cwd(),
): Promise<boolean> {
	const root = await getProjectRoot(dir);
	if (!root) return false;

	// Check for bueno.config.ts or package.json with bueno dependency
	const configPath = path.join(root, 'bueno.config.ts');
	if (await fileExists(configPath)) return true;

	const packageJsonPath = path.join(root, 'package.json');
	if (await fileExists(packageJsonPath)) {
		const content = await readFile(packageJsonPath);
		try {
			const pkg = JSON.parse(content);
			return !!(pkg.dependencies?.bueno || pkg.devDependencies?.bueno);
		} catch {
			return false;
		}
	}

	return false;
}

/**
 * Read JSON file
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
	const content = await readFile(filePath);
	return JSON.parse(content);
}

/**
 * Write JSON file
 */
export async function writeJson(
	filePath: string,
	data: unknown,
	options: { pretty?: boolean } = {},
): Promise<void> {
	const content = options.pretty !== false
		? JSON.stringify(data, null, 2)
		: JSON.stringify(data);
	await writeFile(filePath, content);
}

/**
 * Get relative path
 */
export function relativePath(from: string, to: string): string {
	return path.relative(from, to);
}

/**
 * Join paths
 */
export function joinPaths(...paths: string[]): string {
	return path.join(...paths);
}

/**
 * Get file name without extension
 */
export function getFileName(filePath: string): string {
	return path.basename(filePath, path.extname(filePath));
}

/**
 * Get directory name
 */
export function getDirName(filePath: string): string {
	return path.dirname(filePath);
}

/**
 * Get file extension
 */
export function getExtName(filePath: string): string {
	return path.extname(filePath);
}

/**
 * Normalize path separators
 */
export function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

/**
 * Template file processing
 */
export interface TemplateData {
	[key: string]: string | number | boolean | TemplateData | TemplateData[];
}

/**
 * Process a template string
 */
export function processTemplate(
	template: string,
	data: TemplateData,
): string {
	let result = template;

	// Process conditionals: {{#if key}}...{{/if}}
	result = result.replace(
		/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
		(_, key: string, content: string) => {
			const value = data[key];
			return value ? content : '';
		},
	);

	// Process each loops: {{#each items}}...{{/each}}
	result = result.replace(
		/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
		(_, key: string, content: string) => {
			const items = data[key];
			if (!Array.isArray(items)) return '';

			return items
				.map((item) => {
					let itemContent = content;
					if (typeof item === 'object' && item !== null) {
						// Replace nested properties
						for (const [k, v] of Object.entries(item)) {
							itemContent = itemContent.replace(
								new RegExp(`\\{\\{${k}\\}\\}`, 'g'),
								String(v),
							);
						}
					}
					return itemContent;
				})
				.join('');
		},
	);

	// Process simple variables with helpers: {{helperName key}}
	const helpers: Record<string, (v: string) => string> = {
		camelCase: (v) =>
			v.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^(.)/, (c) => c.toLowerCase()),
		pascalCase: (v) =>
			v.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^(.)/, (c) => c.toUpperCase()),
		kebabCase: (v) =>
			v.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[-_\s]+/g, '-').toLowerCase(),
		snakeCase: (v) =>
			v.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase(),
		upperCase: (v) => v.toUpperCase(),
		lowerCase: (v) => v.toLowerCase(),
		capitalize: (v) => v.charAt(0).toUpperCase() + v.slice(1),
		pluralize: (v) => {
			if (v.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].some((e) => v.endsWith(e))) {
				return v.slice(0, -1) + 'ies';
			}
			if (v.endsWith('s') || v.endsWith('x') || v.endsWith('z') || v.endsWith('ch') || v.endsWith('sh')) {
				return v + 'es';
			}
			return v + 's';
		},
	};

	for (const [helperName, helperFn] of Object.entries(helpers)) {
		const regex = new RegExp(`\\{\\{${helperName}\\s+(\\w+)\\}\\}`, 'g');
		result = result.replace(regex, (_, key: string) => {
			const value = data[key];
			if (typeof value === 'string') {
				return helperFn(value);
			}
			return String(value);
		});
	}

	// Process simple variables: {{key}}
	for (const [key, value] of Object.entries(data)) {
		const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
		result = result.replace(regex, String(value));
	}

	// Clean up empty lines left by conditionals
	result = result.replace(/^\s*\n/gm, '\n');
	result = result.replace(/\n{3,}/g, '\n\n');

	return result.trim();
}