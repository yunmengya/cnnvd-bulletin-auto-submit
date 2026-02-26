(function initPanel(global) {
  var app = global.__CNNVD_ASSISTANT__;
  if (!app || !app.queue || !app.docx || !app.zip || !app.automation) {
    return;
  }

  var ROOT_ID = "cnnvd-assistant-root";
  var TOGGLE_ID = "cnnvd-assistant-toggle";
  var HOVER_CLASS = "cnnvd-bind-hover";
  var currentTab = "base";
  var hoverEl = null;
  var hotRefilterTimer = 0;
  var STATUS_ORDER = ["running", "paused", "pending", "failed", "filtered", "success"];
  var STATUS_LABELS = {
    pending: "待处理",
    running: "运行中",
    paused: "已暂停",
    success: "成功",
    failed: "失败",
    filtered: "已过滤"
  };

  function emitStateChange() {
    global.dispatchEvent(new CustomEvent("cnnvd-state-updated"));
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function uniqueId(prefix) {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function parseKeywords(raw) {
    return String(raw || "")
      .split(/[\n,，]/g)
      .map(function (k) {
        return k.trim();
      })
      .filter(function (k) {
        return !!k;
      });
  }

  function settingsFromForm() {
    return {
      supportName: byId("cnnvd_support_name").value.trim(),
      supportPhone: byId("cnnvd_support_phone").value.trim(),
      supportEmail: byId("cnnvd_support_email").value.trim(),
      hasPoc: byId("cnnvd_has_poc").value,
      hasExp: byId("cnnvd_has_exp").value,
      hasTool: byId("cnnvd_has_tool").value,
      verified: byId("cnnvd_verified").value,
      submitMode: byId("cnnvd_submit_mode").value,
      typingMinMs: Number(byId("cnnvd_typing_min").value || 80),
      typingMaxMs: Number(byId("cnnvd_typing_max").value || 220),
      stepMinMs: Number(byId("cnnvd_step_min").value || 1000),
      stepMaxMs: Number(byId("cnnvd_step_max").value || 2500),
      filterKeywords: parseKeywords(byId("cnnvd_filter_keywords").value)
    };
  }

  function applySettingsToForm() {
    var s = app.state.settings || app.DEFAULT_SETTINGS;
    byId("cnnvd_support_name").value = s.supportName || "";
    byId("cnnvd_support_phone").value = s.supportPhone || "";
    byId("cnnvd_support_email").value = s.supportEmail || "";
    byId("cnnvd_has_poc").value = s.hasPoc || "无";
    byId("cnnvd_has_exp").value = s.hasExp || "无";
    byId("cnnvd_has_tool").value = s.hasTool || "无";
    byId("cnnvd_verified").value = s.verified || "否";
    byId("cnnvd_submit_mode").value = s.submitMode || "auto";
    byId("cnnvd_typing_min").value = s.typingMinMs || 80;
    byId("cnnvd_typing_max").value = s.typingMaxMs || 220;
    byId("cnnvd_step_min").value = s.stepMinMs || 1000;
    byId("cnnvd_step_max").value = s.stepMaxMs || 2500;
    byId("cnnvd_filter_keywords").value = (s.filterKeywords || []).join("\n");
  }

  function renderHeader() {
    var counts = app.queue.getQueueCounts();
    var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
    var status = runtime.running
      ? "运行中"
      : runtime.paused
      ? "已暂停"
      : "空闲";

    byId("cnnvd_status_text").textContent = status;
    byId("cnnvd_status_text").setAttribute("data-status", status);

    byId("cnnvd_count_total").textContent = String(counts.total || 0);
    byId("cnnvd_count_success").textContent = String(counts.success || 0);
    byId("cnnvd_count_failed").textContent = String(counts.failed || 0);

    var current = runtime.currentTaskId
      ? app.queue.getTaskById(runtime.currentTaskId)
      : null;

    byId("cnnvd_current_task").textContent = current
      ? current.fileName
      : "-";
  }

  function renderImportStats() {
    var stats = (app.state.runtime && app.state.runtime.importStats) || {};
    byId("cnnvd_import_total").textContent = String(stats.total || 0);
    byId("cnnvd_import_filtered").textContent = String(stats.filtered || 0);
    byId("cnnvd_import_queued").textContent = String(stats.queued || 0);
    byId("cnnvd_import_unsupported").textContent = String(stats.unsupported || 0);
    byId("cnnvd_import_duplicate").textContent = String(stats.duplicate || 0);
  }

  function renderQueueTable() {
    var tbody = byId("cnnvd_queue_tbody");
    var rows = (app.state.tasks || []).slice().sort(function (a, b) {
      var aOrder = STATUS_ORDER.indexOf(a.status);
      var bOrder = STATUS_ORDER.indexOf(b.status);
      if (aOrder === -1) {
        aOrder = 999;
      }
      if (bOrder === -1) {
        bOrder = 999;
      }
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
    }).slice(0, 300);
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='6' class='empty'>暂无任务</td></tr>";
      return;
    }

    var grouped = {};
    rows.forEach(function (task) {
      var key = task.status || "unknown";
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(task);
    });

    var statusKeys = STATUS_ORDER.slice();
    Object.keys(grouped).forEach(function (key) {
      if (statusKeys.indexOf(key) === -1) {
        statusKeys.push(key);
      }
    });

    var html = [];
    statusKeys.forEach(function (statusKey) {
      var list = grouped[statusKey];
      if (!list || !list.length) {
        return;
      }
      var statusText = STATUS_LABELS[statusKey] || statusKey;
      html.push(
        "<tr class='queue-group-row'><td colspan='6'>" +
          escapeHtml(statusText) +
          "（" +
          String(list.length) +
          "）</td></tr>"
      );

      list.forEach(function (task) {
        var readableStatus = STATUS_LABELS[task.status] || task.status || "未知";
        html.push(
          "<tr>" +
          "<td><span class='tag status-" + escapeHtml(task.status || "unknown") + "'>" + escapeHtml(readableStatus) + "</span></td>" +
          "<td title='" + escapeHtml(task.fileName) + "'>" + escapeHtml(task.fileName) + "</td>" +
          "<td>" + escapeHtml(task.cveId || "-") + "</td>" +
          "<td>" + String(task.retries || 0) + "</td>" +
          "<td title='" + escapeHtml(task.reason || "") + "'>" + escapeHtml(task.reason || "-") + "</td>" +
          "<td>" + escapeHtml(new Date(task.updatedAt || task.createdAt || Date.now()).toLocaleTimeString()) + "</td>" +
          "</tr>"
        );
      });
    });

    tbody.innerHTML = html.join("");
  }

  function renderLogs() {
    var wrap = byId("cnnvd_log_list");
    var logs = (app.state.logs || []).slice().reverse().slice(0, 300);
    if (!logs.length) {
      wrap.innerHTML = "<div class='empty'>暂无日志</div>";
      return;
    }

    wrap.innerHTML = logs
      .map(function (log) {
        return (
          "<div class='log-row'>" +
          "<span class='time'>" + escapeHtml(app.logger.formatTime(log.ts)) + "</span>" +
          "<span class='level " + escapeHtml(log.level) + "'>" + escapeHtml(log.level) + "</span>" +
          "<span class='step'>" + escapeHtml(log.step || "-") + "</span>" +
          "<span class='msg'>" + escapeHtml(log.message || "") + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderBindingRows() {
    var defs = app.selectors.getFieldDefs();
    var overrides = (app.state.settings && app.state.settings.selectorOverrides) || {};

    var html = Object.keys(defs)
      .map(function (key) {
        var def = defs[key];
        var hasOverride = !!overrides[key];
        var selector = hasOverride ? overrides[key].cssPath : (def.selectors[0] || "");

        return (
          "<div class='bind-row'>" +
          "<div class='bind-main'>" +
          "<div class='bind-label'>" + escapeHtml(def.label) + "</div>" +
          "<div class='bind-meta'>" +
          "<span class='tag " + (hasOverride ? "ok" : "default") + "'>" + (hasOverride ? "已覆盖" : "默认") + "</span>" +
          "<code title='" + escapeHtml(selector) + "'>" + escapeHtml(selector) + "</code>" +
          "</div>" +
          "</div>" +
          "<div class='bind-actions'>" +
          "<button class='ghost' data-action='bind-field' data-field='" + escapeHtml(key) + "'>重标定</button>" +
          "<button class='ghost' data-action='test-field' data-field='" + escapeHtml(key) + "'>测试</button>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    byId("cnnvd_binding_list").innerHTML = html;

    var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
    var tip = runtime.bindMode
      ? runtime.pendingBindFieldKey
        ? "标定模式已开启：请点击页面中的目标元素"
        : "标定模式已开启：先点某个字段的“重标定”"
      : "标定模式未开启";

    byId("cnnvd_bind_tip").textContent = tip;
    byId("cnnvd_bind_toggle").textContent = runtime.bindMode
      ? "退出标定模式"
      : "进入标定模式";
  }

  function renderAll() {
    if (!byId(ROOT_ID)) {
      return;
    }
    renderHeader();
    renderImportStats();
    renderQueueTable();
    renderLogs();
    renderBindingRows();
  }

  function switchTab(tabName) {
    currentTab = tabName;
    var tabs = Array.prototype.slice.call(document.querySelectorAll("#" + ROOT_ID + " .tab-btn"));
    tabs.forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });

    var panels = Array.prototype.slice.call(document.querySelectorAll("#" + ROOT_ID + " .tab-panel"));
    panels.forEach(function (panel) {
      panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === tabName);
    });
  }

  function createPanelDOM() {
    if (byId(ROOT_ID)) {
      return;
    }

    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML =
      "<div class='panel-header'>" +
      "  <div class='title'>CNNVD 助手</div>" +
      "  <div class='status' id='cnnvd_status_text' data-status='空闲'>空闲</div>" +
      "</div>" +
      "<div class='panel-stats'>" +
      "  <div>总数 <b id='cnnvd_count_total'>0</b></div>" +
      "  <div>成功 <b id='cnnvd_count_success'>0</b></div>" +
      "  <div>失败 <b id='cnnvd_count_failed'>0</b></div>" +
      "</div>" +
      "<div class='current-task'>当前任务: <span id='cnnvd_current_task'>-</span></div>" +
      "<div class='tabs'>" +
      "  <button class='tab-btn active' data-tab='base'>基础配置</button>" +
      "  <button class='tab-btn' data-tab='import'>导入过滤</button>" +
      "  <button class='tab-btn' data-tab='queue'>队列</button>" +
      "  <button class='tab-btn' data-tab='binding'>字段配置</button>" +
      "  <button class='tab-btn' data-tab='logs'>日志</button>" +
      "</div>" +
      "<div class='tab-panel active' data-tab-panel='base'>" +
      "  <div class='grid-2'>" +
      "    <label>技术支持姓名<input id='cnnvd_support_name' type='text' /></label>" +
      "    <label>技术支持电话<input id='cnnvd_support_phone' type='text' /></label>" +
      "    <label class='full'>技术支持邮箱<input id='cnnvd_support_email' type='text' /></label>" +
      "  </div>" +
      "  <div class='grid-2'>" +
      "    <label>有无POC<select id='cnnvd_has_poc'><option>无</option><option>有</option></select></label>" +
      "    <label>有无EXP<select id='cnnvd_has_exp'><option>无</option><option>有</option></select></label>" +
      "    <label>有无检测工具<select id='cnnvd_has_tool'><option>无</option><option>有</option></select></label>" +
      "    <label>是否验证<select id='cnnvd_verified'><option>否</option><option>是</option></select></label>" +
      "    <label>第二页提交<select id='cnnvd_submit_mode'><option value='auto'>自动</option><option value='manual'>手动</option></select></label>" +
      "  </div>" +
      "  <div class='grid-2'>" +
      "    <label>输入最小ms<input id='cnnvd_typing_min' type='number' min='10' /></label>" +
      "    <label>输入最大ms<input id='cnnvd_typing_max' type='number' min='10' /></label>" +
      "    <label>步骤最小ms<input id='cnnvd_step_min' type='number' min='100' /></label>" +
      "    <label>步骤最大ms<input id='cnnvd_step_max' type='number' min='100' /></label>" +
      "  </div>" +
      "  <button class='primary full-btn' id='cnnvd_save_settings'>保存配置</button>" +
      "</div>" +
      "<div class='tab-panel' data-tab-panel='import'>" +
      "  <label>过滤关键词（命中即不导入，支持换行/逗号）<textarea id='cnnvd_filter_keywords' rows='4'></textarea></label>" +
      "  <div class='inline-buttons'>" +
      "    <button class='ghost' id='cnnvd_import_files_btn'>导入文件(多选)</button>" +
      "    <button class='ghost' id='cnnvd_import_dir_btn'>导入目录</button>" +
      "    <button class='ghost' id='cnnvd_refilter_btn'>重新筛选</button>" +
      "  </div>" +
      "  <div class='import-stats'>" +
      "    <span>导入总数 <b id='cnnvd_import_total'>0</b></span>" +
      "    <span>过滤 <b id='cnnvd_import_filtered'>0</b></span>" +
      "    <span>入队 <b id='cnnvd_import_queued'>0</b></span>" +
      "    <span>非docx <b id='cnnvd_import_unsupported'>0</b></span>" +
      "    <span>重复 <b id='cnnvd_import_duplicate'>0</b></span>" +
      "  </div>" +
      "</div>" +
      "<div class='tab-panel' data-tab-panel='queue'>" +
      "  <div class='inline-buttons'>" +
      "    <button class='ghost' id='cnnvd_retry_failed_btn'>重跑失败</button>" +
      "  </div>" +
      "  <div class='table-wrap'>" +
      "    <table class='queue-table'>" +
      "      <thead><tr><th>状态</th><th>文件</th><th>CVE</th><th>重试</th><th>原因</th><th>更新时间</th></tr></thead>" +
      "      <tbody id='cnnvd_queue_tbody'></tbody>" +
      "    </table>" +
      "  </div>" +
      "</div>" +
      "<div class='tab-panel' data-tab-panel='binding'>" +
      "  <div class='inline-buttons'>" +
      "    <button class='ghost' id='cnnvd_bind_toggle'>进入标定模式</button>" +
      "    <button class='ghost' id='cnnvd_bind_reset'>恢复默认</button>" +
      "    <button class='ghost' id='cnnvd_bind_export'>导出配置</button>" +
      "    <button class='ghost' id='cnnvd_bind_import'>导入配置</button>" +
      "  </div>" +
      "  <div class='bind-tip' id='cnnvd_bind_tip'>标定模式未开启</div>" +
      "  <div id='cnnvd_binding_list' class='binding-list'></div>" +
      "</div>" +
      "<div class='tab-panel' data-tab-panel='logs'>" +
      "  <div class='inline-buttons'>" +
      "    <button class='ghost' id='cnnvd_export_log_btn'>导出日志CSV</button>" +
      "    <button class='ghost' id='cnnvd_export_failed_btn'>导出失败清单CSV</button>" +
      "  </div>" +
      "  <div id='cnnvd_log_list' class='log-list'></div>" +
      "</div>" +
      "<div class='panel-footer'>" +
      "  <button class='primary' id='cnnvd_start_btn'>开始</button>" +
      "  <button class='ghost' id='cnnvd_pause_btn'>暂停</button>" +
      "  <button class='ghost' id='cnnvd_resume_btn'>继续</button>" +
      "  <button class='danger' id='cnnvd_clear_queue_footer_btn'>清空队列</button>" +
      "  <button class='danger' id='cnnvd_stop_btn'>停止</button>" +
      "</div>" +
      "<input id='cnnvd_file_input' type='file' multiple style='display:none' />" +
      "<input id='cnnvd_dir_input' type='file' webkitdirectory directory multiple style='display:none' />" +
      "<input id='cnnvd_bind_import_input' type='file' accept='application/json' style='display:none' />";

    var toggle = document.createElement("button");
    toggle.id = TOGGLE_ID;
    toggle.textContent = "CNNVD助手";

    document.body.appendChild(root);
    document.body.appendChild(toggle);
  }

  async function saveSettingsFromForm(options) {
    var opts = options || {};
    var payload = settingsFromForm();
    await app.queue.saveSettings(payload);
    if (!opts.silent) {
      await app.logger.append("info", "settings", "配置已保存");
    }
    emitStateChange();
  }

  function buildTaskRecord(fileName, status, reason) {
    var cve = app.docx.extractCve(fileName);
    var subject = app.docx.normalizeSubject(fileName);
    return {
      id: uniqueId("task"),
      fileName: fileName,
      cveId: cve,
      subject: subject,
      bulletinTitle: app.docx.buildBulletinTitle(subject || fileName),
      textBody: "",
      zipBlobId: "",
      zipName: "",
      status: status,
      retries: 0,
      reason: reason || "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async function processImportedFiles(fileList, sourceMode) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) {
      return;
    }

    await saveSettingsFromForm();

    var settings = app.state.settings || app.DEFAULT_SETTINGS;
    var keywords = settings.filterKeywords || [];

    var stats = {
      total: files.length,
      filtered: 0,
      queued: 0,
      unsupported: 0,
      duplicate: 0
    };

    var toAppend = [];
    var existingKeys = {};

    (app.state.tasks || []).forEach(function (task) {
      existingKeys[app.queue.buildTaskKey(task)] = true;
    });

    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      var fileName = file.name || "";

      if (!app.docx.isDocx(file)) {
        stats.unsupported += 1;
        await app.logger.append("warn", "import", "跳过非docx文件: " + fileName);
        continue;
      }

      var hitKeyword = app.docx.keywordMatch(fileName, keywords);
      if (hitKeyword) {
        stats.filtered += 1;
        toAppend.push(buildTaskRecord(fileName, "filtered", "命中过滤关键词: " + hitKeyword));
        continue;
      }

      try {
        var cveId = app.docx.extractCve(fileName);
        if (!cveId) {
          toAppend.push(buildTaskRecord(fileName, "failed", "文件名未检测到CVE编号"));
          await app.logger.append("error", "import", "文件名未检测到CVE: " + fileName);
          continue;
        }

        var subject = app.docx.normalizeSubject(fileName);
        var key = fileName + "::" + cveId;
        if (existingKeys[key]) {
          stats.duplicate += 1;
          await app.logger.append("warn", "import", "重复任务已去重: " + fileName);
          continue;
        }

        var fullText = await app.docx.extractTextFromDocx(file);
        var body = app.docx.extractBodyFromAnchor(fullText);
        if (!body) {
          toAppend.push(buildTaskRecord(fileName, "failed", "正文未找到“产品描述”段落"));
          await app.logger.append("error", "import", "正文未找到“产品描述”: " + fileName);
          continue;
        }

        var zipResult = await app.zip.buildSingleDocxZip(file);
        if (zipResult.zipBlob.size > 50 * 1024 * 1024) {
          toAppend.push(buildTaskRecord(fileName, "failed", "压缩包超过50MB"));
          await app.logger.append("error", "import", "压缩包超过50MB: " + fileName);
          continue;
        }

        var blobId = uniqueId("zipblob");
        await app.queue.putBlob(blobId, zipResult.zipBlob);

        var task = {
          id: uniqueId("task"),
          sourceMode: sourceMode || "files",
          sourceName: fileName,
          fileName: fileName,
          cveId: cveId,
          subject: subject,
          bulletinTitle: app.docx.buildBulletinTitle(subject),
          textBody: body,
          zipBlobId: blobId,
          zipName: zipResult.zipName,
          status: "pending",
          retries: 0,
          reason: "",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        toAppend.push(task);
        existingKeys[key] = true;
        stats.queued += 1;
      } catch (err) {
        var msg = err && err.message ? err.message : String(err);
        toAppend.push(buildTaskRecord(fileName, "failed", "解析失败: " + msg));
        await app.logger.append("error", "import", "解析失败 " + fileName + ": " + msg);
      }
    }

    if (toAppend.length) {
      await app.queue.appendTasks(toAppend);
    }

    await app.queue.saveRuntime({
      importStats: stats
    });

    await app.logger.append(
      "info",
      "import",
      "导入完成 total=" +
        stats.total +
        " queued=" +
        stats.queued +
        " filtered=" +
        stats.filtered +
        " duplicate=" +
        stats.duplicate +
        " unsupported=" +
        stats.unsupported
    );

    emitStateChange();
  }

  async function clearQueue() {
    await app.queue.saveTasks([]);
    await app.queue.saveRuntime({
      running: false,
      paused: false,
      currentTaskId: "",
      importStats: {
        total: 0,
        filtered: 0,
        queued: 0,
        unsupported: 0,
        duplicate: 0
      }
    });
    await app.queue.clearAllBlobs();
    await app.logger.append("warn", "queue", "队列与附件缓存已清空");
    emitStateChange();
  }

  async function rerunFailedTasks() {
    var failedTasks = (app.state.tasks || []).filter(function (task) {
      return task.status === "failed";
    });
    if (!failedTasks.length) {
      await app.logger.append("warn", "queue", "当前没有失败任务可重跑");
      emitStateChange();
      return;
    }

    if (app.state.runtime && app.state.runtime.running) {
      await app.automation.pauseQueue("重跑失败前自动暂停");
    }

    var now = Date.now();
    var nextTasks = (app.state.tasks || []).map(function (task) {
      if (task.status !== "failed") {
        return task;
      }
      return Object.assign({}, task, {
        status: "pending",
        retries: 0,
        reason: "",
        updatedAt: now
      });
    });

    await app.queue.saveTasks(nextTasks);
    await app.logger.append("info", "queue", "已将失败任务重置为待处理: " + failedTasks.length + " 条");
    emitStateChange();
  }

  function buildRuntimeStatsFromTasks(tasks, baseStats) {
    var list = Array.isArray(tasks) ? tasks : [];
    var base = baseStats || {};
    var filtered = list.filter(function (task) {
      return task.status === "filtered";
    }).length;
    var queued = list.filter(function (task) {
      return task.status === "pending" || task.status === "running" || task.status === "paused";
    }).length;

    return Object.assign({}, base, {
      total: list.length,
      filtered: filtered,
      queued: queued
    });
  }

  async function reapplyKeywordFilter(options) {
    var opts = options || {};
    await saveSettingsFromForm({ silent: true });
    var settings = app.state.settings || app.DEFAULT_SETTINGS;
    var keywords = settings.filterKeywords || [];
    var sourceTasks = (app.state.tasks || []).slice();

    if (!sourceTasks.length) {
      if (!opts.hot) {
        await app.logger.append("warn", "filter", "当前队列为空，无需重筛");
      }
      emitStateChange();
      return;
    }

    var now = Date.now();
    var changed = false;
    var changedToFiltered = 0;
    var changedToPending = 0;
    var changedReason = 0;

    var nextTasks = sourceTasks.map(function (task) {
      var status = task.status;
      var canReFilter = status === "pending" || status === "filtered";
      if (!canReFilter) {
        return task;
      }

      var hitKeyword = app.docx.keywordMatch(task.fileName || "", keywords);
      if (hitKeyword) {
        var reason = "命中过滤关键词: " + hitKeyword;
        if (status !== "filtered") {
          changed = true;
          changedToFiltered += 1;
          return Object.assign({}, task, {
            status: "filtered",
            reason: reason,
            updatedAt: now
          });
        }
        if ((task.reason || "") !== reason) {
          changed = true;
          changedReason += 1;
          return Object.assign({}, task, {
            reason: reason,
            updatedAt: now
          });
        }
        return task;
      }

      if (status === "filtered") {
        changed = true;
        changedToPending += 1;
        return Object.assign({}, task, {
          status: "pending",
          reason: "",
          updatedAt: now
        });
      }

      return task;
    });

    if (changed) {
      await app.queue.saveTasks(nextTasks);
    }

    var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
    var runtimeStats = buildRuntimeStatsFromTasks(app.state.tasks || nextTasks, runtime.importStats || {});
    await app.queue.saveRuntime({ importStats: runtimeStats });

    if (!opts.hot) {
      await app.logger.append(
        "info",
        "filter",
        "重筛完成: 新过滤 " + changedToFiltered + "，恢复待处理 " + changedToPending + "，更新原因 " + changedReason
      );
    } else if (changed) {
      await app.logger.append(
        "info",
        "filter",
        "热筛选生效: 新过滤 " + changedToFiltered + "，恢复待处理 " + changedToPending
      );
    }

    emitStateChange();
  }

  function scheduleHotRefilter() {
    if (hotRefilterTimer) {
      clearTimeout(hotRefilterTimer);
    }
    hotRefilterTimer = setTimeout(function () {
      hotRefilterTimer = 0;
      reapplyKeywordFilter({ hot: true });
    }, 450);
  }

  function exportFailedTasksCSV() {
    var failed = (app.state.tasks || []).filter(function (task) {
      return task.status === "failed";
    });

    var headers = ["fileName", "cveId", "retries", "reason", "updatedAt"];
    var lines = [headers.join(",")];

    failed.forEach(function (task) {
      var row = [
        task.fileName || "",
        task.cveId || "",
        String(task.retries || 0),
        task.reason || "",
        new Date(task.updatedAt || task.createdAt || Date.now()).toLocaleString()
      ].map(function (cell) {
        var t = String(cell).replace(/"/g, '""');
        return '"' + t + '"';
      });
      lines.push(row.join(","));
    });

    var csv = lines.join("\n");
    app.logger.downloadCSV("cnnvd_failed_tasks.csv", csv);
  }

  async function toggleBindMode() {
    var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
    if (runtime.bindMode) {
      await app.queue.saveRuntime({ bindMode: false, pendingBindFieldKey: "" });
      await app.logger.append("info", "bind", "已退出标定模式");
    } else {
      await app.queue.saveRuntime({ bindMode: true, pendingBindFieldKey: "" });
      await app.logger.append("info", "bind", "已进入标定模式");
    }
    emitStateChange();
  }

  async function requestBindField(fieldKey) {
    await app.queue.saveRuntime({ bindMode: true, pendingBindFieldKey: fieldKey });
    var def = app.selectors.getFieldDefs()[fieldKey];
    await app.logger.append("info", "bind", "请点击页面元素进行标定: " + (def ? def.label : fieldKey));
    emitStateChange();
  }

  async function testFieldBinding(fieldKey) {
    var result = app.selectors.testBinding(fieldKey);
    await app.logger.append(
      result.ok ? "info" : "error",
      "bind",
      (app.selectors.getFieldDefs()[fieldKey] || { label: fieldKey }).label +
        " -> " +
        result.message +
        " (count=" +
        result.count +
        ")"
    );
    emitStateChange();
  }

  async function exportBindings() {
    var payload = {
      domain: location.hostname,
      exportedAt: Date.now(),
      selectorOverrides:
        (app.state.settings && app.state.settings.selectorOverrides) || {}
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "cnnvd_selector_bindings.json";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  async function importBindingsFromFile(file) {
    if (!file) {
      return;
    }
    try {
      var text = await file.text();
      var json = JSON.parse(text);
      var overrides = (json && json.selectorOverrides) || {};
      await app.queue.saveSettings({ selectorOverrides: overrides });
      await app.logger.append("info", "bind", "字段配置导入完成");
      emitStateChange();
    } catch (err) {
      await app.logger.append("error", "bind", "导入字段配置失败: " + (err.message || err));
      emitStateChange();
    }
  }

  function attachEvents() {
    document
      .querySelector("#" + ROOT_ID + " .tabs")
      .addEventListener("click", function (event) {
        var btn = event.target.closest(".tab-btn");
        if (!btn) {
          return;
        }
        switchTab(btn.getAttribute("data-tab"));
      });

    byId(TOGGLE_ID).addEventListener("click", function () {
      byId(ROOT_ID).classList.toggle("collapsed");
    });

    byId("cnnvd_save_settings").addEventListener("click", function () {
      saveSettingsFromForm();
    });

    byId("cnnvd_import_files_btn").addEventListener("click", function () {
      byId("cnnvd_file_input").click();
    });

    byId("cnnvd_import_dir_btn").addEventListener("click", function () {
      byId("cnnvd_dir_input").click();
    });

    byId("cnnvd_file_input").addEventListener("change", function (event) {
      processImportedFiles(event.target.files, "files");
      event.target.value = "";
    });

    byId("cnnvd_dir_input").addEventListener("change", function (event) {
      processImportedFiles(event.target.files, "directory");
      event.target.value = "";
    });

    byId("cnnvd_refilter_btn").addEventListener("click", function () {
      reapplyKeywordFilter({ hot: false });
    });

    byId("cnnvd_filter_keywords").addEventListener("input", function () {
      scheduleHotRefilter();
    });

    byId("cnnvd_clear_queue_footer_btn").addEventListener("click", function () {
      clearQueue();
    });
    byId("cnnvd_retry_failed_btn").addEventListener("click", function () {
      rerunFailedTasks();
    });

    byId("cnnvd_start_btn").addEventListener("click", function () {
      saveSettingsFromForm().then(function () {
        app.automation.startQueue();
      });
    });

    byId("cnnvd_pause_btn").addEventListener("click", function () {
      app.automation.pauseQueue("手动暂停");
    });

    byId("cnnvd_resume_btn").addEventListener("click", function () {
      app.automation.resumeQueue();
    });

    byId("cnnvd_stop_btn").addEventListener("click", function () {
      app.automation.stopQueue();
    });

    byId("cnnvd_export_log_btn").addEventListener("click", function () {
      var csv = app.logger.toCSV(app.state.logs || []);
      app.logger.downloadCSV("cnnvd_logs.csv", csv);
    });

    byId("cnnvd_export_failed_btn").addEventListener("click", function () {
      exportFailedTasksCSV();
    });

    byId("cnnvd_bind_toggle").addEventListener("click", function () {
      toggleBindMode();
    });

    byId("cnnvd_bind_reset").addEventListener("click", function () {
      app.selectors.resetBindings().then(function () {
        app.logger.append("warn", "bind", "字段配置已恢复默认");
        emitStateChange();
      });
    });

    byId("cnnvd_bind_export").addEventListener("click", function () {
      exportBindings();
    });

    byId("cnnvd_bind_import").addEventListener("click", function () {
      byId("cnnvd_bind_import_input").click();
    });

    byId("cnnvd_bind_import_input").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      importBindingsFromFile(file);
      event.target.value = "";
    });

    byId("cnnvd_binding_list").addEventListener("click", function (event) {
      var target = event.target.closest("button[data-action]");
      if (!target) {
        return;
      }
      var action = target.getAttribute("data-action");
      var field = target.getAttribute("data-field");
      if (!field) {
        return;
      }
      if (action === "bind-field") {
        requestBindField(field);
      }
      if (action === "test-field") {
        testFieldBinding(field);
      }
    });

    global.addEventListener("cnnvd-state-updated", function () {
      renderAll();
    });
  }

  function installDragSupport() {
    var root = byId(ROOT_ID);
    if (!root) {
      return;
    }
    var header = root.querySelector(".panel-header");
    if (!header) {
      return;
    }

    var dragging = false;
    var startX = 0;
    var startY = 0;
    var originX = 0;
    var originY = 0;

    header.addEventListener("mousedown", function (event) {
      if (event.button !== 0) {
        return;
      }
      dragging = true;
      var rect = root.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      originX = rect.left;
      originY = rect.top;
      root.style.left = originX + "px";
      root.style.top = originY + "px";
      root.style.right = "auto";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", function (event) {
      if (!dragging) {
        return;
      }
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      var nextLeft = Math.max(6, originX + dx);
      var nextTop = Math.max(6, originY + dy);
      root.style.left = nextLeft + "px";
      root.style.top = nextTop + "px";
    });

    document.addEventListener("mouseup", function () {
      if (!dragging) {
        return;
      }
      dragging = false;
      document.body.style.userSelect = "";
    });
  }

  async function handleBindClickCapture(event) {
    var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
    if (!runtime.bindMode) {
      return;
    }

    var root = byId(ROOT_ID);
    if (root && root.contains(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }

    var fieldKey = runtime.pendingBindFieldKey;
    if (!fieldKey) {
      return;
    }

    var selector = app.selectors.buildCssPath(event.target);
    if (!selector) {
      await app.logger.append("error", "bind", "未能生成有效选择器");
      return;
    }

    await app.selectors.saveBinding(fieldKey, selector);
    await app.queue.saveRuntime({ pendingBindFieldKey: "" });
    var def = app.selectors.getFieldDefs()[fieldKey];
    await app.logger.append("info", "bind", "字段标定成功: " + (def ? def.label : fieldKey));
    emitStateChange();
  }

  function handleBindHover(event) {
    var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
    if (!runtime.bindMode) {
      if (hoverEl) {
        hoverEl.classList.remove(HOVER_CLASS);
        hoverEl = null;
      }
      return;
    }

    var root = byId(ROOT_ID);
    if (root && root.contains(event.target)) {
      return;
    }

    if (hoverEl && hoverEl !== event.target) {
      hoverEl.classList.remove(HOVER_CLASS);
    }
    hoverEl = event.target;
    if (hoverEl && hoverEl.classList) {
      hoverEl.classList.add(HOVER_CLASS);
    }
  }

  function installBindListeners() {
    document.addEventListener("click", function (event) {
      handleBindClickCapture(event);
    }, true);

    document.addEventListener("mousemove", handleBindHover, true);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
        if (runtime.bindMode) {
          app.queue.saveRuntime({ bindMode: false, pendingBindFieldKey: "" }).then(function () {
            app.logger.append("warn", "bind", "按ESC退出标定模式");
            emitStateChange();
          });
        }
      }
    });
  }

  async function init() {
    createPanelDOM();
    await app.queue.loadState();
    await app.logger.loadLogs();
    applySettingsToForm();
    attachEvents();
    installDragSupport();
    installBindListeners();
    await app.automation.init();
    renderAll();
    switchTab(currentTab);

    await app.logger.append("info", "system", "CNNVD 助手已加载");
    emitStateChange();
  }

  init();
})(window);
