/**
 * Markdown Renderer
 *
 * Converts Markdown to HTML or plain text.
 * Lightweight implementation supporting:
 * - Headings (# ## ###)
 * - Bold/italic (*text*, **text**)
 * - Lists (- item, 1. item)
 * - Links [text](url)
 * - Code (`inline`)
 * - Blockquotes (> quote)
 * - Paragraphs (blank line separated)
 *
 * NOT supported (kept lightweight):
 * - Tables
 * - Code blocks with syntax highlighting
 * - Complex nesting
 * - Strikethrough
 * - Footnotes
 */

/**
 * Markdown to HTML renderer
 */
export class MarkdownRenderer {
  /**
   * Convert Markdown string to HTML
   */
  static toHtml(markdown: string): string {
    let html = markdown;

    // Escape HTML special characters (but preserve user-intentional HTML)
    // Only escape in content sections (not in already-formed tags)

    // Process in order of precedence (inner → outer)

    // 1. Inline code: `code`
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // 2. Bold: **text** or __text__
    html = html.replace(/\*\*([^\*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");

    // 3. Italic: *text* or _text_
    // (be careful not to match ** or __)
    html = html.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, "<em>$1</em>");
    html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");

    // 4. Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 5. Line breaks (double space at end of line or \n\n)
    html = html.replace(/  \n/g, "<br>\n");

    // 6. Blockquotes: > quote
    html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

    // 7. Headings (must be on own line)
    html = html.replace(/^### ([^\n]+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## ([^\n]+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# ([^\n]+)$/gm, "<h1>$1</h1>");

    // 8. Ordered lists: 1. 2. 3.
    html = this._processOrderedLists(html);

    // 9. Unordered lists: - * +
    html = this._processUnorderedLists(html);

    // 10. Paragraphs (blank line = new paragraph)
    html = this._processParagraphs(html);

    // 11. Horizontal rules: ---
    html = html.replace(/^---$/gm, "<hr>");

    return html.trim();
  }

  /**
   * Convert Markdown string to plain text
   */
  static toText(markdown: string): string {
    let text = markdown;

    // Remove inline code markers: `code` → code
    text = text.replace(/`([^`]+)`/g, "$1");

    // Remove bold markers: **text** → text
    text = text.replace(/\*\*([^\*]+)\*\*/g, "$1");
    text = text.replace(/__([^_]+)__/g, "$1");

    // Remove italic markers: *text* → text
    text = text.replace(/\*([^\*]+)\*/g, "$1");
    text = text.replace(/_([^_]+)_/g, "$1");

    // Convert links: [text](url) → text: url
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");

    // Remove blockquote markers: > quote → quote
    text = text.replace(/^> (.+)$/gm, "$1");

    // Remove headings markers: # text → text
    text = text.replace(/^#+\s+(.+)$/gm, "$1");

    // Remove list markers
    text = text.replace(/^\d+\.\s+/gm, ""); // Ordered: 1. 2. 3.
    text = text.replace(/^[-*+]\s+/gm, ""); // Unordered: - * +

    // Clean up multiple blank lines
    text = text.replace(/\n\n\n+/g, "\n\n");

    return text.trim();
  }

  /**
   * Process ordered lists (1. 2. 3.)
   */
  private static _processOrderedLists(html: string): string {
    // Find list blocks
    const lines = html.split("\n");
    let inList = false;
    let listHtml = "";
    let result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\d+)\.\s+(.+)$/);

      if (match) {
        if (!inList) {
          inList = true;
          listHtml = `<ol>\n<li>${match[2]}</li>`;
        } else {
          listHtml += `\n<li>${match[2]}</li>`;
        }
      } else {
        if (inList) {
          result.push(listHtml + "\n</ol>");
          inList = false;
          listHtml = "";
        }
        result.push(line);
      }
    }

    if (inList) {
      result.push(listHtml + "\n</ol>");
    }

    return result.join("\n");
  }

  /**
   * Process unordered lists (- * +)
   */
  private static _processUnorderedLists(html: string): string {
    // Find list blocks
    const lines = html.split("\n");
    let inList = false;
    let listHtml = "";
    let result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^[-*+]\s+(.+)$/);

      if (match) {
        if (!inList) {
          inList = true;
          listHtml = `<ul>\n<li>${match[1]}</li>`;
        } else {
          listHtml += `\n<li>${match[1]}</li>`;
        }
      } else {
        if (inList) {
          result.push(listHtml + "\n</ul>");
          inList = false;
          listHtml = "";
        }
        result.push(line);
      }
    }

    if (inList) {
      result.push(listHtml + "\n</ul>");
    }

    return result.join("\n");
  }

  /**
   * Process paragraphs (blank line separated)
   */
  private static _processParagraphs(html: string): string {
    const blocks = html.split(/\n\n+/);
    const result: string[] = [];

    for (const block of blocks) {
      if (!block.trim()) continue;

      // Skip if already wrapped in tag
      if (
        block.match(/^<[a-z]/) ||
        block.match(/^<\/[a-z]/)
      ) {
        result.push(block);
      } else if (block.match(/^<(h[1-6]|ul|ol|blockquote|hr|code)/)) {
        result.push(block);
      } else {
        result.push(`<p>${block}</p>`);
      }
    }

    return result.join("\n");
  }
}
