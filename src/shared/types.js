(function initTypes(global) {
  if (global.__CNNVD_ASSISTANT__) {
    return;
  }

  var now = Date.now();

  var DEFAULT_SETTINGS = {
    supportName: "",
    supportPhone: "",
    supportEmail: "",
    hasPoc: "无",
    hasExp: "无",
    hasTool: "无",
    verified: "否",
    submitMode: "auto",
    typingMinMs: 80,
    typingMaxMs: 220,
    stepMinMs: 1000,
    stepMaxMs: 2500,
    filterKeywords: [],
    selectorOverrides: {}
  };

  var DEFAULT_RUNTIME = {
    running: false,
    paused: false,
    currentTaskId: "",
    bindMode: false,
    pendingBindFieldKey: "",
    importStats: {
      total: 0,
      filtered: 0,
      queued: 0,
      unsupported: 0
    }
  };

  var STORAGE_KEYS = {
    settings: "cnnvd_settings",
    tasks: "cnnvd_tasks",
    logs: "cnnvd_logs",
    runtime: "cnnvd_runtime"
  };

  global.__CNNVD_ASSISTANT__ = {
    version: "0.1.0",
    bootAt: now,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_RUNTIME: DEFAULT_RUNTIME,
    STORAGE_KEYS: STORAGE_KEYS,
    state: {
      settings: DEFAULT_SETTINGS,
      tasks: [],
      logs: [],
      runtime: DEFAULT_RUNTIME
    }
  };
})(window);
