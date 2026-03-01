/**
 * Add Frontend Command
 *
 * Add a frontend framework to an existing or new Bueno project
 */

import { cliConsole, colors, printTable } from "../core/console";
import { isInteractive, select } from "../core/prompt";
import { type TaskOptions, runTasks, spinner } from "../core/spinner";
import { CLIError, CLIErrorType } from "../index";
import {
	type FrontendFramework,
	getFrontendOptions,
	getFrontendTemplate,
} from "../templates";
import { createDirectory, fileExists, joinPaths, readFile, writeFile } from "../utils/fs";
import { defineCommand } from "./index";
import type { ParsedArgs } from "../core/args";
import { getOption, hasFlag } from "../core/args";

/**
 * Validate we're in a Bueno project
 */
async function validateBuenoProject(projectPath: string): Promise<boolean> {
	const packageJsonPath = joinPaths(projectPath, "package.json");
	const buenoCofigPath = joinPaths(projectPath, "bueno.config.ts");

	const hasPackageJson = await fileExists(packageJsonPath);
	const hasBuenoConfig = await fileExists(buenoCofigPath);

	return hasPackageJson && hasBuenoConfig;
}

/**
 * Check if client directory exists
 */
async function clientDirExists(projectPath: string): Promise<boolean> {
	return await fileExists(joinPaths(projectPath, "client"));
}

/**
 * Generate Bun bundler config for framework
 */
function getBunBundlerConfig(framework: FrontendFramework): string {
	const configBase = {
		react: {
			entrypoints: ["./src/main.tsx"],
			loaders: {
				".tsx": "tsx",
				".ts": "tsx",
				".css": "file",
				".svg": "file",
			},
		},
		vue: {
			entrypoints: ["./src/main.ts"],
			loaders: {
				".vue": "file",
				".ts": "ts",
				".css": "file",
				".svg": "file",
			},
		},
		svelte: {
			entrypoints: ["./src/main.ts"],
			loaders: {
				".svelte": "file",
				".ts": "ts",
				".css": "file",
				".svg": "file",
			},
		},
		solid: {
			entrypoints: ["./src/main.tsx"],
			loaders: {
				".tsx": "tsx",
				".ts": "tsx",
				".css": "file",
				".svg": "file",
			},
		},
	};

	const config = configBase[framework] || configBase.react;

	return `import type { BunPlugin } from 'bun';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import * as fs from 'fs';
import * as path from 'path';

// PostCSS processor for Tailwind
const postcssPlugin: BunPlugin = {
  name: 'postcss-plugin',
  setup(build) {
    build.onLoad({ filter: /\\.css$/ }, async (args) => {
      const css = fs.readFileSync(args.path, 'utf-8');
      const result = await postcss([tailwindcss, autoprefixer]).process(css, {
        from: args.path,
      });
      return {
        contents: result.css,
        loader: 'text',
      };
    });
  },
};

export const config = {
  entrypoints: [${config.entrypoints.map((e) => `"${e}"`).join(", ")}],
  outdir: "../dist/client",
  minify: true,
  sourcemap: "external",
  loaders: {
${Object.entries(config.loaders)
	.map(([ext, loader]) => `    "${ext}": "${loader}",`)
	.join("\n")}
  },
  plugins: [postcssPlugin],
};
`;
}

/**
 * Generate Tailwind config
 */
