const CHECKIN_URL = "https://glados.cloud/console/checkin";
const STARTUP_CHECKIN_DATE_KEY = "startupCheckinDate";
const DEFAULT_CHECKIN_SELECTOR = "button:has(i.check.icon)";
const DEFAULTS = {
  customSelector: DEFAULT_CHECKIN_SELECTOR,
  autoCloseTab: true
};

let startupCheckinPromise = null;

async function getConfig() {
  const config = await chrome.storage.sync.get(DEFAULTS);
  return {
    ...config,
    customSelector: normalizeSelector(config.customSelector)
  };
}

function normalizeSelector(selector) {
  const value = typeof selector === "string" ? selector.trim() : "";
  return value || DEFAULT_CHECKIN_SELECTOR;
}

function getTodayLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function saveLastRun(trigger, result) {
  await chrome.storage.local.set({
    lastRunAt: Date.now(),
    lastTrigger: trigger,
    lastResult: result
  });
}

async function markCheckinSuccessToday() {
  await chrome.storage.local.set({
    [STARTUP_CHECKIN_DATE_KEY]: getTodayLocalDateKey()
  });
}

async function getTargetWindowId() {
  const windows = await chrome.windows.getAll({
    populate: false,
    windowTypes: ["normal"]
  });

  if (!windows.length) {
    return null;
  }

  const targetWindow =
    windows.find((win) => win.focused) ||
    windows.find((win) => win.state !== "minimized") ||
    windows[0];

  return targetWindow?.id ?? null;
}

function waitTabLoaded(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("page_load_timeout"));
    }, timeoutMs);

    function finish() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }

    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") {
        finish();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        return;
      }

      if (tab?.status === "complete") {
        finish();
      }
    });
  });
}

async function clickCheckin(tabId, customSelector) {
  const injections = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (selectorFromOptions, defaultSelector) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const fallbackSelectors = [
        defaultSelector,
        "button#checkin",
        "button.checkin",
        "button[class*='check']",
        "button[class*='check-in']",
        "a[class*='check']",
        "[data-testid*='check']",
        "[id*='check']",
        "[class*='checkin']",
        "[class*='check-in']"
      ];

      const clickElement = (el, matchedBy) => {
        if (!el) {
          return null;
        }

        if (typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        }

        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

        if (typeof el.click === "function") {
          el.click();
        }

        return matchedBy;
      };

      const findAndClick = (selector) => {
        if (!selector) {
          return null;
        }

        const el = document.querySelector(selector);
        return clickElement(el, `selector:${selector}`);
      };

      const findByTextAndClick = () => {
        const keys = ["\u7b7e\u5230", "check in", "check-in", "checkin"];
        const list = Array.from(
          document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']")
        );

        for (const el of list) {
          const text = (el.innerText || el.textContent || el.value || "").trim().toLowerCase();
          if (keys.some((key) => text.includes(key))) {
            return clickElement(el, "text");
          }
        }

        return null;
      };

      for (let attempt = 0; attempt < 60; attempt += 1) {
        const byCustom = findAndClick(selectorFromOptions);
        if (byCustom) {
          return { ok: true, by: byCustom };
        }

        for (const selector of fallbackSelectors) {
          const bySelector = findAndClick(selector);
          if (bySelector) {
            return { ok: true, by: bySelector };
          }
        }

        const byText = findByTextAndClick();
        if (byText) {
          return { ok: true, by: byText };
        }

        await sleep(500);
      }

      return { ok: false, by: "not_found" };
    },
    args: [customSelector, DEFAULT_CHECKIN_SELECTOR]
  });

  return injections?.[0]?.result || { ok: false, by: "script_no_result" };
}

async function runCheckin(trigger = "manual") {
  const { customSelector, autoCloseTab } = await getConfig();
  let tabId = null;

  try {
    const windowId = await getTargetWindowId();
    if (!windowId) {
      throw new Error("no_normal_window");
    }

    const tab = await chrome.tabs.create({
      windowId,
      url: CHECKIN_URL,
      active: true
    });

    tabId = tab?.id ?? null;
    if (!tabId) {
      throw new Error("tab_create_failed");
    }

    await waitTabLoaded(tabId);

    const result = await clickCheckin(tabId, customSelector);
    await saveLastRun(trigger, result);

    if (result?.ok) {
      await markCheckinSuccessToday();
    }

    return { ok: !!result?.ok, result };
  } catch (error) {
    const failedResult = {
      ok: false,
      by: "error",
      error: String(error?.message || error)
    };

    await saveLastRun(trigger, failedResult);
    return { ok: false, result: failedResult };
  } finally {
    if (autoCloseTab && tabId) {
      setTimeout(() => {
        chrome.tabs.remove(tabId).catch(() => {});
      }, 8000);
    }
  }
}

async function runStartupCheckinIfNeeded(source = "startup") {
  if (startupCheckinPromise) {
    return startupCheckinPromise;
  }

  startupCheckinPromise = (async () => {
    const today = getTodayLocalDateKey();
    const data = await chrome.storage.local.get(STARTUP_CHECKIN_DATE_KEY);
    const lastDate = data?.[STARTUP_CHECKIN_DATE_KEY];

    if (lastDate === today) {
      return { skipped: true, reason: "already_checked_today" };
    }

    return runCheckin(`startup:${source}`);
  })();

  try {
    return await startupCheckinPromise;
  } finally {
    startupCheckinPromise = null;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set({
    ...DEFAULTS,
    ...current,
    customSelector: normalizeSelector(current.customSelector)
  });
});

chrome.runtime.onStartup.addListener(() => {
  runStartupCheckinIfNeeded("onStartup").catch(() => {});
});

chrome.windows.onCreated.addListener((window) => {
  if (window.type !== "normal") {
    return;
  }

  runStartupCheckinIfNeeded("windowCreated").catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "RUN_NOW") {
    runCheckin("manual")
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
