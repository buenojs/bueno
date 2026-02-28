/**
 * Project Templates
 *
 * Project template registry and exports
 */

// Re-export types
export type {
	ProjectTemplate,
	ProjectConfig,
	ProjectTemplateResult,
	FrontendFramework,
	DatabaseDriver,
	TemplateFile,
	SelectOption,
} from "./types";

import { apiTemplate } from "./api";
import { defaultTemplate } from "./default";
import { fullstackTemplate } from "./fullstack";
import { minimalTemplate } from "./minimal";
import type {
	ProjectConfig,
	ProjectTemplate,
	ProjectTemplateResult,
} from "./types";
import { websiteTemplate } from "./website";

/**
 * Project template registry
 */
const projectTemplates: Record<
	ProjectTemplate,
	(config: ProjectConfig) => ProjectTemplateResult
> = {
	default: defaultTemplate,
	minimal: minimalTemplate,
	fullstack: fullstackTemplate,
	api: apiTemplate,
	website: websiteTemplate,
};

/**
 * Get project template based on template type
 */
export function getProjectTemplate(
	template: ProjectTemplate,
): (config: ProjectConfig) => ProjectTemplateResult {
	return projectTemplates[template];
}

/**
 * Get template selection options for prompts
 */
export function getTemplateOptions(): {
	value: ProjectTemplate;
	name: string;
	description: string;
}[] {
	return [
		{
			value: "default",
			name: "Default",
			description: "Standard project with modules and database",
		},
		{
			value: "minimal",
			name: "Minimal",
			description: "Bare minimum project structure",
		},
		{
			value: "fullstack",
			name: "Fullstack",
			description: "Full-stack project with SSR and frontend",
		},
		{
			value: "api",
			name: "API",
			description: "API-only project without frontend",
		},
		{
			value: "website",
			name: "Website",
			description: "Static website with SSG",
		},
	];
}

export {
	defaultTemplate,
	minimalTemplate,
	fullstackTemplate,
	apiTemplate,
	websiteTemplate,
};
