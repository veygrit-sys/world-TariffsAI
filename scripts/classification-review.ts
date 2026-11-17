import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClassificationApproval, createClassificationRevocation } from "../src/classification-approvals.ts";
import { loadClassificationCatalog } from "../src/classification-catalog.ts";
import { appendClassificationEvent, loadClassificationEvents } from "../src/classification-store.ts";
import { loadDataset } from "../src/dataset.ts";
import { InputError } from "../src/schema.ts";

/** Offline operator command. HTTP callers cannot issue their own approvals. */
export function reviewClassificationCommand(args: readonly string[], env: Readonly<NodeJS.ProcessEnv> = process.env) {
  const [command, inputPath, storePath, referenceTime] = args;
  if (args.length < 3 || args.length > 4 || !["approve", "revoke"].includes(command ?? "") || !inputPath || !storePath)
    throw new Error("USAGE: classification:review approve|revoke REQUEST_JSON STORE_JSON [ISO_TIME]");
  const now = referenceTime ? new Date(referenceTime) : new Date();
  if (!Number.isFinite(now.getTime())) throw new InputError([{ path: "/referenceTime", code: "INVALID_DATE_TIME" }]);
  const input: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
  const event = command === "approve"
    ? createClassificationApproval(input, loadClassificationCatalog(env), loadDataset(), now)
    : createClassificationRevocation(input, loadClassificationEvents({ ...env, VEYGRIT_CLASSIFICATION_APPROVALS: storePath }, now), now);
  const result = appendClassificationEvent(storePath, event, now);
  return { eventId: event.id, eventType: event.type, appended: result.appended, eventCount: result.events.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(reviewClassificationCommand(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(JSON.stringify(error instanceof InputError
      ? { error: "CLASSIFICATION_REVIEW_REJECTED", issues: error.issues }
      : { error: "CLASSIFICATION_REVIEW_FAILED" }));
    process.exitCode = 1;
  }
}
