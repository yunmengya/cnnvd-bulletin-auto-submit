chrome.runtime.onInstalled.addListener(function () {
  console.log("[CNNVD Assistant] installed");
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) {
    return;
  }

  if (msg.type === "PING") {
    sendResponse({ ok: true, ts: Date.now() });
  }
});
