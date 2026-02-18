/**
 * Storage Layer
 *
 * Unified interface over Bun.s3 for S3-compatible storage with local filesystem fallback.
 * Uses Bun 1.3+ native S3 client for cloud storage.
 */

// ============= Types =============

export interface StorageConfig {
	driver?: "s3" | "local";
	bucket?: string;
	region?: string;
	endpoint?: string;
	localPath?: string;
}

export interface UploadOptions {
	key: string;
	body: string | Buffer | ArrayBuffer | Blob | File;
	contentType?: string;
}

export interface DownloadOptions {
	key: string;
}

export interface PresignedURLOptions {
	key: string;
	expiresIn?: number;
	method?: "GET" | "PUT";
}

export interface FileInfo {
	key: string;
	size: number;
	lastModified?: Date;
}

export interface ListOptions {
	prefix?: string;
}

export interface ListResult {
	files: FileInfo[];
	directories: string[];
}

// ============= Local Storage (Fallback) =============

class LocalStorage {
	private basePath: string;

	constructor(basePath: string) {
		this.basePath = basePath;
	}

	private getFilePath(key: string): string {
		const sanitized = key.replace(/\.\./g, "").replace(/^\/+/, "");
		return `${this.basePath}/${sanitized}`;
	}

	async upload(options: UploadOptions): Promise<{ key: string }> {
		const filePath = this.getFilePath(options.key);

		const dir = filePath.substring(0, filePath.lastIndexOf("/"));
		await Bun.$`mkdir -p ${dir}`.quiet().catch(() => {});

		// Convert body to appropriate type for Bun.write
		if (typeof options.body === "string") {
			await Bun.write(filePath, options.body);
		} else if (options.body instanceof File) {
			await Bun.write(filePath, await options.body.arrayBuffer());
		} else if (options.body instanceof Blob) {
			await Bun.write(filePath, await options.body.arrayBuffer());
		} else {
			await Bun.write(filePath, options.body);
		}

		return { key: options.key };
	}

	async download(options: DownloadOptions): Promise<Blob> {
		const filePath = this.getFilePath(options.key);
		const file = Bun.file(filePath);

		if (!(await file.exists())) {
			throw new Error(`File not found: ${options.key}`);
		}

		return file;
	}

	async delete(key: string): Promise<void> {
		const filePath = this.getFilePath(key);
		await Bun.$`rm -f ${filePath}`.quiet().catch(() => {});
	}

	async exists(key: string): Promise<boolean> {
		const filePath = this.getFilePath(key);
		return Bun.file(filePath).exists();
	}

	async info(key: string): Promise<FileInfo | null> {
		const filePath = this.getFilePath(key);
		const file = Bun.file(filePath);

		if (!(await file.exists())) {
			return null;
		}

		const stat = await file.stat();

		return {
			key,
			size: stat?.size ?? 0,
			lastModified: stat?.mtime ? new Date(stat.mtime) : undefined,
		};
	}

	async list(options: ListOptions): Promise<ListResult> {
		const prefix = options.prefix ?? "";
		const dirPath = this.getFilePath(prefix);

		const files: FileInfo[] = [];
		const directories: string[] = [];

		try {
			const glob = new Bun.Glob("**/*");
			const baseDir = dirPath || this.basePath;

			for await (const file of glob.scan(baseDir)) {
				const fullPath = `${baseDir}/${file}`;
				const stat = await Bun.file(fullPath).stat();

				if (stat && !stat.isDirectory()) {
					files.push({
						key: `${prefix}${file}`,
						size: stat.size,
						lastModified: stat.mtime ? new Date(stat.mtime) : undefined,
					});
				} else if (stat?.isDirectory()) {
					directories.push(`${prefix}${file}/`);
				}
			}
		} catch {
			// Directory doesn't exist
		}

		return { files, directories };
	}

	getPublicUrl(key: string): string {
		return `/storage/${key}`;
	}
}

// ============= S3 Storage (Bun.s3 Native) =============

class S3Storage {
	private config: StorageConfig;

	constructor(config: StorageConfig) {
		this.config = config;
	}

	/**
	 * Get S3 file reference using Bun.s3
	 */
	private getFile(key: string): Bun.S3File {
		return Bun.s3.file(key, {
			bucket: this.config.bucket,
			region: this.config.region,
			endpoint: this.config.endpoint,
		});
	}

	async upload(options: UploadOptions): Promise<{ key: string }> {
		const file = this.getFile(options.key);

		// Bun.s3 supports write via Bun.write on S3File
		if (typeof options.body === "string") {
			await file.write(options.body);
		} else if (options.body instanceof File) {
			await file.write(await options.body.arrayBuffer());
		} else if (options.body instanceof Blob) {
			await file.write(await options.body.arrayBuffer());
		} else {
			await file.write(options.body);
		}

		return { key: options.key };
	}

	async download(options: DownloadOptions): Promise<Blob> {
		const file = this.getFile(options.key);

		if (!(await file.exists())) {
			throw new Error(`File not found: ${options.key}`);
		}

		return file;
	}

	async delete(key: string): Promise<void> {
		const file = this.getFile(key);
		await file.delete();
	}

	async exists(key: string): Promise<boolean> {
		const file = this.getFile(key);
		return file.exists();
	}

	async info(key: string): Promise<FileInfo | null> {
		const file = this.getFile(key);

		if (!(await file.exists())) {
			return null;
		}

		return {
			key,
			size: 0,
			lastModified: undefined,
		};
	}

