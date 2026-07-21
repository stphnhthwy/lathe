import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  stringify as stringifyYaml,
  Scalar,
  type Document,
  type Pair,
  type YAMLMap,
} from "yaml";

/**
 * Comment-preserving, path-scoped edits to a manifest's YAML text.
 *
 * The studio's save path must leave every line it did not target byte-identical
 * — comments, alignment padding, flow/block style, key order. Re-serializing
 * the whole `Document` cannot deliver that (yaml's stringifier normalizes
 * comment columns, flow padding, and line folding), so this module uses the
 * parsed Document only to *locate* nodes: each edit is applied by splicing new
 * text into the original string at the node's byte range, then reparsing before
 * the next edit so ranges stay valid.
 */

export type EditPath = (string | number)[];

export type ManifestEdit =
  | { op: "set"; path: EditPath; value: string | number | boolean | null }
  | { op: "remove"; path: EditPath };

/** Apply edits in order and return the new YAML text. Throws on any bad edit. */
export function applyEdits(text: string, edits: ManifestEdit[]): string {
  let current = text;
  for (const edit of edits) current = applyOne(current, edit);
  if (current !== text) {
    const check = parseDocument(current);
    if (check.errors.length > 0) {
      throw new Error(`edits produced unparseable YAML: ${check.errors[0].message}`);
    }
  }
  return current;
}

function applyOne(text: string, edit: ManifestEdit): string {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    throw new Error(`cannot edit unparseable YAML: ${doc.errors[0].message}`);
  }
  if (edit.path.length === 0) throw new Error("edit path must not be empty");
  return edit.op === "remove"
    ? removeAt(text, doc, edit.path)
    : setAt(text, doc, edit.path, edit.value);
}

function pathLabel(path: EditPath): string {
  return path.join(".");
}

type ScalarValue = string | number | boolean | null;

// ── set ──────────────────────────────────────────────────────────────────────

function setAt(text: string, doc: Document, path: EditPath, value: ScalarValue): string {
  const existing = doc.getIn(path, true);
  if (existing !== undefined && existing !== null) {
    if (!isScalar(existing) || !existing.range) {
      throw new Error(`cannot set ${pathLabel(path)}: the existing value is not a scalar`);
    }
    const replacement = formatScalar(value, existing.type, inFlowContext(doc, path));
    const [start, end] = existing.range;
    return text.slice(0, start) + replacement + text.slice(end);
  }
  return addAt(text, doc, path, value);
}

/** True when any collection containing the node at `path` is flow-style. */
function inFlowContext(doc: Document, path: EditPath): boolean {
  for (let i = 0; i < path.length; i++) {
    const node = i === 0 ? doc.contents : doc.getIn(path.slice(0, i), true);
    if ((isMap(node) || isSeq(node)) && node.flow) return true;
  }
  return false;
}

/** Add a value at a path whose final key(s) do not exist yet. */
function addAt(text: string, doc: Document, path: EditPath, value: ScalarValue): string {
  // Walk up to the deepest existing ancestor.
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const node = depth === 0 ? doc.contents : doc.getIn(path.slice(0, depth), true);
    if (node === undefined || node === null) continue;

    const rest = path.slice(depth);
    if (isScalar(node)) {
      // An explicit null (`key: null` / `~`) is a fillable hole; any other
      // scalar means the path runs through a leaf.
      if (node.value === null && node.range) {
        const [start, end] = node.range;
        // An implicit null is a zero-width node right after the colon.
        const sep = start === end && text[start - 1] === ":" ? " " : "";
        return text.slice(0, start) + sep + flowValue(rest, value) + text.slice(end);
      }
      throw new Error(`cannot set ${pathLabel(path)}: ${pathLabel(path.slice(0, depth))} is not a collection`);
    }
    if (isSeq(node)) {
      throw new Error(`cannot add ${pathLabel(path)}: adding into a sequence is not supported`);
    }
    if (isMap(node)) {
      return addToMap(text, node, rest, value);
    }
    throw new Error(`cannot set ${pathLabel(path)}: unsupported node at ${pathLabel(path.slice(0, depth))}`);
  }
  // Empty document: append a block entry at the top level.
  const prefix = text.length === 0 || text.endsWith("\n") ? text : `${text}\n`;
  return prefix + blockEntry("", path, value).join("\n") + "\n";
}

