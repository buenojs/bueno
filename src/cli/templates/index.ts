/**
 * CLI Templates
 *
 * Export all template functions for project scaffolding
 */

// Docker templates
export {
	getDockerfileTemplate,
	getDockerignoreTemplate,
	getDockerComposeTemplate,
	getDockerEnvTemplate,
} from "./docker";

// Cloud platform deployment templates
export {
	type DeployPlatform,
	getRenderYamlTemplate,
	getFlyTomlTemplate,
	getRailwayTomlTemplate,
	getDeployTemplate,
	getDeployFilename,
	getDeployPlatformName,
} from "./deploy";

// Project templates
export {
	type ProjectTemplate,
	type ProjectConfig,
	type FrontendFramework,
	type DatabaseDriver,
	getProjectTemplate,
	getTemplateOptions,
} from "./project";

// Database templates
export {
	getDatabaseTemplate,
	getDatabaseOptions,
} from "./database";

// Frontend templates
export {
	getFrontendTemplate,
	getFrontendOptions,
} from "./frontend";

// Generator templates
export {
	type GeneratorType,
	type GeneratorConfig,
	GENERATOR_ALIASES,
	getGeneratorTemplate,
	getGeneratorTypes,
	getDefaultDirectory,
	getFileExtension,
} from "./generators";
