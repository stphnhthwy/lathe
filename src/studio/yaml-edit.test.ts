import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { applyEdits, type ManifestEdit } from "./yaml-edit.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = readFileSync(
  join(projectRoot, "examples", "training-coach", "capability.yaml"),
  "utf8",
);

/**
 * Multiset line diff: lines present in `before` but not `after` (removed) and
 * vice versa (added). "Byte-diff-minimal" assertions are phrased through this —
 * every line the edit did not target must survive byte-identically.
 */
function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split("\n");
  const b = after.split("\n");
  const counts = new Map<string, number>();
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of b) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else added.push(line);
  }
  const removed: string[] = [];
  for (const [line, n] of counts) for (let i = 0; i < n; i++) removed.push(line);
  return { removed, added };
}

function edit(text: string, edits: ManifestEdit[]): string {
  return applyEdits(text, edits);
}

describe("applyEdits — set on existing scalars", () => {
  it("replaces a plain scalar touching only its line, trailing comment intact", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "store", "base_url"], value: "http://127.0.0.1:54321/rest/v1" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([
      "    base_url: ${SUPABASE_URL}/rest/v1                 # local Supabase or hosted",
    ]);
    expect(added).toEqual([
      "    base_url: http://127.0.0.1:54321/rest/v1                 # local Supabase or hosted",
    ]);
    expect(parseYaml(after).sources.store.base_url).toBe("http://127.0.0.1:54321/rest/v1");
  });

  it("preserves double-quote style when replacing a quoted scalar", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "store", "auth", "token"], value: "${SERVICE_KEY}" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual(['    auth:    { kind: bearer, token: "${SUPABASE_KEY}" }']);
    expect(added).toEqual(['    auth:    { kind: bearer, token: "${SERVICE_KEY}" }']);
  });

  it("edits inside a flow map touching only that line", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "strava", "auth", "kind"], value: "bearer" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([
      '    auth: { kind: oauth2, token: "${STRAVA_TOKEN}" }    # refresh handled at runtime',
    ]);
    expect(added).toEqual([
      '    auth: { kind: bearer, token: "${STRAVA_TOKEN}" }    # refresh handled at runtime',
    ]);
  });

  it("quotes strings that are not plain-safe", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "store", "base_url"], value: "url # not a comment" },
    ]);
    expect(parseYaml(after).sources.store.base_url).toBe("url # not a comment");
    expect(after).toContain('"url # not a comment"');
  });

  it("quotes flow-unsafe strings when the target sits in a flow collection", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "strava", "auth", "kind"], value: "a,b" },
    ]);
    expect(parseYaml(after).sources.strava.auth.kind).toBe("a,b");
  });
});

describe("applyEdits — add", () => {
  it("adds a new key to a block map with matching indentation", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "store", "timeout_s"], value: 30 },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([]);
    expect(added).toEqual(["    timeout_s: 30"]);
    expect(parseYaml(after).sources.store.timeout_s).toBe(30);
  });

  it("adds a new key to a flow map, only that line changing", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "store", "headers", "x-client"], value: "lathe" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual(['    headers: { apikey: "${SUPABASE_KEY}" }']);
    expect(added).toEqual(['    headers: { apikey: "${SUPABASE_KEY}", x-client: lathe }']);
  });

  it("creates missing intermediate maps as block lines", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "strava", "headers", "x-client"], value: "lathe" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([]);
    expect(added).toEqual(["    headers:", "      x-client: lathe"]);
    expect(parseYaml(after).sources.strava.headers["x-client"]).toBe("lathe");
  });

  it("adds a whole new source under the sources map", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "local", "type"], value: "http" },
      { op: "set", path: ["sources", "local", "base_url"], value: "http://127.0.0.1:3000" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([]);
    expect(added).toEqual(["  local:", "    type: http", "    base_url: http://127.0.0.1:3000"]);
    expect(parseYaml(after).sources.local).toEqual({
      type: "http",
      base_url: "http://127.0.0.1:3000",
    });
  });

  it("fills in a key that exists with an empty value", () => {
    const text = "sources:\n  api:\n    type: http\n    headers:\n";
    const after = edit(text, [
      { op: "set", path: ["sources", "api", "headers", "apikey"], value: "${KEY}" },
    ]);
    expect(parseYaml(after).sources.api.headers.apikey).toBe("${KEY}");
  });
});

