#!/usr/bin/env node

// CLAUDE-ADDED: Wraps `next dev`/`next start` so starting the app also starts the Readium server
// that serves manifests for the book folder (see READIUM_SERVER_URL in
// src/next-lib/userData/publicationsConfig.ts) -- previously this had to be started by hand
// (`readium serve --file-directory ...`) in a separate terminal. Plain child_process rather than
// pulling in `concurrently`: only two processes, and we need custom behavior (restart readium when
// the book folder changes) a generic process runner doesn't give us for free.

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// CLAUDE-ADDED: Mirrors publicationsConfig.ts's own constants/config-file logic exactly -- this
// script runs as a plain Node process outside the Next.js/TS build, so it can't import that module
// directly and has to duplicate the handful of values instead.
const DEFAULT_PUBLICATIONS_DIR = "/home/deck/Documents/epubs";
const CONFIG_FILE = path.join(os.homedir(), ".config", "ishi-read", "config.json");

const READIUM_BIN = process.env.READIUM_BIN || path.join(root, "readium_linux_x86_64", "readium");
const READIUM_PORT = 15080;
const READIUM_ADDRESS = "localhost";

function getConfiguredBookFolder() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.publicationsDir === "string" && parsed.publicationsDir) {
      return parsed.publicationsDir;
    }
  } catch {
    // Fall through to the default -- same behavior as publicationsConfig.ts's readConfiguredDir.
  }
  return DEFAULT_PUBLICATIONS_DIR;
}

let readiumProcess = null;

function startReadium() {
  if (!fs.existsSync(READIUM_BIN)) {
    console.warn(`[readium] Binary not found at ${ READIUM_BIN } -- skipping. Book manifests won't load until it's running.`);
    return;
  }

  const bookFolder = getConfiguredBookFolder();
  console.log(`[readium] Starting: serve --file-directory ${ bookFolder } --address ${ READIUM_ADDRESS } --port ${ READIUM_PORT }`);

  const proc = spawn(
    READIUM_BIN,
    ["serve", "--file-directory", bookFolder, "--address", READIUM_ADDRESS, "--port", String(READIUM_PORT)],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  readiumProcess = proc;

  proc.on("exit", (code, signal) => {
    // A deliberate restart (see restartReadium) has already pointed readiumProcess at the new
    // instance by the time this fires -- identity, not nullness, is what distinguishes that from a
    // real crash.
    if (readiumProcess !== proc) return;
    console.error(`[readium] Exited unexpectedly (code ${ code }, signal ${ signal })`);
  });
}

function restartReadium() {
  console.log("[readium] Book folder changed -- restarting");
  readiumProcess?.kill();
  startReadium();
}

// CLAUDE-ADDED: --file-directory is a startup flag, not something readium can be told to change
// live -- so a book-folder change from the Settings panel (which just rewrites this same config
// file) needs to be picked up by restarting the subprocess, not just re-reading a value.
let restartTimer = null;
function watchConfigFile() {
  const dir = path.dirname(CONFIG_FILE);
  fs.mkdirSync(dir, { recursive: true });

  fs.watch(dir, (_event, filename) => {
    if (filename !== path.basename(CONFIG_FILE)) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(restartReadium, 200);
  });
}

startReadium();
watchConfigFile();

const [command, ...args] = process.argv.slice(2);
const nextProcess = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });

function shutdown(signal) {
  readiumProcess?.kill(signal);
  nextProcess.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

nextProcess.on("exit", (code) => {
  readiumProcess?.kill();
  process.exit(code ?? 0);
});
