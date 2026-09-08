// 用真实原生窗口截图排版宣传画面；不修改截图中的应用内容。
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, targets, execute } from "./lib/cdp.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "artifacts/media-native-stage");
await mkdir(output, { recursive: true });
const recording = JSON.parse(
  await readFile(join(root, "artifacts/media-native/recording.json"), "utf8"),
);
if (recording.frames.length !== 6)
  throw new Error("请先完成原生演示录制，必须包含6帧");
const profile = await mkdtemp(join(tmpdir(), "mac-computer-use-stage-"));
const page = pathToFileURL(join(root, "assets/demo/native-stage.html")).href;
const browser = spawn(
  process.env.CHROME_BINARY ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    page,
  ],
  { stdio: "ignore" },
);
let client;
try {
  const deadline = Date.now() + 15000;
  let port, target;
  while (Date.now() < deadline) {
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!port) throw new Error("浏览器启动超时");
  while (Date.now() < deadline) {
    target = (await targets(`http://127.0.0.1:${port}`)).find(
      (t) => t.url === page,
    );
    if (target) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!target) throw new Error("演示页面不可用");
  client = await Client.connect(target.webSocketDebuggerUrl);
  await client.call("Emulation.setDeviceMetricsOverride", {
    width: 1100,
    height: 620,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await execute(client, {
    command: "wait",
    expression: 'typeof window.render === "function"',
  });
  let n = 0;
  for (let stage = 0; stage < 6; stage++) {
    const source =
      "data:image/png;base64," +
      (
        await readFile(
          join(root, "artifacts/media-native", recording.frames[stage].file),
        )
      ).toString("base64");
    for (let step = 0; step < 10; step++) {
      const progress = step === 0 ? 0.4 : step === 1 ? 0.85 : 1;
      await execute(client, {
        command: "eval",
        expression: `window.render(${stage},${JSON.stringify(source)},${progress})`,
      });
      const path = join(output, `frame-${String(n++).padStart(3, "0")}.png`);
      await rm(path, { force: true });
      await execute(client, { command: "shot", output: path });
    }
  }
  await copyFile(
    join(output, "frame-059.png"),
    join(root, "assets/native-demo-poster.png"),
  );
  console.log(
    JSON.stringify({
      status: "success",
      frames: n,
      fps: 5,
      source: "真实原生截图，外围排版与阶段说明",
    }),
  );
} finally {
  client?.close();
  browser.kill("SIGTERM");
  await Promise.race([
    new Promise((r) => browser.once("exit", r)),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  if (browser.exitCode === null) browser.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true });
}
