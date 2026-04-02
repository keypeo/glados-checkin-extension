const DEFAULT_CHECKIN_SELECTOR = "button:has(i.check.icon)";
const DEFAULTS = { customSelector: DEFAULT_CHECKIN_SELECTOR, autoCloseTab: true };
const $ = (id) => document.getElementById(id);

function normalizeSelector(selector) {
  const value = typeof selector === "string" ? selector.trim() : "";
  return value || DEFAULT_CHECKIN_SELECTOR;
}

function show(msg) {
  const el = $("status");
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 1800);
}

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  $("customSelector").value = normalizeSelector(cfg.customSelector);
  $("autoCloseTab").checked = !!cfg.autoCloseTab;
}

async function save() {
  const customSelector = normalizeSelector($("customSelector").value);
  const autoCloseTab = $("autoCloseTab").checked;

  await chrome.storage.sync.set({ customSelector, autoCloseTab });
  show("已保存");
}

async function testNow() {
  show("执行中...");
  const res = await chrome.runtime.sendMessage({ type: "RUN_NOW" });
  show(res?.ok ? "已触发签到" : "触发失败");
}

$("save").addEventListener("click", save);
$("testNow").addEventListener("click", testNow);
load();
