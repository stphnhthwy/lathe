import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Layer-2 (CLI) tests: spawn the BUILT binary the way a user runs it, and assert
// on exit codes + output. This covers the entry point (arg parsing, exit codes)
// that the library unit tests never touch. See standards/testing/packaging.md.

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectRoot, "dist", "cli.js");
const example = join(projectRoot, "examples", "training-coach", "capability.yaml");

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string = projectRoot): Promise<CliResult> {
  return new Promise((res) => {
    execFile(process.execPath, [cliPath, ...args], { cwd }, (err, stdout, stderr) => {
      res({ code: err && typeof err.code === "number" ? err.code : 0, stdout, stderr });
    });
  });
}

beforeAll(() => {
  // Ensure dist/ reflects current source — the CLI test must run the real artifact.
  execFileSync("npm", ["run", "build"], { cwd: projectRoot, stdio: "ignore" });
}, 60_000);

describe("lathe CLI", () => {
  it("--help lists the check command and exits 0", async () => {
    const r = await runCli(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("check");
  });

  it("check on the example exits 0 and reports valid", async () => {
    const r = await runCli(["check", example]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("is valid");
  });

  it("check on a malformed manifest exits 1 with a clear error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lathe-cli-"));
    try {
      const bad = join(dir, "capability.yaml");
      writeFileSync(bad, "version: 0.1.0\nsummary: no capability key\n");
      const r = await runCli(["check", bad]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("invalid");
      expect(r.stderr).toContain("capability");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("check on a missing file exits 1 with a read error", async () => {
    const r = await runCli(["check", "does-not-exist.yaml"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("cannot read");
  });

  it("init scaffolds a capability and exits 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lathe-cli-init-"));
    try {
      const r = await runCli(["init", "demo"], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("created capability");
      expect(existsSync(join(dir, "demo", "capability.yaml"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("init refuses to overwrite an existing capability (exit 1)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lathe-cli-init-"));
    try {
      const first = await runCli(["init", "demo"], dir);
      expect(first.code).toBe(0);

      const second = await runCli(["init", "demo"], dir);
      expect(second.code).toBe(1);
      expect(second.stderr).toContain("refusing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--help lists the serve command", async () => {
    const r = await runCli(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("serve");
  });

  it("serve on a missing manifest exits 1 with a read error (no transport)", async () => {
    // A valid manifest would start a long-lived stdio server; the missing-file
    // path exits before any transport opens, so it's safe to assert on here.
    const r = await runCli(["serve", "does-not-exist.yaml"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("cannot read");
  });
});
