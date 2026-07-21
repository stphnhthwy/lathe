#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { registerBuild } from "./commands/build.js";
import { registerCheck } from "./commands/check.js";
import { registerInit } from "./commands/init.js";
import { registerServe } from "./commands/serve.js";
import { registerStudio } from "./commands/studio.js";

const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command();

program
  .name("lathe")
  .description("Turn a YAML capability manifest into a working MCP server + Agent Skill")
  .version(pkg.version);

registerCheck(program);
registerInit(program);
registerServe(program);
registerBuild(program);
registerStudio(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
