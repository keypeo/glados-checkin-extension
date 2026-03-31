const runBtn = document.getElementById("run");
const openOptions = document.getElementById("openOptions");
const statusEl = document.getElementById("status");

function fmt(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return "-"; }
}

async function refreshStatus() {
  const { lastRunAt, lastResult, lastTrigger } = await chrome.storage.local.get(["lastRunAt", "lastResult", "lastTrigger"]);
  if (!lastRunAt) {
    statusEl.textContent = "暂无签到记录";
    return;
  }

  const triggerLabel = lastTrigger === "startup" ? "开机自动" : "手动";
  const ok = lastResult?.ok ? "成功" : "失败";
  const by = lastResult?.by || "-";
  statusEl.textContent = `最近: ${fmt(lastRunAt)} | ${triggerLabel} | ${ok} | ${by}`;
}

runBtn.addEventListener("click", async () => {
  runBtn.disabled = true;
  statusEl.textContent = "执行中...";
  try {
    await chrome.runtime.sendMessage({ type: "RUN_NOW" });
    setTimeout(refreshStatus, 1200);
  } finally {
    setTimeout(() => { runBtn.disabled = false; }, 1000);
  }
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refreshStatus();
