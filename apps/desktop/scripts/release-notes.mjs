#!/usr/bin/env node
// Prints the release notes for a desktop tag such as desktop-v0.2.0.
//
// A curated file at apps/desktop/release-notes/<version>.md wins. Without
// one, the notes list the commits since the previous desktop tag that touch
// the paths the installers are built from, so every release gets real notes.
//
// Usage: node apps/desktop/scripts/release-notes.mjs <tag>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TAG_PREFIX = "desktop-v";
// Same paths that trigger the installer build in desktop-build.yml.
const BUILD_PATHS = ["apps/desktop", "src/lib", "src/types", "public/logo.png"];
const FOOTER = "Existing installations update automatically.";

const tag = process.argv[2];
if (!tag || !tag.startsWith(TAG_PREFIX)) {
  console.error(`Usage: release-notes.mjs ${TAG_PREFIX}<version>`);
  process.exit(1);
}
const version = tag.slice(TAG_PREFIX.length);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function previousTag() {
  try {
    return git(
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      `${TAG_PREFIX}*`,
      `${tag}^`,
    );
  } catch {
    return null;
  }
}

function generatedNotes() {
  const previous = previousTag();
  if (!previous) return "Initial release.";
  const subjects = git(
    "log",
    "--format=%s",
    "--no-merges",
    `${previous}..${tag}`,
    "--",
    ...BUILD_PATHS,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    // Version bumps alone, such as "Desktop 0.1.4 (#50)", carry no change.
    .filter((line) => !/^Desktop \d+\.\d+\.\d+( \(#\d+\))?$/.test(line));
  const body = subjects.length
    ? subjects.map((line) => `- ${line}`).join("\n")
    : "- Maintenance release.";
  return `## Changes since ${previous.slice(TAG_PREFIX.length)}\n\n${body}`;
}

const curated = join(root, "apps", "desktop", "release-notes", `${version}.md`);
const notes = existsSync(curated)
  ? readFileSync(curated, "utf8").trim()
  : generatedNotes();

process.stdout.write(`${notes}\n\n${FOOTER}\n`);