function addToMap(text: string, map: YAMLMap, rest: EditPath, value: ScalarValue): string {
  const key = rest[0];
  // The key may already exist with an *implicit* empty value (`headers:` with
  // nothing after it) — the parser reports no value node, so getIn saw a gap.
  const existingPair = map.items.find((p) => keyMatches(p, key));
  if (existingPair) {
    const keyNode = existingPair.key;
    if (!isScalar(keyNode) || !keyNode.range) {
      throw new Error(`cannot set …${String(key)}: unsupported key node`);
    }
    const colon = text.indexOf(":", keyNode.range[1]);
    if (colon === -1) throw new Error(`cannot set …${String(key)}: malformed mapping entry`);
    return text.slice(0, colon + 1) + " " + flowValue(rest.slice(1), value) + text.slice(colon + 1);
  }

  if (!map.range) throw new Error(`cannot add ${pathLabel(rest)}: map has no range`);

  if (map.flow) {
    const entry = `${formatKey(key)}: ${flowValue(rest.slice(1), value)}`;
    const [start, end] = map.range; // [start, end) covers the braces
    if (map.items.length === 0) {
      return text.slice(0, start) + `{ ${entry} }` + text.slice(end);
    }
    const lastEnd = Math.max(
      ...map.items.map((p) => nodeValueEnd(p) ?? scalarRange(p.key)?.[1] ?? start),
    );
    return text.slice(0, lastEnd) + `, ${entry}` + text.slice(lastEnd);
  }

  // Block map: new lines after the map's last content, at the items' indent.
  const firstKey = scalarRange(map.items[0]?.key);
  if (!firstKey) throw new Error(`cannot add ${pathLabel(rest)}: map has no items to align with`);
  const lineStart = text.lastIndexOf("\n", firstKey[0] - 1) + 1;
  const indent = " ".repeat(firstKey[0] - lineStart); // handles `- key:` items too
  let insertAt = map.range[1];
  if (insertAt > 0 && text[insertAt - 1] !== "\n") {
    const nl = text.indexOf("\n", insertAt);
    insertAt = nl === -1 ? text.length : nl + 1;
  }
  const lines = blockEntry(indent, rest, value);
  const prefix = insertAt > 0 && text[insertAt - 1] !== "\n" ? "\n" : "";
  return text.slice(0, insertAt) + prefix + lines.join("\n") + "\n" + text.slice(insertAt);
}

/** `[a, b, c] → "a:" / "  b:" / "    c: value"` — nested block lines. */
function blockEntry(indent: string, keys: EditPath, value: ScalarValue): string[] {
  const lines: string[] = [];
  let ind = indent;
  for (let i = 0; i < keys.length - 1; i++) {
    lines.push(`${ind}${formatKey(keys[i])}:`);
    ind += "  ";
  }
  lines.push(`${ind}${formatKey(keys[keys.length - 1])}: ${formatScalar(value, undefined, false)}`);
  return lines;
}

/** `[a, b] → "{ a: { b: value } }"` — inline nesting for flow contexts. */
function flowValue(keys: EditPath, value: ScalarValue): string {
  if (keys.length === 0) return formatScalar(value, undefined, true);
  return `{ ${formatKey(keys[0])}: ${flowValue(keys.slice(1), value)} }`;
}

// ── remove ───────────────────────────────────────────────────────────────────

function removeAt(text: string, doc: Document, path: EditPath): string {
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = parentPath.length === 0 ? doc.contents : doc.getIn(parentPath, true);
  if (!isMap(parent)) {
    throw new Error(`cannot remove ${pathLabel(path)}: parent is not a mapping`);
  }
  const index = parent.items.findIndex((p) => keyMatches(p, key));
  if (index === -1) {
    throw new Error(`cannot remove ${pathLabel(path)}: not found`);
  }
  return parent.flow
    ? removeFromFlowMap(text, parent, index)
    : removeBlockPair(text, parent.items[index]);
}

