/**
 * Type declarations for optional peer dependencies
 * 
 * These modules are optional peer dependencies for SSR rendering.
 * Users need to install them separately if they want to use SSR features.
 */

// React types
declare module "react" {
  export type ReactElement = {
    type: unknown;
    props: Record<string, unknown>;
    key: string | number | null;
  };
  
  export type ReactNode = ReactElement | string | number | boolean | null | undefined | Iterable<ReactNode>;
  
  export function createElement(
    type: string | ((props: unknown) => ReactElement),
    props?: Record<string, unknown> | null,
    ...children: ReactNode[]
  ): ReactElement;
  
  export const Suspense: {
    (props: { fallback?: ReactNode; children?: ReactNode }): ReactElement;
  };
  
  export const Fragment: unique symbol;
  
  export function useState<T>(initialState: T): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useContext<T>(context: ReactContext<T>): T;
  export function createContext<T>(defaultValue: T): ReactContext<T>;
  export function useRef<T>(initialValue: T): { current: T };
  export function useMemo<T>(factory: () => T, deps?: unknown[]): T;
  export function useCallback<T extends (...args: unknown[]) => unknown>(callback: T, deps?: unknown[]): T;
  export function useReducer<S, A>(reducer: (state: S, action: A) => S, initialArg: S): [S, (action: A) => void];
  
  export interface ReactContext<T> {
    Provider: (props: { value: T; children?: ReactNode }) => ReactElement;
    Consumer: (props: { children: (value: T) => ReactNode }) => ReactElement;
    displayName?: string;
  }
  
  export const version: string;
  export default { createElement, Suspense, Fragment, useState, useEffect, useContext, createContext, useRef, useMemo, useCallback, useReducer, version };
}

declare module "react-dom/server" {
  import { ReactElement } from "react";
  
  export function renderToString(element: ReactElement): string;
  export function renderToStaticMarkup(element: ReactElement): string;
  export function renderToPipeableStream(element: ReactElement, options?: {
    bootstrapScripts?: string[];
    bootstrapModules?: string[];
    identifierPrefix?: string;
    namespaceURI?: string;
    nonce?: string;
    onAllReady?: () => void;
    onError?: (error: Error) => void;
    onShellReady?: () => void;
    onShellError?: (error: Error) => void;
  }): { pipe: (destination: unknown) => void; abort: () => void };
  
  export function renderToReadableStream(element: ReactElement, options?: {
    bootstrapScripts?: string[];
    bootstrapModules?: string[];
    identifierPrefix?: string;
    namespaceURI?: string;
    nonce?: string;
    onError?: (error: Error) => void;
  }): Promise<ReadableStream<Uint8Array> & { allReady: Promise<void> }>;
}

// SolidJS types
declare module "solid-js" {
  export type Accessor<T> = () => T;
  export type Setter<T> = (value: T | ((prev: T) => T)) => void;
  export type Signal<T> = [Accessor<T>, Setter<T>];
  
  export function createSignal<T>(value: T, options?: { equals?: boolean | ((prev: T, next: T) => boolean) }): Signal<T>;
  export function createEffect(fn: () => void | (() => void)): void;
  export function createMemo<T>(fn: () => T, value?: T, options?: { equals?: boolean | ((prev: T, next: T) => boolean) }): Accessor<T>;
  export function onMount(fn: () => void): void;
  export function onCleanup(fn: () => void): void;
  export function onError(fn: (err: Error) => void): void;
  
  export function untrack<T>(fn: () => T): T;
  export function batch<T>(fn: () => T): T;
  
  export function For<T>(props: { each: T[]; fallback?: unknown; children: (item: T, index: Accessor<number>) => unknown }): unknown;
  export function Show(props: { when: unknown; keyed?: boolean; fallback?: unknown; children: unknown }): unknown;
  export function Switch(props: { fallback?: unknown; children: unknown }): unknown;
  export function Match(props: { when: unknown; keyed?: boolean; children: unknown }): unknown;
  export function Index<T>(props: { each: T[]; fallback?: unknown; children: (item: Accessor<T>, index: number) => unknown }): unknown;
  
  export function children(fn: () => unknown): Accessor<unknown>;
  export function mergeProps<T extends object>(...sources: T[]): T;
  export function splitProps<T extends object>(props: T, ...keys: (keyof T)[][]): T[];
  
  export const Suspense: (props: { fallback?: unknown; children?: unknown }) => unknown;
  
  export interface JSX {
    Element: unknown;
    IntrinsicElements: Record<string, unknown>;
  }
}