	async list(options: ListOptions): Promise<ListResult> {
		// S3 list not directly supported by Bun.s3 yet
		console.warn("S3 list operation not yet supported");
		return { files: [], directories: [] };
	}

	getPresignedUrl(options: PresignedURLOptions): string {
		const file = this.getFile(options.key);
		return file.presign({
			expiresIn: options.expiresIn ?? 3600,
		});
	}

	getPublicUrl(key: string): string {
		const region = this.config.region ?? "us-east-1";
		const endpoint =
			this.config.endpoint ?? `https://s3.${region}.amazonaws.com`;
		const bucket = this.config.bucket!;
		return `${endpoint}/${bucket}/${key}`;
	}
}

// ============= Storage Class =============

export class Storage {
	private driver: "s3" | "local";
	private s3Storage: S3Storage | null = null;
	private localStorage: LocalStorage | null = null;
	private _isConnected = false;

	constructor(config: StorageConfig = {}) {
		this.driver = config.driver ?? "local";

		if (this.driver === "s3") {
			this.s3Storage = new S3Storage(config);
		} else {
			this.localStorage = new LocalStorage(config.localPath ?? "./storage");
		}
	}

	async connect(): Promise<void> {
		this._isConnected = true;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	getDriver(): "s3" | "local" {
		return this.driver;
	}

	async upload(options: UploadOptions): Promise<{ key: string }> {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.upload(options);
		}
		if (!this.localStorage) {
			throw new Error("Local storage not initialized");
		}
		return this.localStorage.upload(options);
	}

	async download(options: DownloadOptions): Promise<Blob> {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.download(options);
		}
		if (!this.localStorage) {
			throw new Error("Local storage not initialized");
		}
		return this.localStorage.download(options);
	}

	async downloadText(key: string): Promise<string> {
		const blob = await this.download({ key });
		return blob.text();
	}

	async downloadBuffer(key: string): Promise<ArrayBuffer> {
		const blob = await this.download({ key });
		return blob.arrayBuffer();
	}

	async stream(key: string): Promise<ReadableStream<Uint8Array>> {
		const blob = await this.download({ key });
		return blob.stream();
	}

	async delete(key: string): Promise<void> {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.delete(key);
		}
		return this.localStorage?.delete(key);
	}

	async deleteMany(keys: string[]): Promise<void> {
		await Promise.all(keys.map((key) => this.delete(key)));
	}

	async exists(key: string): Promise<boolean> {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.exists(key);
		}
		if (!this.localStorage) {
			throw new Error("Local storage not initialized");
		}
		return this.localStorage.exists(key);
	}

	async info(key: string): Promise<FileInfo | null> {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.info(key);
		}
		if (!this.localStorage) {
			throw new Error("Local storage not initialized");
		}
		return this.localStorage.info(key);
	}

	async copy(sourceKey: string, destKey: string): Promise<void> {
		const blob = await this.download({ key: sourceKey });
		await this.upload({ key: destKey, body: blob });
	}

	async move(sourceKey: string, destKey: string): Promise<void> {
		await this.copy(sourceKey, destKey);
		await this.delete(sourceKey);
	}

	async list(options?: ListOptions): Promise<ListResult> {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.list(options ?? {});
		}
		if (!this.localStorage) {
			throw new Error("Local storage not initialized");
		}
		return this.localStorage.list(options ?? {});
	}

	getPresignedUrl(options: PresignedURLOptions): string {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.getPresignedUrl(options);
		}
		throw new Error("Presigned URLs are only available for S3 storage");
	}

	getPublicUrl(key: string): string {
		if (this.driver === "s3" && this.s3Storage) {
			return this.s3Storage.getPublicUrl(key);
		}
		if (!this.localStorage) {
			throw new Error("Local storage not initialized");
		}
		return this.localStorage.getPublicUrl(key);
	}

	async uploadFile(localPath: string, key: string): Promise<{ key: string }> {
		const file = Bun.file(localPath);
		const arrayBuffer = await file.arrayBuffer();
		return this.upload({
			key,
			body: arrayBuffer,
			contentType: file.type,
		});
	}
}

// ============= Secrets Wrapper (Bun.secrets) =============

export interface SecretOptions {
	service: string;
	name: string;
}

export interface SetSecretOptions extends SecretOptions {
	value: string;
	allowUnrestrictedAccess?: boolean;
}

export const Secrets = {
	/**
	 * Get a secret from OS credential storage
	 */
	async get(options: SecretOptions): Promise<string | null> {
		return Bun.secrets.get(options);
	},

	/**
	 * Store a secret in OS credential storage
	 */
	async set(options: SetSecretOptions): Promise<void> {
		await Bun.secrets.set(options);
	},

	/**
	 * Delete a secret from OS credential storage
	 */
	async delete(options: SecretOptions): Promise<void> {
		await Bun.secrets.delete(options);
	},

	/**
	 * Get a secret or throw if not found
	 */
	async getOrThrow(options: SecretOptions): Promise<string> {
		const value = await this.get(options);
		if (!value) {
			throw new Error(`Secret not found: ${options.service}/${options.name}`);
		}
		return value;
	},

	/**
	 * Get a secret or use a default value
	 */
	async getOrDefault(
		options: SecretOptions,
		defaultValue: string,
	): Promise<string> {
		const value = await this.get(options);
		return value ?? defaultValue;
	},
};

// ============= Factory Functions =============

export function createStorage(config?: StorageConfig): Storage {
	return new Storage(config);
}
