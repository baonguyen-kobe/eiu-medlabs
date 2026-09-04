#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
let commandString = "";
for (let i = 0; i < args.length; i++) {
  if (args[i].toLowerCase() === "/c" && i + 1 < args.length) {
    commandString = args.slice(i + 1).join(" ");
    break;
  }
}

let raw = commandString.trim();
// Strip cmd.exe /s outer wrapper quotes: `""node" "arg1" "arg2""` -> `"node" "arg1" "arg2"`
if (raw.startsWith('""') && raw.endsWith('""')) {
  raw = raw.slice(1, -1).trim();
} else if (raw.startsWith('"') && raw.endsWith('"')) {
  const countQuotes = (raw.match(/"/g) || []).length;
  if (countQuotes > 2 && countQuotes % 2 === 0) {
    raw = raw.slice(1, -1).trim();
  }
}

function parseCommandLine(str) {
  const tokens = [];
  let current = "";
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === " " && !inQuotes) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

const tokens = parseCommandLine(raw);

if (tokens.length === 0) {
  process.exit(0);
}

const result = spawnSync(tokens[0], tokens.slice(1));
if (result.error) {
  console.error("Shim spawn error:", result.error.message);
  process.exit(1);
}

if (result.stdout && result.stdout.length > 0) {
  fs.writeSync(1, result.stdout);
}
if (result.stderr && result.stderr.length > 0) {
  fs.writeSync(2, result.stderr);
}

process.exit(result.status ?? 0);
