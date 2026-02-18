/**
 * Production Bundler Implementation
 *
 * Provides zero-config bundling using Bun's native Bun.build() API.
 * Supports React, Vue, Svelte, and Solid frameworks with automatic detection.
 *
 * Features:
 * - Auto framework detection from package.json
 * - Code splitting by route
 * - CSS extraction and optimization
 * - Asset optimization
 * - Source map generation
 * - Build manifest for SSR integration
 */

import { createLogger, type Logger } from "../logger/index.js";
import { watch } from "fs";
import type { FSWatcher } from "fs";
import type {
	BundlerConfig,
	PartialBundlerConfig,
	BuildResult,
	BuildOutput,
	BuildError,
	BuildWarning,
	BuildManifest,
	BundleAnalysis,
	BuildWatchCallback,
	BundlerState,
	FrontendFramework,
	FrameworkBuildConfig,
	FrameworkDetectionResult,
	PackageDependencies,
} from "./types.js";
import { getFrameworkConfig, getFrameworkMeta } from "./frameworks/index.js";

// ============= Constants =============

const DEFAULT_OUT_DIR = "dist";
const DEFAULT_ENV_PREFIX = "PUBLIC_";
const FRAMEWORK_INDICATORS: Record<FrontendFramework, string[]> = {
	react: ["react", "react-dom"],
	vue: ["vue"],
	svelte: ["svelte"],
	solid: ["solid-js"],
};

// ============= Framework Detection =============

/**
 * Detect framework from package.json dependencies
 */
function detectFramework(rootDir: string): FrameworkDetectionResult {
	try {
		const packageJsonPath = `${rootDir}/package.json`;
		const packageJsonFile = Bun.file(packageJsonPath);

		if (!packageJsonFile.exists()) {
			return {
				framework: "react",
				detected: false,
				source: "config",
			};
		}

		// Read package.json synchronously
		const packageJson = JSON.parse(require("fs").readFileSync(packageJsonPath, "utf-8"));
		const dependencies: PackageDependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		// Check for each framework in order of specificity
		// Solid and Svelte are more specific than React/Vue
		const frameworkOrder: FrontendFramework[] = ["solid", "svelte", "vue", "react"];

		for (const framework of frameworkOrder) {
			const indicators = FRAMEWORK_INDICATORS[framework];
			if (indicators.some((pkg) => dependencies[pkg])) {
				return {
					framework,
					detected: true,
					source: "package.json",
				};
			}
		}

		// Default to React if no framework detected
		return {
			framework: "react",
			detected: false,
			source: "config",
		};
	} catch {
		return {
			framework: "react",
			detected: false,
			source: "config",
		};
	}
}

// ============= Bundler Class =============

export class Bundler {
	private config: BundlerConfig;
	private state: BundlerState;
	private logger: Logger;
	private watcher: FSWatcher | null = null;

