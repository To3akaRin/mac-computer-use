import { writeFile } from "node:fs/promises";

export class CDPError extends Error {
  constructor(message, status = "failed", details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export function loopbackURL(value, protocols = ["http:", "ws:"]) {
  const url = new URL(value);
  if (
    !protocols.includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new CDPError(
      "Only loopback debugging endpoints without credentials are allowed",
      "refused",
    );
  return url;
}
export async function targets(endpoint, timeout = 5000) {
  const url = new URL("/json/list", loopbackURL(endpoint, ["http:"]));
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    redirect: "error",
  });
  if (!response.ok)
    throw new CDPError(`Target discovery HTTP ${response.status}`);
  const list = await response.json();
  if (!Array.isArray(list))
    throw new CDPError("Invalid target discovery response");
  return list.filter((t) => t.type === "page");
}
export function chooseTarget(list, selector) {
  if (!selector) throw new CDPError("--target is required", "refused");
  const exact = list.filter((t) => t.id === selector);
  const matching = exact.length
    ? exact
    : list.filter((t) => t.title === selector || t.url === selector);
  if (matching.length !== 1)
    throw new CDPError(
      matching.length ? "ambiguous target" : "target not found",
      "refused",
      matching.map(({ id, title, url }) => ({ id, title, url })),
    );
  return matching[0];
}
export class Client {
  constructor(socket, timeout) {
    this.socket = socket;
    this.timeout = timeout;
    this.nextID = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const p = this.pending.get(data.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(data.id);
      if (data.error) p.reject(new CDPError(data.error.message));
      else p.resolve(data.result);
    });
    socket.addEventListener("close", () =>
      this.failAll("CDP connection closed"),
    );
    socket.addEventListener("error", () =>
      this.failAll("CDP connection error"),
    );
  }
  static async connect(address, timeout = 5000) {
    const socket = new WebSocket(loopbackURL(address, ["ws:"]));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new CDPError("CDP connection timed out"));
      }, timeout);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new CDPError("CDP connection failed"));
        },
        { once: true },
      );
    });
    return new Client(socket, timeout);
  }
  failAll(message) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new CDPError(message, "unknown"));
    }
    this.pending.clear();
  }
  call(method, params = {}, timeout = this.timeout) {
    const id = ++this.nextID;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CDPError(`${method} timed out`, "unknown"));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new CDPError(e.message, "unknown"));
      }
    });
  }
  close() {
    this.socket.close();
  }
}
async function evaluate(
  client,
  expression,
  timeout = client.timeout ?? 5000,
  readOnly = false,
) {
  const r = await client.call(
    "Runtime.evaluate",
    {
      expression,
      returnByValue: true,
      awaitPromise: !readOnly,
      throwOnSideEffect: readOnly,
      timeout,
    },
    timeout,
  );
  if (r.exceptionDetails)
    throw new CDPError(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result?.value;
}
async function verify(client, expression) {
  try {
    return await evaluate(client, expression, undefined, true);
  } catch (e) {
    throw new CDPError(e.message, "unknown");
  }
}
const mutation = new Set(["click", "input", "key", "eval"]);
const result = (status, data) => ({ status, data });
function required(value, name) {
  if (typeof value !== "string" || !value.length)
    throw new CDPError(`${name} is required`, "refused");
  return value;
}
function elementScript(selector, body) {
  return `(()=>{const elements=document.querySelectorAll(${JSON.stringify(required(selector, "selector"))});if(elements.length!==1)return {count:elements.length};const el=elements[0];${body}})()`;
}
function checkElement(data) {
  if (data?.count !== 1)
    throw new CDPError(
      "selector must match exactly one element",
      "refused",
      data,
    );
}
const commandFields = {
  snapshot: [],
  find: ["selector"],
  click: ["selector", "assert"],
  input: ["selector", "text"],
  key: ["selector", "key", "assert"],
  eval: ["expression"],
  wait: ["expression"],
  shot: ["output"],
};
const supportedKeys = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "ArrowLeft",
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
]);
export function validateStep(step) {
  if (!step || typeof step !== "object" || Array.isArray(step))
    throw new CDPError("step must be an object", "refused");
  const fields = commandFields[step.command];
  if (!fields)
    throw new CDPError(`Unknown command: ${step.command}`, "refused");
  const allowed = new Set([
    "command",
    "dryRun",
    "timeout",
    "document",
    ...fields,
  ]);
  for (const key of Object.keys(step))
    if (!allowed.has(key))
      throw new CDPError(`Invalid step option ${key}`, "refused");
  for (const key of fields) {
    if (key === "assert" && step[key] === undefined) continue;
    if (key === "text" && typeof step.text === "string") continue;
    required(step[key], key);
  }
  if (step.command === "key" && !supportedKeys.has(step.key))
    throw new CDPError("Unsupported key", "refused");
  if (step.dryRun !== undefined && typeof step.dryRun !== "boolean")
    throw new CDPError("dryRun must be boolean", "refused");
  if (
    step.timeout !== undefined &&
    (typeof step.timeout !== "number" ||
      !Number.isFinite(step.timeout) ||
      step.timeout < 1 ||
      step.timeout > 60000)
  )
    throw new CDPError("timeout must be 1–60000 ms", "refused");
}
export async function execute(client, step) {
  validateStep(step);
  let dispatched = false;
  const tracked = {
    timeout: client.timeout,
    async call(method, params, timeout) {
      if (
        method.startsWith("Input.") ||
        (method === "Runtime.evaluate" &&
          (step.command === "eval" || params.expression.includes("el.focus()")))
      )
        dispatched = true;
      return client.call(method, params, timeout);
    },
  };
  try {
    return await executeStep(tracked, step);
  } catch (error) {
    if (dispatched)
      throw new CDPError(error.message, "unknown", {
        dispatched: true,
        cause: error.details ?? null,
      });
    throw error;
  }
}
async function executeStep(client, step) {
  const { command } = step;
  if (
    step.timeout !== undefined &&
    (typeof step.timeout !== "number" ||
      !Number.isFinite(step.timeout) ||
      step.timeout < 1 ||
      step.timeout > 60000)
  )
    throw new CDPError("timeout must be 1–60000 ms", "refused");
  if (mutation.has(command) && step.dryRun)
    return result("success", {
      dryRun: true,
      command,
      selector: step.selector,
    });
  if (command === "wait" && step.dryRun)
    return result("success", { dryRun: true, command });
  if (step.document !== undefined && mutation.has(command)) {
    const current = await evaluate(
      client,
      "performance.timeOrigin",
      undefined,
      true,
    );
    if (String(current) !== String(step.document))
      throw new CDPError("Document changed; take a fresh snapshot", "refused");
  }
  if (command === "snapshot")
    return result(
      "success",
      await evaluate(
        client,
        `({document:performance.timeOrigin,url:location.href,title:document.title,text:document.body.innerText,html:document.documentElement.outerHTML})`,
      ),
    );
  if (command === "find")
    return result(
      "success",
      await evaluate(
        client,
        `Array.from(document.querySelectorAll(${JSON.stringify(required(step.selector, "selector"))})).map((el,index)=>({index,tag:el.tagName,text:el.textContent,value:el.value,rect:el.getBoundingClientRect().toJSON()}))`,
      ),
    );
  if (command === "eval")
    return result(
      "success",
      await evaluate(client, required(step.expression, "expression")),
    );
  if (command === "wait") {
    const expression = required(step.expression, "expression"),
      deadline = Date.now() + (step.timeout ?? 5000);
    while (Date.now() < deadline) {
      if (
        await evaluate(
          client,
          expression,
          Math.max(1, deadline - Date.now()),
          true,
        )
      )
        return result("success", { satisfied: true });
      await new Promise((r) =>
        setTimeout(r, Math.min(100, Math.max(0, deadline - Date.now()))),
      );
    }
    throw new CDPError("Condition wait timed out");
  }
  if (command === "shot") {
    if (step.dryRun)
      return result("success", { dryRun: true, output: step.output });
    const output = required(step.output, "output");
    const data = await client.call("Page.captureScreenshot", { format: "png" });
    await writeFile(output, Buffer.from(data.data, "base64"), { flag: "wx" });
    return result("success", { path: output });
  }
  if (command === "click") {
    const data = await evaluate(
      client,
      elementScript(
        step.selector,
        `const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(el.disabled||r.width<=0||r.height<=0||!hit||!(hit===el||el.contains(hit)))return {count:1,blocked:true};return {count:1,x,y};`,
      ),
    );
    checkElement(data);
    if (data.blocked)
      throw new CDPError("element disabled, hidden or covered", "refused");
    // 直接派发点击，不额外触发可能改变布局的 hover 事件。
    await client.call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: data.x,
      y: data.y,
      button: "left",
      clickCount: 1,
    });
    await client.call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: data.x,
      y: data.y,
      button: "left",
      clickCount: 1,
    });
    return step.assert
      ? result((await verify(client, step.assert)) ? "success" : "unknown", {
          assertion: step.assert,
        })
      : result("unknown", {
          dispatched: true,
          reason: "Provide --assert to verify the intended outcome",
        });
  }
  if (command === "input") {
    if (typeof step.text !== "string")
      throw new CDPError("text is required", "refused");
    const data = await evaluate(
      client,
      elementScript(
        step.selector,
        `if(el.disabled||el.readOnly||(!['INPUT','TEXTAREA'].includes(el.tagName)&&!el.isContentEditable))return {count:1,blocked:true};el.focus();if(document.activeElement!==el)return {count:1,blocked:true};if(el.isContentEditable){const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}else{try{el.select();}catch{return {count:1,blocked:true};}}return {count:1};`,
      ),
    );
    checkElement(data);
    if (data.blocked) throw new CDPError("element not editable", "refused");
    await client.call("Input.insertText", { text: step.text });
    let observed;
    try {
      observed = await evaluate(
        client,
        elementScript(
          step.selector,
          `return {count:1,value:el.isContentEditable?el.textContent:el.value};`,
        ),
      );
    } catch (e) {
      throw new CDPError(e.message, "unknown");
    }
    return result(
      observed?.count === 1 && observed.value === step.text
        ? "success"
        : "unknown",
      { value: observed?.value },
    );
  }
  if (command === "key") {
    const key = required(step.key, "key");
    const keys = {
      Enter: ["Enter", 13],
      Tab: ["Tab", 9],
      Escape: ["Escape", 27],
      Backspace: ["Backspace", 8],
      ArrowLeft: ["ArrowLeft", 37],
      ArrowUp: ["ArrowUp", 38],
      ArrowRight: ["ArrowRight", 39],
      ArrowDown: ["ArrowDown", 40],
    };
    if (!keys[key])
      throw new CDPError(
        "Unsupported key; use Enter, Tab, Escape, Backspace or Arrow keys",
        "refused",
      );
    const data = await evaluate(
      client,
      elementScript(
        step.selector,
        `el.focus();return {count:1,focused:document.activeElement===el};`,
      ),
    );
    checkElement(data);
    if (!data.focused)
      throw new CDPError("element could not receive focus", "refused");
    const params = {
      key,
      code: keys[key][0],
      windowsVirtualKeyCode: keys[key][1],
    };
    await client.call("Input.dispatchKeyEvent", { type: "keyDown", ...params });
    await client.call("Input.dispatchKeyEvent", { type: "keyUp", ...params });
    return step.assert
      ? result((await verify(client, step.assert)) ? "success" : "unknown", {
          assertion: step.assert,
        })
      : result("unknown", { dispatched: true });
  }
  throw new CDPError(`Unknown command: ${command}`, "refused");
}
export async function runBatch(client, steps, dryRun = false) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 100)
    throw new CDPError("batch must contain 1–100 steps", "refused");
  for (const step of steps) validateStep(step);
  const outputs = [];
  const evidence = [];
  for (const step of steps) {
    try {
      const r = await execute(client, {
        ...step,
        dryRun: dryRun || step.dryRun,
      });
      outputs.push(r);
      if (
        step.command === "shot" &&
        !dryRun &&
        !step.dryRun &&
        r.status === "success"
      )
        evidence.push(r.data.path);
      if (r.status !== "success")
        return { status: r.status, steps: outputs, evidence };
    } catch (e) {
      outputs.push({ status: e.status || "failed", error: e.message });
      return { status: e.status || "failed", steps: outputs, evidence };
    }
  }
  return { status: "success", steps: outputs, evidence };
}
