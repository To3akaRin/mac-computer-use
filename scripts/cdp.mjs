#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  Client,
  targets,
  chooseTarget,
  execute,
  runBatch,
  CDPError,
  validateStep,
} from "./lib/cdp.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: node scripts/cdp.mjs <targets|snapshot|find|click|input|key|wait|shot|eval|batch> [--endpoint http://127.0.0.1:9222] --target <id|exact-title|exact-url> [--selector CSS] [--text TEXT] [--key Enter] [--expression JS] [--assert JS] [--output FILE] [--file BATCH.json] [--document TIME_ORIGIN] [--timeout MS] [--dry-run]",
  );
  process.exit(0);
}
let client,
  target = null;
const envelope = {
  status: "failed",
  target,
  channel: "cdp",
  error: null,
  evidence: [],
};
try {
  const [command, ...args] = process.argv.slice(2),
    opts = { command };
  const allowed = new Set([
    "endpoint",
    "target",
    "selector",
    "text",
    "key",
    "expression",
    "assert",
    "output",
    "file",
    "timeout",
    "document",
  ]);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    if (seen.has(args[i]))
      throw new CDPError(`Repeated option ${args[i]}`, "refused");
    seen.add(args[i]);
    if (args[i] === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (
      !args[i].startsWith("--") ||
      !allowed.has(args[i].slice(2)) ||
      i + 1 >= args.length ||
      args[i + 1].startsWith("--")
    )
      throw new CDPError(`Invalid option ${args[i]}`, "refused");
    opts[args[i].slice(2)] = args[++i];
  }
  opts.timeout = Number(opts.timeout ?? 5000);
  if (
    !Number.isFinite(opts.timeout) ||
    opts.timeout < 1 ||
    opts.timeout > 60000
  )
    throw new CDPError("timeout must be 1–60000 ms", "refused");
  if (command === "targets" || command === "batch") {
    const fields = new Set(
      command === "targets"
        ? ["command", "endpoint", "timeout"]
        : ["command", "endpoint", "target", "timeout", "file", "dryRun"],
    );
    for (const key of Object.keys(opts))
      if (!fields.has(key))
        throw new CDPError(`Invalid option ${key} for ${command}`, "refused");
  } else if (opts.file !== undefined)
    throw new CDPError("file is only valid for batch", "refused");
  const { endpoint, target: targetSelector, file, ...step } = opts;
  let batchSteps;
  if (command === "batch") {
    if (!file) throw new CDPError("file is required", "refused");
    batchSteps = JSON.parse(await readFile(file, "utf8"));
    if (
      !Array.isArray(batchSteps) ||
      batchSteps.length < 1 ||
      batchSteps.length > 100
    )
      throw new CDPError("batch must contain 1–100 steps", "refused");
    batchSteps.forEach(validateStep);
  } else if (command !== "targets") validateStep(step);
  const list = await targets(
    opts.endpoint ?? "http://127.0.0.1:9222",
    opts.timeout,
  );
  if (command === "targets") {
    envelope.status = "success";
    envelope.data = list.map(({ id, title, url }) => ({ id, title, url }));
  } else {
    target = chooseTarget(list, opts.target);
    envelope.target = { id: target.id, title: target.title, url: target.url };
    client = await Client.connect(target.webSocketDebuggerUrl, opts.timeout);
    const output =
      command === "batch"
        ? await runBatch(client, batchSteps, opts.dryRun)
        : await execute(client, step);
    Object.assign(envelope, output);
    if (command === "shot" && !opts.dryRun && output.status === "success")
      envelope.evidence.push(output.data.path);
  }
} catch (e) {
  envelope.status = e.status || "failed";
  envelope.error = { message: e.message, details: e.details ?? null };
} finally {
  client?.close();
}
console.log(JSON.stringify(envelope));
process.exitCode =
  envelope.status === "success" ? 0 : envelope.status === "failed" ? 1 : 2;