	constructor(config: PartialBundlerConfig) {
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "Bundler" },
		});

		// Detect framework
		const rootDir = this.config.rootDir || process.cwd();
		const frameworkResult =
			this.config.framework === "auto"
				? detectFramework(rootDir)
				: {
						framework: this.config.framework as FrontendFramework,
						detected: true,
						source: "config" as const,
					};

		this.state = {
			building: false,
			lastResult: null,
			watching: false,
			framework: frameworkResult.framework,
		};

		// Update config with detected framework
		this.config.framework = frameworkResult.framework;

		if (frameworkResult.detected) {
			this.logger.info(`Detected framework: ${frameworkResult.framework}`, {
				source: frameworkResult.source,
			});
		} else {
			this.logger.info(`Using default framework: ${frameworkResult.framework}`);
		}
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config: PartialBundlerConfig): BundlerConfig {
		const rootDir = config.rootDir || process.cwd();
		return {
			entryPoints: config.entryPoints,
			outDir: config.outDir ?? DEFAULT_OUT_DIR,
			framework: config.framework ?? "auto",
			minify: config.minify ?? true,
			sourcemap: config.sourcemap ?? "linked",
			splitting: config.splitting ?? true,
			treeshaking: config.treeshaking ?? true,
			envPrefix: config.envPrefix ?? DEFAULT_ENV_PREFIX,
			define: config.define ?? {},
			external: config.external ?? [],
			target: config.target ?? "browser",
			format: config.format ?? "esm",
			rootDir,
			publicPath: config.publicPath,
			manifest: config.manifest ?? true,
			mode: config.mode,
		};
	}

	/**
	 * Get current bundler state
	 */
	getState(): BundlerState {
		return { ...this.state };
	}

	/**
	 * Get bundler configuration
	 */
	getConfig(): BundlerConfig {
		return { ...this.config };
	}

	/**
	 * Get detected framework
	 */
	getFramework(): FrontendFramework {
		return this.state.framework!;
	}

	/**
	 * Get framework-specific build configuration
	 */
	getFrameworkConfig(framework: FrontendFramework): FrameworkBuildConfig {
		return getFrameworkConfig(framework);
	}

	/**
	 * Build for production
	 */
	async build(): Promise<BuildResult> {
		const startTime = Date.now();

		if (this.state.building) {
			this.logger.warn("Build already in progress");
			return {
				success: false,
				outputs: [],
				errors: [{ message: "Build already in progress" }],
				warnings: [],
				duration: 0,
				totalSize: 0,
			};
		}

		this.state.building = true;
		this.logger.info("Starting production build...");

		try {
			// Get framework configuration
			const framework = this.state.framework!;
			const frameworkConfig = this.getFrameworkConfig(framework);

			// Prepare entry points
			const entryPoints = Array.isArray(this.config.entryPoints)
				? this.config.entryPoints
				: [this.config.entryPoints];

			// Collect environment variables with prefix
			const envVars = this.collectEnvVars();

			// Merge defines
			const define = {
				...frameworkConfig.define,
				...this.config.define,
				...envVars,
			};

			// Build using Bun.build()
			const buildResult = await Bun.build({
				entrypoints: entryPoints.map((e) =>
					e.startsWith("/") ? e : `${this.config.rootDir}/${e}`
				),
				outdir: this.config.outDir,
				minify: this.config.minify,
				splitting: this.config.splitting,
				sourcemap: this.config.sourcemap === "none" ? "external" : this.config.sourcemap,
				define,
				external: [...this.config.external, ...frameworkConfig.external],
				target: this.config.target,
				format: this.config.format,
				// JSX configuration
				jsx: frameworkConfig.jsxRuntime === "automatic"
					? { runtime: "automatic", importSource: frameworkConfig.jsxImportSource }
					: { runtime: "classic" },
				// Public path for assets
				publicPath: this.config.publicPath,
				// Generate manifest
				metafile: true,
			});

			const duration = Date.now() - startTime;

			if (!buildResult.success) {
				const result: BuildResult = {
					success: false,
					outputs: [],
					errors: buildResult.logs
						.filter((log) => log.level === "error")
						.map((log) => this.parseBuildError(log)),
					warnings: buildResult.logs
						.filter((log) => log.level === "warning")
						.map((log) => this.parseBuildWarning(log)),
					duration,
					totalSize: 0,
				};

				this.state.lastResult = result;
				this.logger.error(`Build failed in ${duration}ms`, result.errors);
				return result;
			}

			// Process outputs
			const outputs = this.processBuildOutputs(buildResult.outputs);

			// Generate manifest
			const manifest = this.config.manifest
				? await this.generateManifest(buildResult, outputs, duration)
				: undefined;

			// Calculate total size
			const totalSize = outputs.reduce((sum, output) => sum + output.size, 0);

			const result: BuildResult = {
				success: true,
				outputs,
				errors: [],
				warnings: buildResult.logs
					.filter((log) => log.level === "warning")
					.map((log) => this.parseBuildWarning(log)),
				duration,
				manifest,
				totalSize,
			};

			this.state.lastResult = result;
			this.logger.info(`Build completed in ${duration}ms`, {
				outputs: outputs.length,
				totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
			});

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			const result: BuildResult = {
				success: false,
				outputs: [],
				errors: [
					{
						message: error instanceof Error ? error.message : "Unknown build error",
						stack: error instanceof Error ? error.stack : undefined,
					},
				],
				warnings: [],
				duration,
				totalSize: 0,
			};

			this.state.lastResult = result;
			this.logger.error(`Build failed in ${duration}ms`, error);
			return result;
		} finally {
			this.state.building = false;
		}
	}

	/**
	 * Watch mode for development
	 */
	watch(callback: BuildWatchCallback): void {
		if (this.state.watching) {
			this.logger.warn("Watch mode already active");
			return;
		}

		this.state.watching = true;
		this.logger.info("Starting watch mode...");

		// Initial build
		this.build().then(callback);

		// Watch for file changes using fs.watch
		const entryPoints = Array.isArray(this.config.entryPoints)
			? this.config.entryPoints
			: [this.config.entryPoints];

		const srcDir = `${this.config.rootDir}/src`;
		
		this.watcher = watch(
			srcDir,
			{ recursive: true },
			async (event: "rename" | "change", filename: string | null) => {
				if (!filename) return;
				
				const filePath = `${srcDir}/${filename}`;
				this.logger.debug(`File changed: ${filePath}`);
				
				// Check if changed file is relevant
				if (this.isRelevantFile(filePath, entryPoints)) {
					const result = await this.build();
					callback(result);
				}
			}
		);

		this.logger.info("Watching for file changes...");
	}

	/**
	 * Stop watch mode
	 */
	stopWatch(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
			this.state.watching = false;
			this.logger.info("Watch mode stopped");
		}
	}

	/**
	 * Analyze bundle size
	 */
	async analyze(): Promise<BundleAnalysis> {
		if (!this.state.lastResult || !this.state.lastResult.success) {
			throw new Error("No successful build to analyze");
		}

		const result = this.state.lastResult;
		const modules: BundleAnalysis["modules"] = [];
		const largeModules: BundleAnalysis["largeModules"] = [];
		const dependencyTree: BundleAnalysis["dependencyTree"] = {};

		// Process outputs for analysis
		for (const output of result.outputs) {
			if (output.type === "js") {
				const percentage = (output.size / result.totalSize) * 100;
				modules.push({
					path: output.path,
					size: output.size,
					percentage,
				});

				// Track large modules (>50KB)
				if (output.size > 50 * 1024) {
					largeModules.push({
						path: output.path,
						size: output.size,
					});
				}

				// Build dependency tree
				if (output.imports) {
					dependencyTree[output.path] = output.imports;
				}
			}
		}

		// Sort modules by size
		modules.sort((a, b) => b.size - a.size);

		// Detect duplicates (simplified)
		const duplicates: BundleAnalysis["duplicates"] = [];
		const moduleOccurrences = new Map<string, number>();

		for (const output of result.outputs) {
			if (output.imports) {
				for (const imp of output.imports) {
					moduleOccurrences.set(imp, (moduleOccurrences.get(imp) || 0) + 1);
				}
			}
		}

		for (const [module, occurrences] of moduleOccurrences) {
			if (occurrences > 1) {
				duplicates.push({
					module,
					occurrences,
					wastedBytes: 0, // Would need metafile analysis for exact size
				});
			}
		}

		return {
			totalSize: result.totalSize,
			modules,
			duplicates,
			largeModules,
			dependencyTree,
		};
	}

	// ============= Private Methods =============

	/**
	 * Collect environment variables with the configured prefix
	 */
	private collectEnvVars(): Record<string, string> {
		const envVars: Record<string, string> = {};
		const prefix = this.config.envPrefix;

		for (const [key, value] of Object.entries(process.env)) {
			if (key.startsWith(prefix) && value !== undefined) {
				envVars[`process.env.${key}`] = JSON.stringify(value);
			}
		}

		return envVars;
	}

	/**
	 * Parse build error from Bun build log
	 */
	private parseBuildError(log: { message: string; position?: { line: number; column: number } | null; file?: string }): BuildError {
		return {
			message: log.message,
			file: log.file,
			line: log.position?.line ?? undefined,
			column: log.position?.column ?? undefined,
		};
	}

	/**
	 * Parse build warning from Bun build log
	 */
	private parseBuildWarning(log: { message: string; position?: { line: number; column: number } | null; file?: string }): BuildWarning {
		return {
			message: log.message,
			file: log.file,
			line: log.position?.line ?? undefined,
			column: log.position?.column ?? undefined,
		};
	}

	/**
	 * Process build outputs from Bun.build result
	 */
	private processBuildOutputs(outputs: Awaited<ReturnType<typeof Bun.build>>["outputs"]): BuildOutput[] {
		return outputs.map((output) => {
			const path = output.path.replace(`${this.config.outDir}/`, "");
			const type = this.getOutputType(output.path);
			const hash = this.extractHash(output.path);

			const buildOutput: BuildOutput = {
				path,
				type,
				size: output.size,
				hash,
			};

			return buildOutput;
		});
	}

	/**
	 * Get output file type
	 */
	private getOutputType(path: string): "js" | "css" | "asset" {
		if (path.endsWith(".js") || path.endsWith(".mjs")) {
			return "js";
		}
		if (path.endsWith(".css")) {
			return "css";
		}
		return "asset";
	}

	/**
	 * Extract content hash from filename
	 */
	private extractHash(path: string): string | undefined {
		const match = path.match(/\.([a-f0-9]{8,})\.(js|css)$/);
		return match ? match[1] : undefined;
	}

	/**
	 * Generate build manifest for SSR integration
	 */
	private async generateManifest(
		buildResult: Awaited<ReturnType<typeof Bun.build>>,
		outputs: BuildOutput[],
		duration: number
	): Promise<BuildManifest> {
		const entryPoints: Record<string, string[]> = {};
		const files: BuildManifest["files"] = {};
		const css: Record<string, string[]> = {};

		// Process entry points
		const entryNames = Array.isArray(this.config.entryPoints)
			? this.config.entryPoints.map((e) => e.split("/").pop()?.replace(/\.[^.]+$/, "") || "main")
			: [this.config.entryPoints.split("/").pop()?.replace(/\.[^.]+$/, "") || "main"];

		for (const name of entryNames) {
			entryPoints[name] = outputs
				.filter((o) => o.type === "js" && (o.entryPoint === name || !o.entryPoint))
				.map((o) => o.path);

			css[name] = outputs
				.filter((o) => o.type === "css")
				.map((o) => o.path);
		}

		// Process all files
		for (const output of outputs) {
			files[output.path] = {
				type: output.type,
				size: output.size,
				hash: output.hash,
				imports: output.imports,
				dynamicImports: output.dynamicImports,
			};
		}

		const manifest: BuildManifest = {
			entryPoints,
			files,
			css,
			timestamp: Date.now(),
			duration,
		};

		// Write manifest to disk
		const manifestPath = `${this.config.outDir}/manifest.json`;
		await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
		this.logger.debug(`Build manifest written to ${manifestPath}`);

		return manifest;
	}

	/**
	 * Check if a file change is relevant to the build
	 */
	private isRelevantFile(filePath: string, entryPoints: string[]): boolean {
		// Check if file is in source directory
		const srcDir = `${this.config.rootDir}/src`;
		if (!filePath.startsWith(srcDir)) {
			return false;
		}

		// Check file extension
		const supportedExtensions = [".ts", ".tsx", ".js", ".jsx", ".css", ".vue", ".svelte"];
		return supportedExtensions.some((ext) => filePath.endsWith(ext));
	}
}

// ============= Factory Function =============

/**
 * Create a bundler instance
 */
export function createBundler(config: PartialBundlerConfig): Bundler {
	return new Bundler(config);
}

// ============= Utility Functions =============

/**
 * Quick build function for simple use cases
 */
export async function build(
	entryPoints: string | string[],
	options?: Partial<Omit<PartialBundlerConfig, "entryPoints">>
): Promise<BuildResult> {
	const bundler = createBundler({
		entryPoints,
		...options,
	});
	return bundler.build();
}