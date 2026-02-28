/**
 * GraphQL Subscription Handler
 *
 * Implements the graphql-transport-ws protocol over Bun's native WebSocket.
 * Registered via app.setWebSocketHandler() so subscriptions run on the same
 * port as the HTTP server — no separate port needed.
 *
 * Protocol spec: https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md
 *
 * ## Usage
 * Automatically configured by GraphQLModule.setup() when subscriptions: true.
 * Requires an engine with supportsSubscriptions = true (e.g. GraphQLJsAdapter).
 */

import type { GraphQLEngine, GraphQLContext, ResolvedSchema } from "./types";
import type { Container } from "../container";
import type { Guard, Interceptor } from "./execution-pipeline";
import { buildGraphQLContext } from "./context-builder";

// ============= Protocol Message Types =============

interface ConnectionInitMessage {
	type: "connection_init";
	payload?: Record<string, unknown>;
}
interface ConnectionAckMessage {
	type: "connection_ack";
}
interface SubscribeMessage {
	type: "subscribe";
	id: string;
	payload: {
		query: string;
		variables?: Record<string, unknown>;
		operationName?: string;
	};
}
interface NextMessage {
	type: "next";
	id: string;
	payload: { data?: unknown; errors?: unknown[] };
}
interface ErrorMessage {
	type: "error";
	id: string;
	payload: Array<{ message: string }>;
}
interface CompleteMessage {
	type: "complete";
	id?: string;
}

type ServerMessage = ConnectionAckMessage | NextMessage | ErrorMessage | CompleteMessage;
type ClientMessage = ConnectionInitMessage | SubscribeMessage | CompleteMessage;

// ============= Connection State =============

interface SubscriptionState {
	generator: AsyncGenerator<unknown>;
}

interface ConnectionState {
	subscriptions: Map<string, SubscriptionState>;
	initialized: boolean;
}

// ============= WebSocket Data =============

interface WsData {
	connectionId: string;
}

// ============= Subscription Handler =============

export class SubscriptionHandler {
	private connections = new Map<string, ConnectionState>();

	constructor(
		private engine: GraphQLEngine,
		private engineSchema: unknown,
		private graphqlPath: string,
		private container: Container,
		private globalGuards: Guard[],
		private globalInterceptors: Interceptor[],
	) {}

	/**
	 * Returns a Bun WebSocketHandler to register on the server via app.setWebSocketHandler().
	 * Attaches an __upgradeHandler so Application.listen() can delegate WebSocket upgrades.
	 */
	getWebSocketConfig(): Bun.WebSocketHandler<WsData> & { __upgradeHandler: (req: Request, srv: Bun.Server) => Response | undefined } {
		const upgradeHandler = this.handleUpgrade.bind(this);
		return {
			__upgradeHandler: upgradeHandler,
			open: (ws) => {
				this.connections.set(ws.data.connectionId, {
					subscriptions: new Map(),
					initialized: false,
				});
			},

			message: async (ws, raw) => {
				try {
					const text =
						typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
					const msg = JSON.parse(text) as ClientMessage;
					await this.handleMessage(ws, msg);
				} catch (err) {
					this.send(ws, {
						type: "error",
						id: "",
						payload: [{ message: `Protocol error: ${(err as Error).message}` }],
					});
				}
			},

			close: (ws) => {
				const state = this.connections.get(ws.data.connectionId);
				if (state) {
					// Cancel all active subscriptions
					for (const sub of state.subscriptions.values()) {
						sub.generator.return?.(undefined);
					}
					this.connections.delete(ws.data.connectionId);
				}
			},

			error: (ws, error) => {
				console.error("[GraphQL WS] WebSocket error:", error);
			},
		};
	}

	/**
	 * Middleware-like upgrade handler.
	 * Call this from the app's fetch function for WebSocket upgrade requests.
	 * Returns a Response if not a GraphQL WS path, undefined if upgraded.
	 */
	handleUpgrade(req: Request, server: Bun.Server): Response | undefined {
		const url = new URL(req.url);
		if (url.pathname !== this.graphqlPath) {
			return undefined; // Not our path — let normal routing handle it
		}

		const protocol = req.headers.get("sec-websocket-protocol") ?? "";
		if (!protocol.includes("graphql-transport-ws")) {
			return new Response("Unsupported WebSocket protocol", { status: 426 });
		}

		const connectionId = crypto.randomUUID();
		const upgraded = server.upgrade<WsData>(req, {
			headers: {
				"Sec-WebSocket-Protocol": "graphql-transport-ws",
			},
			data: { connectionId },
		});

		return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
	}

	// ============= Message Handlers =============

	private async handleMessage(
		ws: Bun.ServerWebSocket<WsData>,
		msg: ClientMessage,
	): Promise<void> {
		const state = this.connections.get(ws.data.connectionId);
		if (!state) return;

		switch (msg.type) {
			case "connection_init":
				if (state.initialized) {
					// Already initialized — send error and close
					ws.close(4429, "Too many initialisation requests");
					return;
				}
				state.initialized = true;
				this.send(ws, { type: "connection_ack" });
				break;

			case "subscribe":
				if (!state.initialized) {
					ws.close(4401, "Unauthorized: connection not initialized");
					return;
				}
				if (state.subscriptions.has(msg.id)) {
					ws.close(4409, `Subscriber for ${msg.id} already exists`);
					return;
				}
				await this.handleSubscribe(ws, state, msg);
				break;

			case "complete":
				if (msg.id) {
					const sub = state.subscriptions.get(msg.id);
					if (sub) {
						sub.generator.return?.(undefined);
						state.subscriptions.delete(msg.id);
					}
				}
				break;
		}
	}

	private async handleSubscribe(
		ws: Bun.ServerWebSocket<WsData>,
		state: ConnectionState,
		msg: SubscribeMessage,
	): Promise<void> {
		if (!this.engine.subscribe) {
			this.send(ws, {
				type: "error",
				id: msg.id,
				payload: [
					{
						message:
							"Subscriptions are not supported by the configured GraphQL engine. " +
							"Use GraphQLJsAdapter for subscription support.",
					},
				],
			});
			return;
		}

		const context: GraphQLContext = {
			request: new Request(`ws://localhost${this.graphqlPath}`),
			user: undefined,
			httpContext: null,
		};

		let generator: AsyncGenerator<unknown>;
		try {
			generator = await this.engine.subscribe(
				this.engineSchema,
				msg.payload.query,
				msg.payload.variables ?? {},
				context,
				msg.payload.operationName,
			);
		} catch (err) {
			this.send(ws, {
				type: "error",
				id: msg.id,
				payload: [{ message: (err as Error).message }],
			});
			return;
		}

		state.subscriptions.set(msg.id, { generator });

		// Stream results
		(async () => {
			try {
				for await (const result of generator) {
					if (!state.subscriptions.has(msg.id)) break; // Cancelled
					this.send(ws, {
						type: "next",
						id: msg.id,
						payload: result as { data?: unknown; errors?: unknown[] },
					});
				}
				// Subscription completed
				this.send(ws, { type: "complete", id: msg.id });
				state.subscriptions.delete(msg.id);
			} catch (err) {
				this.send(ws, {
					type: "error",
					id: msg.id,
					payload: [{ message: (err as Error).message }],
				});
				state.subscriptions.delete(msg.id);
			}
		})();
	}

	private send(ws: Bun.ServerWebSocket<WsData>, msg: ServerMessage): void {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// Connection may have closed — ignore
		}
	}
}
