/**
 * Simple Template Tests - Sanity Check
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SimpleRenderer, MarkdownRenderer } from "../../src/templates";

describe("SimpleRenderer - Basic Sanity", () => {
  const renderer = new SimpleRenderer();

  it("should interpolate simple variables", () => {
    const result = renderer.render("Hello {{ name }}", { name: "World" });
    expect(result).toBe("Hello World");
  });

  it("should apply uppercase filter", () => {
    const result = renderer.render("{{ text | uppercase }}", { text: "hello" });
    expect(result).toBe("HELLO");
  });

  it("should handle if condition - true", () => {
    const result = renderer.render("{{ if show }}visible{{ endif }}", { show: true });
    expect(result).toBe("visible");
  });

  it("should handle if condition - false", () => {
    const result = renderer.render("{{ if show }}visible{{ endif }}hidden", { show: false });
    expect(result).toBe("hidden");
  });

  it("should handle if-else", () => {
    const result = renderer.render("{{ if show }}yes{{ else }}no{{ endif }}", { show: false });
    expect(result).toBe("no");
  });
});

describe("MarkdownRenderer - Basic Sanity", () => {
  it("should convert heading to HTML", () => {
    const html = MarkdownRenderer.toHtml("# Title");
    expect(html).toContain("<h1>Title</h1>");
  });

  it("should convert bold to HTML", () => {
    const html = MarkdownRenderer.toHtml("**bold**");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("should convert to plain text", () => {
    const text = MarkdownRenderer.toText("# Title\nThis is **bold**");
    expect(text).not.toContain("<");
    expect(text).toContain("Title");
  });
});