function getTailwindConfig(): string {
	return `export default {
  content: [
    "./index.html",
    "./src/**/*.{tsx,ts,jsx,js}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;
}

/**
 * Generate PostCSS config
 */
function getPostCSSConfig(): string {
	return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}

/**
 * Merge package.json dependencies and scripts
 */
async function mergePackageJson(
	projectPath: string,
	newDeps: Record<string, string>,
	newDevDeps: Record<string, string>,
	newScripts: Record<string, string>,
): Promise<void> {
	const packageJsonPath = joinPaths(projectPath, "package.json");
	const content = await readFile(packageJsonPath);
	const packageJson = JSON.parse(content);

	// Merge dependencies
	packageJson.dependencies = {
		...packageJson.dependencies,
		...newDeps,
	};

	// Merge devDependencies
	packageJson.devDependencies = {
		...packageJson.devDependencies,
		...newDevDeps,
	};

	// Merge scripts (preserve existing, add new)
	packageJson.scripts = {
		...packageJson.scripts,
		...newScripts,
	};

	// Write back
	await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
}

/**
 * Handle add frontend command
 */
async function handleAddFrontend(args: ParsedArgs): Promise<void> {
	// Get project path from option or use current directory
	const projectPath = getOption(args, "project-path", {
		name: "project-path",
		type: "string",
		description: "Path to the Bueno project",
	}) as string || process.cwd();

	// Validate we're in a Bueno project
	const isValid = await validateBuenoProject(projectPath);
	if (!isValid) {
		throw new CLIError(
			"Not a Bueno project. Please run this command in a Bueno project directory (must have package.json and bueno.config.ts)",
			CLIErrorType.INVALID_ARGS,
		);
	}

	// Get framework choice (from positional arg or option)
	let framework = (args.positionals[0] ||
		getOption(args, "framework", {
			name: "framework",
			alias: "f",
			type: "string",
			description: "",
		})) as FrontendFramework;

	const skipInstall = hasFlag(args, "skip-install");

	// Interactive prompt if no framework specified
	if (!framework && isInteractive()) {
		framework = await select<FrontendFramework>(
			"Select a frontend framework:",
			getFrontendOptions(),
			{ default: "react" },
		);
	}

	framework = framework || "react";

	// Check if client already exists
	if (await clientDirExists(projectPath)) {
		cliConsole.warn("client/ directory already exists");
		// In a real implementation, we'd prompt to overwrite
		// For now, we'll throw an error
		throw new CLIError(
			"client/ directory already exists. Please remove it first or use a different project.",
			CLIErrorType.FILE_EXISTS,
		);
	}

	// Get frontend template
	const frontendTemplate = getFrontendTemplate(framework);

	// Display info
	cliConsole.header(`Adding ${colors.cyan(framework)} frontend to project`);

	const rows = [
		["Framework", framework],
		["Frontend Directory", "client/"],
		["Include Tailwind CSS", "Yes"],
		["Bundler", "Bun (native)"],
		["Install dependencies", skipInstall ? colors.red("No") : colors.green("Yes")],
	];

	printTable(["Setting", "Value"], rows);
	cliConsole.log("");

	const tasks: TaskOptions[] = [];

	// Create client directory structure
	tasks.push({
		text: "Creating client directory structure",
		task: async () => {
			await createDirectory(joinPaths(projectPath, "client", "src", "components"));
			await createDirectory(joinPaths(projectPath, "client", "src", "styles"));
			await createDirectory(joinPaths(projectPath, "client", "public"));

			// Create template-specific directories
			for (const dir of frontendTemplate.directories) {
				// Strip 'client/' prefix if present in directory path
				const dirPath = dir.startsWith("client/") ? dir.slice(7) : dir;
				await createDirectory(joinPaths(projectPath, "client", dirPath));
			}
		},
	});

	// Create client files
	for (const file of frontendTemplate.files) {
		tasks.push({
			text: `Creating ${file.path}`,
			task: async () => {
				// Strip 'client/' prefix if present in file path
				const filePath = file.path.startsWith("client/")
					? file.path.slice(7)
					: file.path;
				await writeFile(joinPaths(projectPath, "client", filePath), file.content);
			},
		});
	}

	// Create Bun bundler config
	tasks.push({
		text: "Creating Bun bundler configuration",
		task: async () => {
			const bundlerConfig = getBunBundlerConfig(framework);
			await writeFile(joinPaths(projectPath, "client", "bun.bundler.ts"), bundlerConfig);
		},
	});

	// Create Tailwind config
	tasks.push({
		text: "Creating Tailwind CSS configuration",
		task: async () => {
			const tailwindConfig = getTailwindConfig();
			await writeFile(joinPaths(projectPath, "client", "tailwind.config.ts"), tailwindConfig);
		},
	});

	// Create PostCSS config
	tasks.push({
		text: "Creating PostCSS configuration",
		task: async () => {
			const postCSSConfig = getPostCSSConfig();
			await writeFile(joinPaths(projectPath, "client", "postcss.config.js"), postCSSConfig);
		},
	});

	// Create TypeScript config for client
	tasks.push({
		text: "Creating client TypeScript configuration",
		task: async () => {
			const tsConfig = JSON.stringify(
				{
					extends: "../tsconfig.json",
					compilerOptions: {
						jsx: framework === "solid" ? "preserve" : "react-jsx",
						jsxImportSource: framework === "solid" ? "solid-js" : "react",
					},
					include: ["src/**/*"],
				},
				null,
				2,
			);
			await writeFile(joinPaths(projectPath, "client", "tsconfig.json"), tsConfig);
		},
	});

	// Update package.json with frontend deps and scripts
	tasks.push({
		text: "Updating package.json with frontend dependencies and scripts",
		task: async () => {
			const newDeps = frontendTemplate.dependencies || {};
			const newDevDeps = {
				...frontendTemplate.devDependencies,
				concurrently: "^8.2.0", // Add concurrently for running server + client
			};

			const entryFile = framework === "react" || framework === "solid" ? ".tsx" : ".ts";
			const newScripts = {
				"dev:server": "bun run --watch server/main.ts",
				"dev:client": `bun build client/src/main${entryFile} --watch --outdir ./dist/client 2>&1 | grep -v "invalid @ rule"`,
				"dev": "concurrently 'bun run dev:server' 'bun run dev:client'",
				"build:client": `bun build client/src/main${entryFile} --outdir ./dist/client --minify 2>&1 | grep -v "invalid @ rule"`,
			};

			await mergePackageJson(projectPath, newDeps, newDevDeps, newScripts);
		},
	});

	// Run all tasks
	await runTasks(tasks);

	// Install dependencies
	if (!skipInstall) {
		cliConsole.subheader("Installing dependencies...");
		const installSpinner = spinner("Running bun install...");

		try {
			const proc = Bun.spawn(["bun", "install"], {
				cwd: projectPath,
				stdout: "pipe",
				stderr: "pipe",
			});

			const exitCode = await proc.exited;

			if (exitCode === 0) {
				installSpinner.success("Dependencies installed");
			} else {
				installSpinner.warn("Failed to install dependencies. Run `bun install` manually.");
			}
		} catch {
			installSpinner.warn("Failed to install dependencies. Run `bun install` manually.");
		}
	}

	// Success message
	cliConsole.log("");
	const frameworkName = framework.charAt(0).toUpperCase() + framework.slice(1);
	cliConsole.success(`${colors.cyan(frameworkName)} frontend added successfully!`);
	cliConsole.log("");
	cliConsole.log("Next steps:");
	cliConsole.log("  Terminal 1: bun run dev:server");
	cliConsole.log("  Terminal 2: bun run dev:client");
	cliConsole.log("");
	cliConsole.log("  Or run both together:");
	cliConsole.log("  bun run dev");
	cliConsole.log("");
}

// Register the command
defineCommand(
	{
		name: "add:frontend",
		description: "Add a frontend framework to your Bueno project",
		positionals: [
			{
				name: "framework",
				required: false,
				description: "Frontend framework (react, vue, svelte, solid)",
			},
		],
		options: [
			{
				name: "framework",
				alias: "f",
				type: "string",
				description: "Frontend framework (react, vue, svelte, solid)",
			},
			{
				name: "skip-install",
				type: "boolean",
				default: false,
				description: "Skip dependency installation",
			},
			{
				name: "project-path",
				type: "string",
				description: "Path to the Bueno project (internal use)",
			},
		],
		examples: [
			"bueno add:frontend",
			"bueno add:frontend react",
			"bueno add:frontend vue",
			"bueno add:frontend svelte",
			"bueno add:frontend solid",
			"bueno add:frontend react --skip-install",
		],
	},
	handleAddFrontend,
);
