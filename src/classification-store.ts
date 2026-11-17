import { randomUUID } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, renameSync,
  unlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseClassificationEvents, type ClassificationEvent } from "./classification-approvals.ts";

const MAX_STORE_BYTES = 5 * 1024 * 1024;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Read one immutable snapshot; writers replace the file only after a complete write. */
function readStore(path: string, allowMissing: boolean): unknown {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (allowMissing && hasCode(error, "ENOENT")) return [];
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("CLASSIFICATION_STORE_NOT_REGULAR_FILE");
    if (stat.size > MAX_STORE_BYTES) throw new Error("CLASSIFICATION_STORE_TOO_LARGE");
    const bytes = readFileSync(fd);
    if (bytes.byteLength > MAX_STORE_BYTES) throw new Error("CLASSIFICATION_STORE_TOO_LARGE");
    try {
      return JSON.parse(bytes.toString("utf8")) as unknown;
    } catch {
      throw new Error("INVALID_CLASSIFICATION_STORE_JSON");
    }
  } finally {
    closeSync(fd);
  }
}

/** Protected operator file. Absence of configuration means no reviewed assignments. */
export function loadClassificationEvents(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
  now = new Date(),
): ClassificationEvent[] {
  const path = env.VEYGRIT_CLASSIFICATION_APPROVALS;
  return path ? parseClassificationEvents(readStore(path, false), now) : [];
}

function removeTemporary(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
}

/**
 * Append one reviewed event under an exclusive cooperative lock. A retry with the
 * same event is idempotent. Existing locks are never removed or assumed stale.
 * All existing events are validated before any replacement is prepared.
 */
export function appendClassificationEvent(
  path: string, event: unknown, now = new Date(),
): { events: ClassificationEvent[]; appended: boolean } {
  if (!path.trim()) throw new Error("INVALID_CLASSIFICATION_STORE_PATH");
  const destination = resolve(path);
  const lock = destination + ".lock";
  let lockFd: number;
  try {
    lockFd = openSync(lock, "wx", 0o600);
  } catch (error) {
    if (hasCode(error, "EEXIST")) throw new Error("CLASSIFICATION_STORE_LOCKED");
    throw error;
  }

  let temporary: string | undefined;
  let temporaryFd: number | undefined;
  try {
    const before = parseClassificationEvents(readStore(destination, true), now);
    const events = parseClassificationEvents([...before, event], now);
    if (events.length === before.length) return { events, appended: false };
    if (events.length !== before.length + 1) throw new Error("INVALID_CLASSIFICATION_STORE_APPEND");
    const contents = JSON.stringify(events, null, 2) + "\n";
    if (Buffer.byteLength(contents, "utf8") > MAX_STORE_BYTES)
      throw new Error("CLASSIFICATION_STORE_TOO_LARGE");
    temporary = join(dirname(destination), "." + basename(destination) + ".tmp-" + randomUUID());
    temporaryFd = openSync(temporary, "wx", 0o600);
    writeFileSync(temporaryFd, contents, "utf8");
    fsyncSync(temporaryFd);
    closeSync(temporaryFd);
    temporaryFd = undefined;
    renameSync(temporary, destination);
    temporary = undefined;
    return { events, appended: true };
  } finally {
    try {
      if (temporaryFd !== undefined) closeSync(temporaryFd);
      if (temporary !== undefined) removeTemporary(temporary);
    } finally {
      try {
        closeSync(lockFd);
      } finally {
        removeTemporary(lock);
      }
    }
  }
}
