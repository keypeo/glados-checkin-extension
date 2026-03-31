const DEFAULTS = { customSelector: "", autoCloseTab: true };
const $ = (id) => document.getElementById(id);

function show(msg) {
  const el = $("status");
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 1800);
}

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  $("customSelector").value = cfg.customSelector || "";
  $("autoCloseTab").checked = !!cfg.autoCloseTab;
}

async function save() {
  const customSelector = $("customSelector").value.trim();
  const autoCloseTab = $("autoCloseTab").checked;

  await chrome.storage.sync.set({ customSelector, autoCloseTab });
  show("已保存");
}

async function testNow() {
  show("执行中...");
  try {
    const res = await chrome.runtime.sendMessage({ type: "RUN_NOW" });
    show(res?.ok ? "已触发签到" : "触发失败");
  } catch (e) {
    show("触发失败");
  }
}

$("save").addEventListener("click", save);
$("testNow").addEventListener("click", testNow);
load();
