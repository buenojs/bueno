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
} from './docker';

// Cloud platform deployment templates
export {
	type DeployPlatform,
	getRenderYamlTemplate,
	getFlyTomlTemplate,
	getRailwayTomlTemplate,
	getDeployTemplate,
	getDeployFilename,
	getDeployPlatformName,
} from './deploy';