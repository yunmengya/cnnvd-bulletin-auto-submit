(function initQueue(global) {
  var app = global.__CNNVD_ASSISTANT__;
  if (!app) {
    return;
  }

  var DB_NAME = "cnnvd_assistant_db";
  var DB_VERSION = 1;
  var BLOB_STORE = "zip_blobs";

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
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

  function mergeSettings(nextSettings) {
    var current = app.state.settings || app.DEFAULT_SETTINGS;
    return Object.assign({}, app.DEFAULT_SETTINGS, current, nextSettings || {});
  }

  function mergeRuntime(nextRuntime) {
    var current = app.state.runtime || app.DEFAULT_RUNTIME;
    var merged = Object.assign({}, app.DEFAULT_RUNTIME, current, nextRuntime || {});
    merged.importStats = Object.assign(
      {},
      app.DEFAULT_RUNTIME.importStats,
      current.importStats || {},
      (nextRuntime && nextRuntime.importStats) || {}
    );
    return merged;
  }

  async function loadState() {
    var keys = [
      app.STORAGE_KEYS.settings,
      app.STORAGE_KEYS.tasks,
      app.STORAGE_KEYS.runtime,
      app.STORAGE_KEYS.logs
    ];
    var result = await storageGet(keys);

    app.state.settings = mergeSettings(result[app.STORAGE_KEYS.settings]);
    app.state.tasks = Array.isArray(result[app.STORAGE_KEYS.tasks])
      ? result[app.STORAGE_KEYS.tasks]
      : [];
    app.state.runtime = mergeRuntime(result[app.STORAGE_KEYS.runtime]);
    app.state.logs = Array.isArray(result[app.STORAGE_KEYS.logs])
      ? result[app.STORAGE_KEYS.logs]
      : [];

    if (app.state.runtime.running) {
      app.state.runtime.running = false;
      app.state.runtime.paused = false;
      app.state.runtime.currentTaskId = "";
      await saveRuntime(app.state.runtime);
    }

    var normalized = false;
    var normalizedTasks = (app.state.tasks || []).map(function (task) {
      if (task.status === "running" || task.status === "paused") {
        normalized = true;
        return Object.assign({}, task, {
          status: "pending",
          reason: "",
          updatedAt: Date.now()
        });
      }
      return task;
    });
    if (normalized) {
      await saveTasks(normalizedTasks);
    }

    return clone(app.state);
  }

  async function saveSettings(nextSettings) {
    var merged = mergeSettings(nextSettings);
    app.state.settings = merged;
    var payload = {};
    payload[app.STORAGE_KEYS.settings] = merged;
    await storageSet(payload);
    return merged;
  }

  async function saveRuntime(nextRuntime) {
    var merged = mergeRuntime(nextRuntime);
    app.state.runtime = merged;
    var payload = {};
    payload[app.STORAGE_KEYS.runtime] = merged;
    await storageSet(payload);
    return merged;
  }

  async function saveTasks(nextTasks) {
    var tasks = Array.isArray(nextTasks) ? nextTasks : [];
    app.state.tasks = tasks;
    var payload = {};
    payload[app.STORAGE_KEYS.tasks] = tasks;
    await storageSet(payload);
    return tasks;
  }

  function getTaskById(taskId) {
    return (app.state.tasks || []).find(function (task) {
      return task.id === taskId;
    });
  }

  async function updateTask(taskId, patch) {
    var updated = (app.state.tasks || []).map(function (task) {
      if (task.id !== taskId) {
        return task;
      }
      return Object.assign({}, task, patch || {}, { updatedAt: Date.now() });
    });
    await saveTasks(updated);
    return getTaskById(taskId);
  }

  function buildTaskKey(task) {
    return (task.fileName || "") + "::" + (task.cveId || "");
  }

  async function appendTasks(nextTasks) {
    var current = Array.isArray(app.state.tasks) ? app.state.tasks.slice() : [];
    var map = {};

    current.forEach(function (task) {
      map[buildTaskKey(task)] = true;
    });

    var appended = [];

    (nextTasks || []).forEach(function (task) {
      var key = buildTaskKey(task);
      if (!key || map[key]) {
        return;
      }
      map[key] = true;
      current.push(task);
      appended.push(task);
    });

    await saveTasks(current);
    return appended;
  }

  async function resetQueue() {
    await saveRuntime(
      Object.assign({}, app.state.runtime, {
        running: false,
        paused: false,
        currentTaskId: ""
      })
    );

    var reset = (app.state.tasks || []).map(function (task) {
      if (task.status === "running") {
        return Object.assign({}, task, { status: "pending", updatedAt: Date.now() });
      }
      return task;
    });
    await saveTasks(reset);
  }

  function getQueueCounts() {
    var counts = {
      total: 0,
      pending: 0,
      running: 0,
      paused: 0,
      success: 0,
      failed: 0,
      filtered: 0
    };

    (app.state.tasks || []).forEach(function (task) {
      counts.total += 1;
      if (counts[task.status] !== undefined) {
        counts[task.status] += 1;
      }
    });

    return counts;
  }

  function getNextPendingTask() {
    return (app.state.tasks || []).find(function (task) {
      return task.status === "pending";
    });
  }

  function openBlobDB() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE);
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("open idb failed"));
      };
    });
  }

  async function putBlob(blobId, blob) {
    var db = await openBlobDB();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).put(blob, blobId);
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("put blob failed"));
      };
    });
  }

  async function getBlob(blobId) {
    var db = await openBlobDB();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(BLOB_STORE, "readonly");
      var request = tx.objectStore(BLOB_STORE).get(blobId);
      request.onsuccess = function () {
        resolve(request.result || null);
      };
      request.onerror = function () {
        reject(request.error || new Error("get blob failed"));
      };
      tx.oncomplete = function () {
        db.close();
      };
    });
  }

  async function deleteBlob(blobId) {
    var db = await openBlobDB();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).delete(blobId);
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("delete blob failed"));
      };
    });
  }

  async function clearAllBlobs() {
    var db = await openBlobDB();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).clear();
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("clear blobs failed"));
      };
    });
  }

  app.queue = {
    loadState: loadState,
    saveSettings: saveSettings,
    saveRuntime: saveRuntime,
    saveTasks: saveTasks,
    appendTasks: appendTasks,
    updateTask: updateTask,
    getTaskById: getTaskById,
    resetQueue: resetQueue,
    getQueueCounts: getQueueCounts,
    getNextPendingTask: getNextPendingTask,
    buildTaskKey: buildTaskKey,
    putBlob: putBlob,
    getBlob: getBlob,
    deleteBlob: deleteBlob,
    clearAllBlobs: clearAllBlobs
  };
})(window);
