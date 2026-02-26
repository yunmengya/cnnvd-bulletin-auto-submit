(function initLogger(global) {
  var app = global.__CNNVD_ASSISTANT__;
  if (!app) {
    return;
  }

  function storageGet(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, function (result) {
        resolve(result || {});
      });
    });
  }

  function storageSet(payload) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(payload, function () {
        resolve();
      });
    });
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes()) +
      ":" +
      pad(d.getSeconds())
    );
  }

  async function loadLogs() {
    var key = app.STORAGE_KEYS.logs;
    var result = await storageGet([key]);
    var logs = Array.isArray(result[key]) ? result[key] : [];
    app.state.logs = logs;
    return logs;
  }

  async function saveLogs(logs) {
    var key = app.STORAGE_KEYS.logs;
    app.state.logs = logs;
    await storageSet((function () {
      var payload = {};
      payload[key] = logs;
      return payload;
    })());
  }

  async function append(level, step, message, taskId) {
    var entry = {
      id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      level: level || "info",
      step: step || "system",
      message: message || "",
      taskId: taskId || ""
    };
    var logs = Array.isArray(app.state.logs) ? app.state.logs.slice() : [];
    logs.push(entry);
    if (logs.length > 3000) {
      logs = logs.slice(logs.length - 3000);
    }
    await saveLogs(logs);
    return entry;
  }

  function toCSV(logs) {
    var list = Array.isArray(logs) ? logs : [];
    var headers = ["time", "level", "taskId", "step", "message"];
    var lines = [headers.join(",")];

    list.forEach(function (row) {
      var cells = [
        formatTime(row.ts),
        row.level || "",
        row.taskId || "",
        row.step || "",
        row.message || ""
      ].map(function (cell) {
        var text = String(cell).replace(/"/g, '""');
        return '"' + text + '"';
      });
      lines.push(cells.join(","));
    });

    return lines.join("\n");
  }

  function downloadCSV(fileName, csvText) {
    var blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  app.logger = {
    formatTime: formatTime,
    loadLogs: loadLogs,
    saveLogs: saveLogs,
    append: append,
    toCSV: toCSV,
    downloadCSV: downloadCSV
  };
})(window);
