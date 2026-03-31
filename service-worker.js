const CHECKIN_URL = "https://glados.cloud/console/checkin";
const STARTUP_CHECKIN_DATE_KEY = "startupCheckinDate";
const DEFAULTS = {
  customSelector: "",
  autoCloseTab: true
};

async function getConfig() {
  return await chrome.storage.sync.get(DEFAULTS);
}

function getTodayLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function waitTabLoaded(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("页面加载超时"));
    }, timeoutMs);

    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab?.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    });
  });
}

async function clickCheckin(tabId, customSelector) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (selectorFromOptions) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      const fallbackSelectors = [
        "button#checkin",
        "button.checkin",
        "button[class*='check']",
        "a[class*='check']",
        "[data-testid*='check']",
        "[id*='check']",
        "[class*='checkin']"
      ];

      const findAndClick = (selector) => {
        if (!selector) return null;
        const el = document.querySelector(selector);
        if (!el) return null;
        el.click();
        return `selector:${selector}`;
      };

      const findByTextAndClick = () => {
        const keys = ["签到", "check in", "check-in", "checkin"];
        const list = Array.from(
          document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']")
        );

        for (const el of list) {
          const text = (el.innerText || el.textContent || el.value || "").trim().toLowerCase();
          if (keys.some((k) => text.includes(k))) {
            el.click();
            return "text";
          }
        }
        return null;
      };

      for (let i = 0; i < 30; i++) {
        const byCustom = findAndClick(selectorFromOptions);
        if (byCustom) return { ok: true, by: byCustom };

        for (const selector of fallbackSelectors) {
          const bySel = findAndClick(selector);
          if (bySel) return { ok: true, by: bySel };
        }

        const byText = findByTextAndClick();
        if (byText) return { ok: true, by: byText };

        await sleep(500);
      }

      return { ok: false, by: "not_found" };
    },
    args: [customSelector]
  });

  return result;
}

async function runCheckin(trigger = "manual") {
  const { customSelector, autoCloseTab } = await getConfig();
  let tabId = null;

  try {
    const tab = await chrome.tabs.create({ url: CHECKIN_URL, active: false });
    tabId = tab.id;
    await waitTabLoaded(tabId);

    const result = await clickCheckin(tabId, customSelector);
    await chrome.storage.local.set({
      lastRunAt: Date.now(),
      lastTrigger: trigger,
      lastResult: result
    });
    return { ok: true, result };
  } catch (error) {
    const failedResult = { ok: false, by: "error", error: String(error?.message || error) };
    await chrome.storage.local.set({
      lastRunAt: Date.now(),
      lastTrigger: trigger,
      lastResult: failedResult
    });
    return { ok: false, result: failedResult };
  } finally {
    if (autoCloseTab && tabId) {
      setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 8000);
    }
  }
}

async function runStartupCheckinIfNeeded() {
  const today = getTodayLocalDateKey();
  const data = await chrome.storage.local.get(STARTUP_CHECKIN_DATE_KEY);
  const lastDate = data?.[STARTUP_CHECKIN_DATE_KEY];

  if (lastDate === today) {
    return { skipped: true, reason: "already_checked_today" };
  }

  await chrome.storage.local.set({ [STARTUP_CHECKIN_DATE_KEY]: today });
  return await runCheckin("startup");
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set({ ...DEFAULTS, ...current });
});

chrome.runtime.onStartup.addListener(() => {
  runStartupCheckinIfNeeded().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "RUN_NOW") {
    runCheckin("manual")
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});