/** Remove a block-map pair: its full line(s), trailing comment included. */
function removeBlockPair(text: string, pair: Pair): string {
  const keyRange = scalarRange(pair.key);
  if (!keyRange) throw new Error("cannot remove: unsupported key node");
  const start = text.lastIndexOf("\n", keyRange[0] - 1) + 1;
  let end = fullNodeEnd(pair) ?? keyRange[2] ?? keyRange[1];
  if (end > 0 && text[end - 1] !== "\n") {
    const nl = text.indexOf("\n", end);
    end = nl === -1 ? text.length : nl + 1;
  }
  return text.slice(0, start) + text.slice(end);
}

function removeFromFlowMap(text: string, map: YAMLMap, index: number): string {
  if (!map.range) throw new Error("cannot remove: flow map has no range");
  if (map.items.length === 1) {
    // Last entry: collapse the whole collection to {} rather than leave `{  }`.
    return text.slice(0, map.range[0]) + "{}" + text.slice(map.range[1]);
  }
  const pair = map.items[index];
  const keyRange = scalarRange(pair.key);
  if (!keyRange) throw new Error("cannot remove: unsupported key node");
  let start = keyRange[0];
  let end = nodeValueEnd(pair) ?? keyRange[1];
  if (index > 0) {
    // Take the preceding comma (and the whitespace between it and the entry).
    while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\n")) start--;
    if (text[start - 1] === ",") start--;
  } else {
    // First entry: take the following comma and its trailing whitespace.
    while (text[end] === " ") end++;
    if (text[end] === ",") {
      end++;
      while (text[end] === " ") end++;
    }
  }
  return text.slice(0, start) + text.slice(end);
}

// ── node helpers ─────────────────────────────────────────────────────────────

function keyMatches(pair: Pair, key: string | number): boolean {
  return isScalar(pair.key) && String(pair.key.value) === String(key);
}

function scalarRange(node: unknown): [number, number, number] | null {
  return isScalar(node) && node.range ? node.range : null;
}

function nodeRange(value: unknown): [number, number, number] | null {
  if (value && typeof value === "object" && "range" in value) {
    return (value as { range?: [number, number, number] | null }).range ?? null;
  }
  return null;
}

/** End offset of a pair's value text (excluding trailing comment/newline). */
function nodeValueEnd(pair: Pair): number | null {
  return nodeRange(pair.value)?.[1] ?? null;
}

/** End offset of a pair's full extent (including trailing comment/newline). */
function fullNodeEnd(pair: Pair): number | null {
  const range = nodeRange(pair.value);
  return range ? (range[2] ?? range[1]) : null;
}

// ── scalar formatting ────────────────────────────────────────────────────────

/**
 * Render a scalar for splicing. Quote style follows the node being replaced
 * (a double-quoted token ref stays double-quoted); new values go plain when
 * YAML allows it, quoted when not — with flow-indicator characters forcing
 * quotes inside flow collections, where plain rules are stricter.
 */
function formatScalar(value: ScalarValue, origType: Scalar["type"], inFlow: boolean): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (origType === Scalar.QUOTE_DOUBLE) return JSON.stringify(value);
  if (origType === Scalar.QUOTE_SINGLE) return `'${value.replaceAll("'", "''")}'`;
  let out: string;
  try {
    out = stringifyYaml(value, { lineWidth: 0 }).replace(/\n$/, "");
  } catch {
    out = JSON.stringify(value);
  }
  if (out.includes("\n")) return JSON.stringify(value); // block scalar cannot inline
  if (inFlow && !/^["']/.test(out) && /[,[\]{}]/.test(out)) return JSON.stringify(value);
  return out;
}

function formatKey(key: string | number): string {
  const s = String(key);
  return /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(s) ? s : JSON.stringify(s);
}
