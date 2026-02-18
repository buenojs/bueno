/**
 * Progress Spinner for Bueno CLI
 *
 * Provides animated spinners and progress indicators
 */

import { colors, isColorEnabled } from './console';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL = 80;

export interface SpinnerOptions {
	text?: string;
	color?: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
}

export class Spinner {
	private text: string;
	private color: keyof typeof colors;
	private frameIndex = 0;
	private interval: Timer | null = null;
	private isSpinning = false;
	private stream = process.stdout;

	constructor(options: SpinnerOptions = {}) {
		this.text = options.text ?? '';
		this.color = options.color ?? 'cyan';
	}

	/**
	 * Start the spinner
	 */
	start(text?: string): this {
		if (text) this.text = text;
		if (this.isSpinning) return this;

		this.isSpinning = true;
		this.frameIndex = 0;

		// Hide cursor
		this.stream.write('\x1b[?25l');

		this.interval = setInterval(() => {
			this.render();
		}, SPINNER_INTERVAL);

		return this;
	}

	/**
	 * Update spinner text
	 */
	update(text: string): this {
		this.text = text;
		if (this.isSpinning) {
			this.render();
		}
		return this;
	}

	/**
	 * Stop the spinner with success
	 */
	success(text?: string): this {
		return this.stop(colors.green('✓'), text);
	}

	/**
	 * Stop the spinner with error
	 */
	error(text?: string): this {
		return this.stop(colors.red('✗'), text);
	}

	/**
	 * Stop the spinner with warning
	 */
	warn(text?: string): this {
		return this.stop(colors.yellow('⚠'), text);
	}

	/**
	 * Stop the spinner with info
	 */
	info(text?: string): this {
		return this.stop(colors.cyan('ℹ'), text);
	}

	/**
	 * Stop the spinner
	 */
	stop(symbol?: string, text?: string): this {
		if (!this.isSpinning) return this;

		this.isSpinning = false;

		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}

		// Clear the line
		this.stream.write('\r\x1b[K');

		// Write final message
		const finalText = text ?? this.text;
		if (symbol) {
			this.stream.write(`${symbol} ${finalText}\n`);
		} else {
			this.stream.write(`${finalText}\n`);
		}

		// Show cursor
		this.stream.write('\x1b[?25h');

		return this;
	}

	/**
	 * Clear the spinner
	 */
	clear(): this {
		if (!this.isSpinning) return this;

		this.stream.write('\r\x1b[K');
		return this;
	}

	/**
	 * Render current frame
	 */
	private render(): void {
		if (!isColorEnabled()) {
			// Without colors, just show dots
			const dots = '.'.repeat((this.frameIndex % 3) + 1);
			this.stream.write(`\r${this.text}${dots}   `);
			this.frameIndex++;
			return;
		}

		const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
		const coloredFrame = colors[this.color](frame);

		this.stream.write(`\r${coloredFrame} ${this.text}`);
		this.frameIndex++;
	}
}

/**
 * Create and start a spinner
 */
export function spinner(text: string, options?: Omit<SpinnerOptions, 'text'>): Spinner {
	return new Spinner({ text, ...options }).start();
}

/**
 * Progress bar
 */
export interface ProgressBarOptions {
	total: number;
	width?: number;
	text?: string;
	completeChar?: string;
	incompleteChar?: string;
}

export class ProgressBar {
	private total: number;
	private width: number;
	private text: string;
	private completeChar: string;
	private incompleteChar: string;
	private current = 0;
	private stream = process.stdout;

	constructor(options: ProgressBarOptions) {
		this.total = options.total;
		this.width = options.width ?? 40;
		this.text = options.text ?? '';
		this.completeChar = options.completeChar ?? '█';
		this.incompleteChar = options.incompleteChar ?? '░';
	}

	/**
	 * Start the progress bar
	 */
	start(): this {
		this.current = 0;
		this.render();
		return this;
	}

	/**
	 * Update progress
	 */
	update(current: number): this {
		this.current = Math.min(current, this.total);
		this.render();
		return this;
	}

	/**
	 * Increment progress
	 */
	increment(amount = 1): this {
		return this.update(this.current + amount);
	}

	/**
	 * Complete the progress bar
	 */
	complete(): this {
		this.current = this.total;
		this.render();
		this.stream.write('\n');
		return this;
	}

	/**
	 * Render the progress bar
	 */
	private render(): void {
		const percent = this.current / this.total;
		const completeWidth = Math.round(this.width * percent);
		const incompleteWidth = this.width - completeWidth;

		const complete = this.completeChar.repeat(completeWidth);
		const incomplete = this.incompleteChar.repeat(incompleteWidth);

		const bar = colors.green(complete) + colors.dim(incomplete);
		const percentText = `${Math.round(percent * 100)}%`.padStart(4);

		const line = `\r${this.text} [${bar}] ${percentText} ${this.current}/${this.total}`;

		this.stream.write(`\r\x1b[K${line}`);
	}
}

/**
 * Create a progress bar
 */
export function progressBar(options: ProgressBarOptions): ProgressBar {
	return new ProgressBar(options);
}

/**
 * Task list with progress
 */
export interface TaskOptions {
	text: string;
	task: () => Promise<void>;
}

export async function runTasks(tasks: TaskOptions[]): Promise<void> {
	for (const task of tasks) {
		const s = spinner(task.text);
		try {
			await task.task();
			s.success();
		} catch (error) {
			s.error();
			throw error;
		}
	}
}