declare module "solid-js/web" {
  export function renderToString(code: () => unknown, options?: { nonce?: string; renderId?: string }): string;
  export function renderToStringAsync(code: () => unknown, options?: { timeoutMs?: number; nonce?: string; renderId?: string }): Promise<string>;
  export function renderToStream(code: () => unknown, options?: { nonce?: string; renderId?: string }): ReadableStream<Uint8Array>;
  export function hydrate(code: () => unknown, element: Element): void;
  export function Dynamic(props: { component: unknown; [key: string]: unknown }): unknown;
  export function Portal(props: { mount?: Element; useShadow?: boolean; children: unknown }): unknown;
  export function Assets(props: { children: unknown }): unknown;
  export function HydrationScript(props?: { nonce?: string }): unknown;
}

// Svelte types
declare module "svelte/server" {
  export interface SvelteComponent {
    render(props?: Record<string, unknown>): { html: string; head: string; css: { code: string } };
  }
  
  export function render(component: typeof SvelteComponent, options?: { props?: Record<string, unknown> }): { html: string; head: string; css: { code: string } };
}

// Vue types
declare module "vue" {
  export type Component = unknown;
  
  export function createApp(rootComponent: Component, rootProps?: Record<string, unknown>): {
    mount(rootContainer: Element | string): unknown;
    unmount(): void;
    provide<T>(key: string | symbol, value: T): void;
    component(name: string, component: Component): void;
    directive(name: string, directive: unknown): void;
    use(plugin: unknown, ...options: unknown[]): void;
  };
  
  export function createSSRApp(rootComponent: Component, rootProps?: Record<string, unknown>): ReturnType<typeof createApp>;
  
  export function defineComponent(options: {
    name?: string;
    props?: Record<string, unknown>;
    setup?: (props: Record<string, unknown>, ctx: unknown) => unknown;
    render?: (ctx: unknown) => unknown;
    template?: string;
    components?: Record<string, Component>;
    directives?: Record<string, unknown>;
    data?: () => Record<string, unknown>;
    computed?: Record<string, (this: unknown) => unknown>;
    methods?: Record<string, (this: unknown, ...args: unknown[]) => unknown>;
    watch?: Record<string, unknown>;
    emits?: string[] | Record<string, unknown>;
    [key: string]: unknown;
  }): Component;
  
  export function ref<T>(value: T): { value: T };
  export function reactive<T extends object>(obj: T): T;
  export function computed<T>(fn: () => T): { readonly value: T };
  export function watch(source: unknown, callback: (value: unknown, oldValue: unknown, onCleanup: (fn: () => void) => void) => void, options?: { immediate?: boolean; deep?: boolean }): () => void;
  export function watchEffect(fn: (onCleanup: (fn: () => void) => void) => void): () => void;
  export function onMounted(fn: () => void): void;
  export function onUnmounted(fn: () => void): void;
  export function onServerPrefetch(fn: () => Promise<void>): void;
  
  export function h(type: string | Component, props?: Record<string, unknown> | null, children?: unknown): unknown;
  export function defineAsyncComponent(loader: () => Promise<{ default: Component }>): Component;
  export function provide(key: string | symbol, value: unknown): void;
  export function inject<T>(key: string | symbol, defaultValue?: T): T | undefined;
  export function useSSRContext(): Record<string, unknown>;
  
  export const version: string;
}

declare module "vue/server-renderer" {
  export function renderToString(app: unknown, options?: { context?: Record<string, unknown> }): Promise<string>;
  export function renderToStream(app: unknown, options?: { context?: Record<string, unknown> }): ReadableStream<Uint8Array>;
  export function renderToWebStream(app: unknown, options?: { context?: Record<string, unknown> }): ReadableStream<Uint8Array>;
  export function renderToNodeStream(app: unknown, options?: { context?: Record<string, unknown> }): NodeJS.ReadableStream;
}

declare module "vue-router" {
  import { Component } from "vue";
  
  export interface RouteRecordRaw {
    path: string;
    name?: string;
    component?: Component;
    components?: Record<string, Component>;
    redirect?: string | ((to: unknown) => string);
    alias?: string | string[];
    children?: RouteRecordRaw[];
    meta?: Record<string, unknown>;
    beforeEnter?: (to: unknown, from: unknown, next: () => void) => void;
    props?: boolean | Record<string, unknown> | ((to: unknown) => Record<string, unknown>);
  }
  
  export interface Router {
    isReady(): Promise<void>;
    push(to: string | { path: string; query?: Record<string, string>; params?: Record<string, string> }): void;
    replace(to: string | { path: string; query?: Record<string, string>; params?: Record<string, string> }): void;
    go(delta: number): void;
    back(): void;
    forward(): void;
    beforeEach(guard: (to: unknown, from: unknown, next: () => void) => void): () => void;
    currentRoute: { path: string; params: Record<string, string>; query: Record<string, string>; name: string | symbol | null };
  }
  
  export function createRouter(options: { history: unknown; routes: RouteRecordRaw[] }): Router;
  export function createWebHistory(base?: string): unknown;
  export function createWebHashHistory(base?: string): unknown;
  export function createMemoryHistory(base?: string): unknown;
  export function useRoute(): Router["currentRoute"];
  export function useRouter(): Router;
}