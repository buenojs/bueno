/**
 * Core CLI Utilities
 *
 * Re-exports all core CLI utilities for convenient importing
 */

export {
	parseArgs,
	getOption,
	hasFlag,
	hasOption,
	generateHelpText,
	generateGlobalHelpText,
	type ParsedArgs,
	type OptionDefinition,
	type CommandDefinition,
} from './args';

export {
	setColorEnabled,
	isColorEnabled,
	colors,
	cliConsole,
	formatTable,
	printTable,
	formatList,
	printList,
	formatTree,
	printTree,
	formatSize,
	formatDuration,
	formatPath,
	highlightCode,
	type TreeNode,
} from './console';

export {
	isInteractive,
	prompt,
	confirm,
	select,
	multiSelect,
	number,
	password,
	type PromptOptions,
	type SelectOptions,
	type ConfirmOptions,
	type MultiSelectOptions,
} from './prompt';

export {
	Spinner,
	spinner,
	ProgressBar,
	progressBar,
	runTasks,
	type SpinnerOptions,
	type ProgressBarOptions,
	type TaskOptions,
} from './spinner';