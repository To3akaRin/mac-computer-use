import test from "node:test";
import assert from "node:assert/strict";
import {
  loopbackURL,
  chooseTarget,
  execute,
  runBatch,
  CDPError,
} from "../scripts/lib/cdp.mjs";

test("调试地址只允许回环地址", () => {
  for (const url of [
    "http://127.0.0.1:9222",
    "ws://[::1]:9222/devtools/page/1",
    "http://localhost:9222",
  ])
    assert.ok(loopbackURL(url));
  for (const url of [
    "http://example.com",
    "ws://192.168.1.1",
    "file:///tmp/a",
    "http://user:pass@localhost",
  ])
    assert.throws(() => loopbackURL(url), CDPError);
});
test("明确目标并拒绝歧义", () => {
  const list = [
    { id: "a", title: "demo", url: "http://localhost/a" },
    { id: "b", title: "demo", url: "http://localhost/b" },
  ];
  assert.equal(chooseTarget(list, "a").id, "a");
  assert.throws(() => chooseTarget(list), /target/);
  assert.throws(() => chooseTarget(list, "demo"), /ambiguous/);
});
test("预演所有写操作都不调用 CDP", async () => {
  const client = {
    call() {
      throw new Error("side effect");
    },
  };
  for (const command of ["click", "input", "key", "eval"])
    assert.equal(
      (
        await execute(client, {
          command,
          ...{
            click: { selector: "#x" },
            input: { selector: "#x", text: "中文" },
            key: { selector: "#x", key: "Enter" },
            eval: { expression: "1" },
          }[command],
          dryRun: true,
        })
      ).status,
      "success",
    );
});
test("批处理遇未知结果停止且不重放", async () => {
  let calls = 0;
  const client = {
    async call() {
      calls++;
      return { result: { value: { count: 1 } } };
    },
  };
  const result = await runBatch(client, [
    { command: "click", selector: "#button" },
    { command: "input", selector: "#input", text: "不应输入" },
  ]);
  assert.equal(result.status, "unknown");
  assert.equal(result.steps.length, 1);
  assert.equal(calls, 3);
});
test("输入需要状态读回确认", async () => {
  const client = {
    async call() {
      return { result: { value: { count: 1, value: "错误" } } };
    },
  };
  assert.equal(
    (
      await execute(client, {
        command: "input",
        selector: "#input",
        text: "中文",
      })
    ).status,
    "unknown",
  );
});
test("元素匹配歧义拒绝写入", async () => {
  const client = {
    async call() {
      return { result: { value: { count: 2 } } };
    },
  };
  await assert.rejects(
    execute(client, { command: "click", selector: "button" }),
    /exactly one/,
  );
});
test("等待有明确截止时间", async () => {
  const client = {
    async call() {
      return { result: { value: false } };
    },
  };
  await assert.rejects(
    execute(client, { command: "wait", expression: "false", timeout: 20 }),
    /timed out/,
  );
});

test("发现的远程 websocket 地址也被拒绝", async () => {
  const { Client } = await import("../scripts/lib/cdp.mjs");
  await assert.rejects(
    Client.connect("ws://example.com/devtools/page/1"),
    /loopback/,
  );
});
test("CDP 传输超时标为未知结果", async () => {
  const { Client } = await import("../scripts/lib/cdp.mjs");
  const socket = { addEventListener() {}, send() {}, close() {} };
  const client = new Client(socket, 15);
  await assert.rejects(
    client.call("Input.dispatchKeyEvent"),
    (e) => e.status === "unknown",
  );
  assert.equal(client.pending.size, 0);
});
test("输入在写命令之后独立读回", async () => {
  let calls = 0;
  const client = {
    async call() {
      calls++;
      return {
        result: {
          value: { count: 1, value: calls === 1 ? "中文" : "页面改写" },
        },
      };
    },
  };
  assert.equal(
    (
      await execute(client, {
        command: "input",
        selector: "#input",
        text: "中文",
      })
    ).status,
    "unknown",
  );
  assert.equal(calls, 3);
});
test("截图预演不生成文件", async () => {
  const client = {
    call() {
      throw Error("must not capture");
    },
  };
  assert.equal(
    (
      await execute(client, {
        command: "shot",
        output: "/never-created.png",
        dryRun: true,
      })
    ).status,
    "success",
  );
});
test("批量 timeout 非有限值与字符串被拒绝", async () => {
  for (const timeout of [Infinity, "5000", 0, 60001])
    await assert.rejects(
      execute({}, { command: "wait", expression: "true", timeout }),
      /timeout/,
    );
});
test("wait 预演不会运行用户表达式", async () => {
  const client = {
    call() {
      throw Error("must not execute");
    },
  };
  assert.equal(
    (
      await execute(client, {
        command: "wait",
        expression: "document.body.remove()",
        dryRun: true,
      })
    ).status,
    "success",
  );
});
test("写后断言错误属于结果未知", async () => {
  const client = {
    async call(method, params) {
      if (params?.throwOnSideEffect)
        return { exceptionDetails: { text: "side effect" } };
      return { result: { value: { count: 1, x: 1, y: 1 } } };
    },
  };
  await assert.rejects(
    execute(client, {
      command: "click",
      selector: "#save",
      assert: "throw Error()",
    }),
    (e) => e.status === "unknown",
  );
});
test("旧文档标识拒绝写操作", async () => {
  const client = {
    async call() {
      return { result: { value: 2 } };
    },
  };
  await assert.rejects(
    execute(client, {
      command: "input",
      selector: "#name",
      text: "中文",
      document: 1,
    }),
    /Document changed/,
  );
});

test("预演先校验必要参数和支持的键", async () => {
  for (const step of [
    { command: "input" },
    { command: "click" },
    { command: "eval" },
    { command: "shot" },
    { command: "key", selector: "#x", key: "Bogus" },
  ]) {
    await assert.rejects(
      execute({}, { ...step, dryRun: true }),
      (e) => e.status === "refused",
    );
  }
});
test("批处理先拒绝所有未知字段不发出前面的写操作", async () => {
  const client = {
    call() {
      throw Error("must not dispatch");
    },
  };
  await assert.rejects(
    runBatch(client, [
      { command: "click", selector: "#x" },
      { command: "input", selector: "#x", text: "中文", dryrun: true },
    ]),
    /Invalid step option/,
  );
});
test("鼠标释放协议错误保留已派发的未知结果", async () => {
  const client = {
    async call(method, params) {
      if (params.type === "mouseReleased")
        throw new CDPError("protocol failed");
      return { result: { value: { count: 1, x: 1, y: 1 } } };
    },
  };
  await assert.rejects(
    execute(client, { command: "click", selector: "#x" }),
    (e) => e.status === "unknown" && e.details.dispatched === true,
  );
});
test("批处理截图证据聚合", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "cdp-evidence-"));
  try {
    const output = join(dir, "shot.png");
    const client = {
      async call() {
        return { data: Buffer.from("fixture").toString("base64") };
      },
    };
    assert.deepEqual(
      (await runBatch(client, [{ command: "shot", output }])).evidence,
      [output],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("CLI 重复和未知选项在连接前拒绝", async () => {
  const { spawnSync } = await import("node:child_process");
  for (const args of [
    ["input", "--dry-run", "--dry-run"],
    ["targets", "--bogus", "x"],
    ["input", "--text", "--dry-run"],
  ]) {
    const result = spawnSync(process.execPath, ["scripts/cdp.mjs", ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 2, result.stdout);
    assert.equal(JSON.parse(result.stdout).status, "refused");
  }
});
