#!/usr/bin/env node
import { Command } from "commander";
import { registerCheck } from "./commands/check.js";

const program = new Command();

program
  .name("lathe")
  .description("Turn a YAML capability manifest into a working MCP server + Agent Skill")
  .version("0.0.0");

registerCheck(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
