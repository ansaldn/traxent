#!/usr/bin/env node
// scheduled-release.mjs
// -----------------------------------------------------------------------------
// Publishes scheduled content for the Traxent static site.
//
// Reads /scheduled-releases.json (an array of entries). For every entry that is
// still unpublished and whose publishAt time is now in the past, it copies the
// staged source file into its destination under src/ (creating parent dirs),
// marks the entry published, and stamps publishedAt. The manifest is then
// rewritten as pretty 2-space JSON with a trailing newline.
//
// This script is the "publish" half of the system. It only moves files inside
// the repo and updates the manifest — it does NOT commit, push, or deploy. The
// workflow (.github/workflows/scheduled-release.yml) commits + pushes the
// result, and the existing deploy.yml then ships whatever now lives in src/.
//
// Design notes:
//   - Node 22, ESM, zero external dependencies (only node builtins).
//   - Defensive: a single malformed or unreadable entry is skipped with a
//     warning; it never aborts the whole run and never throws.
//   - Idempotent: already-published entries and not-yet-due entries are left
//     untouched, so running on a tight cron is safe.
//   - Always exits 0 (a publish failure for one entry must not fail the cron;
//     it is logged loudly instead). Signals work done via published_count.
//
// Output signal: if $GITHUB_OUTPUT is set, writes `published_count=<n>` so the
// workflow can decide whether to commit. Always prints a human-readable summary.
// -----------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Resolve the repo root as the parent of this script's directory (scripts/..),
// so the script works regardless of the current working directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "scheduled-releases.json");

const REQUIRED_STRING_FIELDS = ["id", "source", "dest", "publishAt"];

/** Print to stderr so summaries on stdout stay clean if a caller pipes them. */
function warn(msg) {
  console.warn(`[scheduled-release] WARN: ${msg}`);
}
function info(msg) {
  console.log(`[scheduled-release] ${msg}`);
}

/**
 * Validate one manifest entry. Returns an array of human-readable problems;
 * an empty array means the entry is structurally valid (it may still be
 * not-yet-due or already published — that's handled separately).
 */
function validateEntry(entry, index) {
  const problems = [];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    problems.push(`entry #${index} is not an object`);
    return problems; // can't inspect fields on a non-object
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") {
      problems.push(`entry #${index} is missing required string field "${field}"`);
    }
  }
  if ("published" in entry && typeof entry.published !== "boolean") {
    problems.push(`entry #${index} field "published" must be a boolean`);
  }
  if (typeof entry.publishAt === "string") {
    const t = Date.parse(entry.publishAt);
    if (Number.isNaN(t)) {
      problems.push(`entry #${index} has an unparseable publishAt "${entry.publishAt}"`);
    }
  }
  return problems;
}

/**
 * Guard against path traversal: a resolved path must stay inside REPO_ROOT.
 * Protects against a malicious/typo manifest pointing source/dest at "../".
 */
function resolveInsideRepo(relPath) {
  const abs = path.resolve(REPO_ROOT, relPath);
  const rootWithSep = REPO_ROOT.endsWith(path.sep) ? REPO_ROOT : REPO_ROOT + path.sep;
  if (abs !== REPO_ROOT && !abs.startsWith(rootWithSep)) {
    throw new Error(`path "${relPath}" resolves outside the repository`);
  }
  return abs;
}

async function readManifest() {
  let raw;
  try {
    raw = await fs.readFile(MANIFEST_PATH, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      warn(`no manifest found at ${MANIFEST_PATH} — nothing to do.`);
      return null;
    }
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    warn(`manifest is not valid JSON (${err.message}) — refusing to run.`);
    return null;
  }
  if (!Array.isArray(parsed)) {
    warn("manifest must be a JSON array — refusing to run.");
    return null;
  }
  return parsed;
}

/** Write the manifest back as pretty 2-space JSON with a trailing newline. */
async function writeManifest(entries) {
  const serialized = JSON.stringify(entries, null, 2) + "\n";
  await fs.writeFile(MANIFEST_PATH, serialized, "utf8");
}

/** Append `published_count=<n>` to the GitHub Actions step output, if present. */
async function emitGithubOutput(count) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) return; // running locally — nothing to signal
  try {
    await fs.appendFile(outFile, `published_count=${count}\n`, "utf8");
  } catch (err) {
    warn(`could not write to GITHUB_OUTPUT (${err.message}).`);
  }
}

async function publishEntry(entry) {
  const srcAbs = resolveInsideRepo(entry.source);
  const destAbs = resolveInsideRepo(entry.dest);

  // Confirm the source exists before we touch anything.
  await fs.access(srcAbs);

  // Ensure the destination's parent directory exists, then copy.
  await fs.mkdir(path.dirname(destAbs), { recursive: true });
  await fs.copyFile(srcAbs, destAbs);

  info(`published "${entry.id}": ${entry.source} -> ${entry.dest}`);
}

async function main() {
  const entries = await readManifest();
  if (entries === null) {
    await emitGithubOutput(0);
    info("nothing due (no usable manifest).");
    return;
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const publishedIds = [];
  let mutated = false;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    const problems = validateEntry(entry, i);
    if (problems.length > 0) {
      for (const p of problems) warn(`skipping malformed entry — ${p}`);
      continue;
    }

    // Already published? Leave it alone (idempotent).
    if (entry.published === true) continue;

    // Not yet due? Leave it alone.
    const due = Date.parse(entry.publishAt);
    if (!(due <= now)) continue;

    // Due and unpublished — try to publish. A failure here is logged but must
    // not abort the run or fail the cron; other entries should still process.
    try {
      await publishEntry(entry);
      entry.published = true;
      entry.publishedAt = nowIso;
      publishedIds.push(entry.id);
      mutated = true;
    } catch (err) {
      warn(`failed to publish entry "${entry.id}" (${err.message}) — left unpublished.`);
    }
  }

  if (mutated) {
    try {
      await writeManifest(entries);
    } catch (err) {
      // If we copied files but cannot persist the manifest, fail loudly so the
      // workflow's `git status` still sees the moved files and a human notices
      // the manifest did not advance. We still exit 0 per the contract.
      warn(`published ${publishedIds.length} item(s) but FAILED to rewrite the manifest (${err.message}).`);
    }
  }

  await emitGithubOutput(publishedIds.length);

  if (publishedIds.length > 0) {
    info(`published ${publishedIds.length} item(s): [${publishedIds.join(", ")}]`);
  } else {
    info("nothing due.");
  }
}

// Top-level guard: under no circumstance should this script throw / exit non-zero
// and break the cron. Log the unexpected error and exit cleanly.
main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    warn(`unexpected error: ${err && err.stack ? err.stack : err}`);
    await emitGithubOutput(0);
    process.exit(0);
  });