describe("applyEdits — remove", () => {
  it("removes a block-map key and its whole line", () => {
    const after = edit(fixture, [{ op: "remove", path: ["sources", "store", "headers"] }]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual(['    headers: { apikey: "${SUPABASE_KEY}" }']);
    expect(added).toEqual([]);
    expect(parseYaml(after).sources.store.headers).toBeUndefined();
  });

  it("removes a block-map key whose line carries a trailing comment", () => {
    const after = edit(fixture, [{ op: "remove", path: ["sources", "strava", "auth"] }]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([
      '    auth: { kind: oauth2, token: "${STRAVA_TOKEN}" }    # refresh handled at runtime',
    ]);
    expect(added).toEqual([]);
  });

  it("removes a non-first flow-map entry along with its comma", () => {
    const after = edit(fixture, [
      { op: "remove", path: ["sources", "store", "auth", "token"] },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual(['    auth:    { kind: bearer, token: "${SUPABASE_KEY}" }']);
    expect(added).toEqual(["    auth:    { kind: bearer }"]);
  });

  it("removes the first flow-map entry along with the following comma", () => {
    const after = edit(fixture, [
      { op: "remove", path: ["sources", "strava", "auth", "kind"] },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([
      '    auth: { kind: oauth2, token: "${STRAVA_TOKEN}" }    # refresh handled at runtime',
    ]);
    expect(added).toEqual([
      '    auth: { token: "${STRAVA_TOKEN}" }    # refresh handled at runtime',
    ]);
  });

  it("collapses a flow map to {} when its only entry is removed", () => {
    const text = "sources:\n  api:\n    type: http\n    headers: { apikey: x }\n";
    const after = edit(text, [
      { op: "remove", path: ["sources", "api", "headers", "apikey"] },
    ]);
    expect(after).toContain("headers: {}");
    expect(parseYaml(after).sources.api.headers).toEqual({});
  });
});

describe("applyEdits — sequences", () => {
  it("replaces a block-seq item touching only its line, trailing comment intact", () => {
    const after = edit(fixture, [
      { op: "set", path: ["references", 0], value: "./coaching.md" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([
      "  - ./methodology.pdf        # the 50k periodization approach the plan must follow",
    ]);
    expect(added).toEqual([
      "  - ./coaching.md        # the 50k periodization approach the plan must follow",
    ]);
  });

  it("replaces a flow-seq item in place", () => {
    const after = edit(fixture, [{ op: "set", path: ["emit", 1], value: "skill" }]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual(["emit: [skill, mcp]"]);
    expect(added).toEqual(["emit: [skill, skill]"]);
  });

  it("appends to a block seq when the index equals its length", () => {
    const after = edit(fixture, [
      { op: "set", path: ["references", 1], value: "./drills.md" },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([]);
    expect(added).toEqual(["  - ./drills.md"]);
    expect(parseYaml(after).references).toEqual(["./methodology.pdf", "./drills.md"]);
  });

  it("appends to a flow seq when the index equals its length", () => {
    const after = edit(fixture, [{ op: "set", path: ["emit", 2], value: "skill" }]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual(["emit: [skill, mcp]"]);
    expect(added).toEqual(["emit: [skill, mcp, skill]"]);
  });

  it("creates a missing seq as block lines when the path has a 0 index", () => {
    const text = "capability: t\nversion: 0.0.1\n";
    const after = edit(text, [{ op: "set", path: ["references", 0], value: "./a.md" }]);
    expect(after).toBe("capability: t\nversion: 0.0.1\nreferences:\n  - ./a.md\n");
  });

  it("removes a middle block-seq item and its whole line", () => {
    const base = edit(fixture, [{ op: "set", path: ["references", 1], value: "./drills.md" }]);
    const after = edit(base, [{ op: "remove", path: ["references", 0] }]);
    const { removed, added } = lineDiff(base, after);
    expect(removed).toEqual([
      "  - ./methodology.pdf        # the 50k periodization approach the plan must follow",
    ]);
    expect(added).toEqual([]);
    expect(parseYaml(after).references).toEqual(["./drills.md"]);
  });

  it("collapses a block seq to [] when its only item is removed", () => {
    const after = edit(fixture, [{ op: "remove", path: ["references", 0] }]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toEqual([
      "  - ./methodology.pdf        # the 50k periodization approach the plan must follow",
    ]);
    expect(added).toEqual(["  []"]);
    expect(parseYaml(after).references).toEqual([]);
  });

  it("removes flow-seq items with comma handling at both ends", () => {
    const first = edit(fixture, [{ op: "remove", path: ["emit", 0] }]);
    expect(lineDiff(fixture, first).added).toEqual(["emit: [mcp]"]);
    const last = edit(fixture, [{ op: "remove", path: ["emit", 1] }]);
    expect(lineDiff(fixture, last).added).toEqual(["emit: [skill]"]);
  });

  it("collapses a flow seq to [] when its only item is removed", () => {
    const text = "emit: [skill]\n";
    const after = edit(text, [{ op: "remove", path: ["emit", 0] }]);
    expect(after).toBe("emit: []\n");
  });

  it("throws on an out-of-range append index", () => {
    expect(() =>
      edit(fixture, [{ op: "set", path: ["references", 5], value: "./x.md" }]),
    ).toThrow(/out of range/);
  });

  it("throws when removing a seq index that does not exist", () => {
    expect(() => edit(fixture, [{ op: "remove", path: ["references", 3] }])).toThrow(
      /not found/,
    );
  });
});

describe("applyEdits — errors and integrity", () => {
  it("throws when removing a key that does not exist", () => {
    expect(() =>
      edit(fixture, [{ op: "remove", path: ["sources", "store", "nope"] }]),
    ).toThrow(/not found/);
  });

  it("throws when setting a path that runs through a scalar", () => {
    expect(() =>
      edit(fixture, [{ op: "set", path: ["sources", "strava", "type", "x"], value: "y" }]),
    ).toThrow(/not a collection/);
  });

  it("throws when replacing a collection with a scalar", () => {
    expect(() =>
      edit(fixture, [{ op: "set", path: ["sources", "strava", "auth"], value: "nope" }]),
    ).toThrow(/not a scalar/);
  });

  it("applies a multi-edit batch leaving every untargeted line byte-identical", () => {
    const after = edit(fixture, [
      { op: "set", path: ["sources", "store", "base_url"], value: "${DB_URL}/rest/v1" },
      { op: "set", path: ["sources", "store", "headers", "apikey"], value: "${DB_KEY}" },
      { op: "remove", path: ["sources", "strava", "auth"] },
      { op: "set", path: ["sources", "strava", "timeout_s"], value: 10 },
    ]);
    const { removed, added } = lineDiff(fixture, after);
    expect(removed).toHaveLength(3);
    expect(added).toHaveLength(3);
    const parsed = parseYaml(after);
    expect(parsed.sources.store.base_url).toBe("${DB_URL}/rest/v1");
    expect(parsed.sources.store.headers.apikey).toBe("${DB_KEY}");
    expect(parsed.sources.strava.auth).toBeUndefined();
    expect(parsed.sources.strava.timeout_s).toBe(10);
    // the comment-dense regions the edits never touched are still there
    expect(after).toContain("# ── SOURCES ─");
    expect(after).toContain("# local Supabase or hosted");
    expect(after).toContain("# upsert on external_id");
  });

  it("no-op edit list returns the text unchanged", () => {
    expect(edit(fixture, [])).toBe(fixture);
  });
});
