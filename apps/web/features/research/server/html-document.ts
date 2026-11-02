import { parse } from "parse5";

interface HtmlNode {
  readonly nodeName: string;
  readonly tagName?: string;
  readonly value?: string;
  readonly attrs?: readonly { readonly name: string; readonly value: string }[];
  readonly childNodes?: readonly HtmlNode[];
}

export interface ExtractedWebDocument {
  readonly title: string;
  readonly text: string;
}

const excludedTags = new Set([
  "head",
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "object",
  "embed",
  "form",
  "nav",
  "footer",
  "aside",
]);

const blockTags = new Set([
  "address",
  "article",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

function findFirstTag(node: HtmlNode, tagName: string): HtmlNode | undefined {
  const pending = [node];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.tagName === tagName) return current;
    const children = current.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]);
    }
  }
  return undefined;
}

function textWithin(node: HtmlNode, maximum: number): string {
  const pieces: string[] = [];
  let size = 0;
  const pending = [node];
  while (pending.length > 0 && size < maximum) {
    const current = pending.pop()!;
    if (current.nodeName === "#text") {
      const value = current.value ?? "";
      pieces.push(value.slice(0, maximum - size));
      size += value.length;
      continue;
    }
    if (current.tagName && excludedTags.has(current.tagName)) continue;
    const children = current.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]);
    }
  }
  return pieces.join("").replace(/\s+/gu, " ").trim();
}

function isHidden(node: HtmlNode): boolean {
  return (node.attrs ?? []).some(({ name, value }) =>
    name === "hidden" || (name === "aria-hidden" && value.toLowerCase() === "true")
  );
}

export function extractWebDocument(
  source: string,
  maximumTextCharacters = 40_000,
): ExtractedWebDocument {
  const document = parse(source) as unknown as HtmlNode;
  const titleNode = findFirstTag(document, "title");
  const title = titleNode ? textWithin(titleNode, 500).slice(0, 300) : "";
  const bodyNode = findFirstTag(document, "body") ?? document;
  const pieces: string[] = [];
  let characters = 0;
  const pending: ({ readonly kind: "node"; readonly node: HtmlNode } | { readonly kind: "separator" })[] = [
    { kind: "node", node: bodyNode },
  ];
  while (pending.length > 0 && characters < maximumTextCharacters) {
    const item = pending.pop()!;
    if (item.kind === "separator") {
      pieces.push("\n");
      continue;
    }

    const node = item.node;
    const tag = node.tagName ?? "";
    if (excludedTags.has(tag) || isHidden(node)) continue;
    if (node.nodeName === "#text") {
      const value = node.value ?? "";
      const remaining = maximumTextCharacters - characters;
      pieces.push(value.slice(0, remaining));
      characters += Math.min(value.length, remaining);
      continue;
    }

    const isBlock = blockTags.has(tag);
    if (isBlock) pending.push({ kind: "separator" });
    const children = node.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ kind: "node", node: children[index] });
    }
    if (isBlock) pending.push({ kind: "separator" });
  }
  const text = pieces
    .join("")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return { title, text };
}
