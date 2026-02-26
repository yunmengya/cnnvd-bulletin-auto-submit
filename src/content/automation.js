(function initAutomation(global) {
  var app = global.__CNNVD_ASSISTANT__;
  if (!app || !app.queue || !app.selectors || !app.logger) {
    return;
  }

  var loopBusy = false;
  var internalActionDepth = 0;

  function emitStateChange() {
    global.dispatchEvent(new CustomEvent("cnnvd-state-updated"));
  }

  function randomBetween(min, max) {
    var a = Number(min || 0);
    var b = Number(max || 0);
    if (a > b) {
      var t = a;
      a = b;
      b = t;
    }
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms));
    });
  }

  async function delayStep() {
    var settings = app.state.settings || app.DEFAULT_SETTINGS;
    await sleep(randomBetween(settings.stepMinMs, settings.stepMaxMs));
  }

  function fireInputEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function withInternalAction(fn) {
    internalActionDepth += 1;
    try {
      return await fn();
    } finally {
      internalActionDepth -= 1;
    }
  }

  async function clickElement(el) {
    if (!el) {
      throw new Error("点击目标不存在");
    }
    await withInternalAction(async function () {
      el.scrollIntoView({ block: "center", behavior: "instant" });
      el.click();
    });
  }

  async function clearAndType(el, text, useHumanLike) {
    var value = String(text || "");
    var settings = app.state.settings || app.DEFAULT_SETTINGS;

    if (!el) {
      throw new Error("输入目标不存在");
    }

    await withInternalAction(async function () {
      el.focus();

      if (el.isContentEditable) {
        el.innerText = "";
      } else {
        el.value = "";
      }
      fireInputEvents(el);

      if (!useHumanLike) {
        if (el.isContentEditable) {
          el.innerText = value;
        } else {
          el.value = value;
        }
        fireInputEvents(el);
        return;
      }

      for (var i = 0; i < value.length; i += 1) {
        var char = value.charAt(i);
        if (el.isContentEditable) {
          el.innerText += char;
        } else {
          el.value += char;
        }
        fireInputEvents(el);
        await sleep(randomBetween(settings.typingMinMs, settings.typingMaxMs));
      }
    });
  }

  async function waitFor(checkFn, timeoutMs, stepMs) {
    var timeout = Number(timeoutMs || 10000);
    var step = Number(stepMs || 250);
    var start = Date.now();

    while (Date.now() - start < timeout) {
      var ok = false;
      try {
        ok = Boolean(await checkFn());
      } catch (err) {
        ok = false;
      }
      if (ok) {
        return true;
      }
      await sleep(step);
    }

    return false;
  }

  function getVisibleText(el) {
    if (!el) {
      return "";
    }
    return (el.innerText || el.textContent || "").replace(/\s+/g, "");
  }

  function isInsideAssistantPanel(el) {
    if (!el || !el.closest) {
      return false;
    }
    return !!(el.closest("#cnnvd-assistant-root") || el.closest("#cnnvd-assistant-toggle"));
  }

  function hasVisibleText(text) {
    return !!app.selectors.findByText(String(text || ""));
  }

  function getVisibleDropdownContainers() {
    var nodes = Array.prototype.slice.call(
      document.querySelectorAll(".el-select-dropdown,.el-autocomplete-suggestion,[role='listbox']")
    );
    return nodes.filter(function (el) {
      return app.selectors.isVisible(el) && !isInsideAssistantPanel(el);
    });
  }

  function getDropdownOptions(container) {
    if (!container) {
      return [];
    }

    var options = Array.prototype.slice.call(
      container.querySelectorAll(".el-select-dropdown__item,.el-autocomplete-suggestion li,[role='option']")
    );

    if (!options.length) {
      options = Array.prototype.slice.call(container.querySelectorAll("li"));
    }

    return options.filter(function (el) {
      if (!app.selectors.isVisible(el) || isInsideAssistantPanel(el)) {
        return false;
      }
      var cls = String(el.className || "");
      if (cls.indexOf("is-disabled") >= 0 || el.getAttribute("aria-disabled") === "true") {
        return false;
      }
      return getVisibleText(el).length > 0;
    });
  }

  function findActiveDropdownContainer(preferredContainer) {
    if (preferredContainer && app.selectors.isVisible(preferredContainer)) {
      var preferredOptions = getDropdownOptions(preferredContainer);
      if (preferredOptions.length) {
        return preferredContainer;
      }
    }

    var containers = getVisibleDropdownContainers();
    if (!containers.length) {
      return null;
    }

    var withOptions = containers.find(function (el) {
      return getDropdownOptions(el).length > 0;
    });

    return withOptions || containers[0];
  }

  function hasCveFormError() {
    var formItem = findFormItemByLabel("关联漏洞编号");
    if (!formItem) {
      return false;
    }
    var errors = Array.prototype.slice.call(
      formItem.querySelectorAll(".el-form-item__error,.el-form-item__help")
    ).filter(function (el) {
      return app.selectors.isVisible(el);
    });

    return errors.some(function (el) {
      return getVisibleText(el).indexOf("请添加关联漏洞编号") >= 0;
    });
  }

  function isCveSelectionConfirmed(cveId, expectNone) {
    var formItem = findFormItemByLabel("关联漏洞编号");
    if (!formItem) {
      return false;
    }

    if (hasCveFormError()) {
      return false;
    }

    var selectedTags = Array.prototype.slice.call(
      formItem.querySelectorAll(".el-tag,.el-select__tags-text")
    ).map(function (el) {
      return getVisibleText(el).toUpperCase();
    }).filter(Boolean);

    if (expectNone) {
      return selectedTags.some(function (t) {
        return t.indexOf("暂无") >= 0;
      });
    }

    var expected = String(cveId || "").toUpperCase();
    return selectedTags.some(function (t) {
      return t.indexOf(expected) >= 0;
    });
  }

  function detectPageStage() {
    var successBtn = findSuccessButton();
    if (successBtn && getVisibleText(successBtn).indexOf("提交成功") >= 0) {
      return "page3";
    }

    var page2Title = app.selectors.getElement("page2_title_input");
    var page2Editor = app.selectors.getElement("page2_editor");
    var page2Submit = app.selectors.findButtonByText
      ? app.selectors.findButtonByText("提交", { exact: true })
      : app.selectors.findByText("提交");
    var page2Hints = 0;
    page2Hints += page2Title ? 1 : 0;
    page2Hints += page2Editor ? 1 : 0;
    page2Hints += page2Submit ? 1 : 0;
    page2Hints += hasVisibleText("撰写漏洞通报") ? 1 : 0;
    if (page2Submit && page2Hints >= 2) {
      return "page2";
    }

    var page1Cve = app.selectors.getElement("page1_cve_input");
    var page1Next = app.selectors.findButtonByText
      ? app.selectors.findButtonByText("下一步", { exact: true })
      : app.selectors.findByText("下一步");
    var page1Hints = 0;
    page1Hints += page1Cve ? 1 : 0;
    page1Hints += page1Next ? 1 : 0;
    page1Hints += hasVisibleText("关联漏洞编号") ? 1 : 0;
    if (page1Hints >= 2) {
      return "page1";
    }

    return "unknown";
  }

  function findMenuItemByExactText(text) {
    var normalized = String(text || "").replace(/\s+/g, "");
    if (!normalized) {
      return null;
    }

    var nodes = Array.prototype.slice.call(
      document.querySelectorAll("li.el-menu-item,div.el-menu-item,span,a")
    ).filter(function (el) {
      return app.selectors.isVisible(el) && !isInsideAssistantPanel(el);
    });

    var exact = nodes.find(function (el) {
      return getVisibleText(el) === normalized;
    });

    if (!exact) {
      return null;
    }

    var menuRoot = exact.closest && exact.closest("li.el-menu-item");
    return menuRoot || exact;
  }

  async function navigateToSendPageSoft() {
    if ((location.pathname || "").indexOf("/backHome/vulWarnSend") >= 0 && detectPageStage() === "page1") {
      return true;
    }

    var menuItem = findMenuItemByExactText("漏洞通报报送");
    if (!menuItem) {
      return false;
    }

    await clickElement(menuItem);

    var atSendPath = await waitFor(function () {
      return (location.pathname || "").indexOf("/backHome/vulWarnSend") >= 0;
    }, 10000, 200);
    if (!atSendPath) {
      return false;
    }

    return waitFor(function () {
      return detectPageStage() === "page1";
    }, 22000, 350);
  }

  async function ensurePage1Ready() {
    var stage = detectPageStage();

    if (stage === "page1") {
      return true;
    }

    if (stage === "page3") {
      var successBtn = findSuccessButton();
      if (successBtn) {
        await app.logger.append("info", "page3", "检测到成功页，点击提交成功按钮返回第一页");
        await clickElement(successBtn);
        var ok = await waitFor(function () {
          return detectPageStage() === "page1";
        }, 12000, 300);
        if (ok) {
          return true;
        }
      }
    }

    await app.logger.append("warn", "page1", "当前不在第一页，尝试切到漏洞通报报送页");
    var recovered = await navigateToSendPageSoft();

    if (recovered) {
      await app.logger.append("info", "page1", "已恢复到第一页");
      return true;
    }

    throw new Error("当前不在第一页，无法继续任务");
  }

  function findDropdownOptionByCve(cveId, container) {
    var options = getDropdownOptions(container || findActiveDropdownContainer());

    var target = options.find(function (el) {
      var text = getVisibleText(el).toUpperCase();
      return text.indexOf(String(cveId || "").toUpperCase()) >= 0;
    });

    return target || null;
  }

  function findNoneOption(container) {
    var options = getDropdownOptions(container || findActiveDropdownContainer());
    var target = options.find(function (el) {
      var text = getVisibleText(el);
      return text === "暂无" || text.indexOf("暂无") >= 0;
    });

    if (target) {
      return target;
    }

    var fallback = app.selectors.findByText("暂无", container || document.body) || app.selectors.findByText("暂无");
    if (fallback && fallback.closest && fallback.closest(".el-select-dropdown,.el-autocomplete-suggestion,[role='listbox']")) {
      return fallback;
    }
    return null;
  }

  function findFormItemByLabel(labelText) {
    var labels = Array.prototype.slice.call(document.querySelectorAll("label,span,div,p"));
    var normalized = labelText.replace(/\s+/g, "");
    var hit = labels.find(function (el) {
      if (!app.selectors.isVisible(el)) {
        return false;
      }
      var text = getVisibleText(el);
      return text.indexOf(normalized) >= 0;
    });

    if (!hit) {
      return null;
    }

    return hit.closest(".el-form-item") || hit.parentElement || null;
  }

  function getVisibleFormItems() {
    return Array.prototype.slice.call(document.querySelectorAll(".el-form-item")).filter(function (item) {
      return app.selectors.isVisible(item) && !isInsideAssistantPanel(item);
    });
  }

  function findRadioRootsByLabel(groupLabel, applyAll) {
    var normalizedLabel = String(groupLabel || "").replace(/\s+/g, "");
    var roots = getVisibleFormItems().filter(function (item) {
      var label = item.querySelector(".el-form-item__label");
      if (!label || !app.selectors.isVisible(label)) {
        return false;
      }
      var text = getVisibleText(label);
      return text.indexOf(normalizedLabel) >= 0;
    });

    if (!roots.length) {
      var fallbackRoot = findFormItemByLabel(groupLabel);
      if (fallbackRoot) {
        roots = [fallbackRoot];
      }
    }

    if (!applyAll && roots.length > 1) {
      return [roots[0]];
    }
    return roots;
  }

  function getRadioCandidates(rootNode) {
    var nodes = Array.prototype.slice.call(
      rootNode.querySelectorAll("label.el-radio,.el-radio,label.el-radio-button,.el-radio-button")
    );
    return nodes.filter(function (node) {
      return app.selectors.isVisible(node) && !isInsideAssistantPanel(node);
    });
  }

  function getRadioNodeText(node) {
    if (!node) {
      return "";
    }
    var label = node.querySelector ? node.querySelector(".el-radio__label,.el-radio-button__inner") : null;
    if (label && app.selectors.isVisible(label)) {
      return getVisibleText(label);
    }
    return getVisibleText(node);
  }

  function findRadioOptionNode(rootNode, optionText) {
    var normalized = String(optionText || "").replace(/\s+/g, "");
    if (!normalized) {
      return null;
    }

    var candidates = getRadioCandidates(rootNode);
    var exact = candidates.find(function (node) {
      return getRadioNodeText(node) === normalized;
    });
    if (exact) {
      return exact;
    }

    var fuzzy = candidates.find(function (node) {
      return getRadioNodeText(node).indexOf(normalized) >= 0;
    });
    return fuzzy || null;
  }

  function isRadioOptionChecked(rootNode, optionText) {
    var node = findRadioOptionNode(rootNode, optionText);
    if (!node) {
      return false;
    }
    var cls = String(node.className || "");
    if (cls.indexOf("is-checked") >= 0 || cls.indexOf("active") >= 0) {
      return true;
    }

    var input = node.querySelector("input[type='radio']");
    return !!(input && input.checked);
  }

  async function setRadioByGroup(groupLabel, optionText, applyAll) {
    var roots = findRadioRootsByLabel(groupLabel, applyAll);

    if (!roots.length) {
      throw new Error("未找到单选组: " + groupLabel);
    }

    for (var i = 0; i < roots.length; i += 1) {
      var rootNode = roots[i].closest ? roots[i].closest(".el-form-item") || roots[i] : roots[i];
      var target = findRadioOptionNode(rootNode, optionText);
      if (!target) {
        if (!applyAll) {
          throw new Error("未找到单选项: " + groupLabel + " -> " + optionText);
        }
        continue;
      }

      if (!isRadioOptionChecked(rootNode, optionText)) {
        await clickElement(target);
        await waitFor(function () {
          return isRadioOptionChecked(rootNode, optionText);
        }, 1500, 100);
      }
    }
  }

  function findSuccessButton() {
    var btn = app.selectors.getElement("page3_success_btn");
    if (btn && app.selectors.isVisible(btn) && !isInsideAssistantPanel(btn) && getVisibleText(btn).indexOf("提交成功") >= 0) {
      return btn;
    }

    var byText = app.selectors.findByText("提交成功");
    if (byText && byText.tagName === "BUTTON" && app.selectors.isVisible(byText) && !isInsideAssistantPanel(byText)) {
      return byText;
    }

    if (byText) {
      var near = byText.closest("button") || byText.querySelector("button");
      if (near && app.selectors.isVisible(near) && !isInsideAssistantPanel(near)) {
        return near;
      }
    }

    var allButtons = Array.prototype.slice.call(document.querySelectorAll("button"));
    return allButtons.find(function (el) {
      return app.selectors.isVisible(el) && !isInsideAssistantPanel(el) && getVisibleText(el).indexOf("提交成功") >= 0;
    }) || null;
  }

  async function waitForUploadDone(task) {
    var zipNameNoExt = String(task.zipName || "").replace(/\.zip$/i, "");
    return waitFor(function () {
      var text = getVisibleText(document.body);
      return text.indexOf(zipNameNoExt.replace(/\s+/g, "")) >= 0;
    }, 30000, 500);
  }

  async function fillPage1(task) {
    await app.logger.append("info", "page1", "开始填写第一页", task.id);

    var cveInput = app.selectors.getElement("page1_cve_input", { visible: false });
    if (!cveInput) {
      throw new Error("未找到关联漏洞编号输入框");
    }

    await clearAndType(cveInput, task.cveId, true);
    await delayStep();

    await clickElement(cveInput);

    var dropdownReady = await waitFor(function () {
      var preferred = app.selectors.getElement("page1_dropdown_container", { visible: false });
      var container = findActiveDropdownContainer(preferred);
      return !!(container && getDropdownOptions(container).length);
    }, 8000, 250);

    if (!dropdownReady) {
      throw new Error("关联漏洞下拉未出现，请重标定“关联漏洞输入框/下拉容器”");
    }

    var dropdownContainer = findActiveDropdownContainer(
      app.selectors.getElement("page1_dropdown_container", { visible: false })
    );
    var option = findDropdownOptionByCve(task.cveId, dropdownContainer || undefined);
    var selectedNone = false;

    if (option) {
      await clickElement(option);
      await app.logger.append("info", "page1", "关联漏洞下拉已匹配: " + task.cveId, task.id);
    } else {
      var noneOption = app.selectors.getElement("page1_none_option");
      if (
        !noneOption ||
        getVisibleText(noneOption).indexOf("暂无") === -1 ||
        !(noneOption.closest && noneOption.closest(".el-select-dropdown,.el-autocomplete-suggestion,[role='listbox']"))
      ) {
        noneOption = findNoneOption(dropdownContainer || undefined);
      }
      if (!noneOption) {
        throw new Error("未找到“暂无”选项");
      }
      await clickElement(noneOption);
      selectedNone = true;
      await app.logger.append("info", "page1", "关联漏洞无匹配，已选择暂无", task.id);
    }

    var cveSelected = await waitFor(function () {
      return isCveSelectionConfirmed(task.cveId, selectedNone);
    }, 6000, 250);
    if (!cveSelected) {
      throw new Error("关联漏洞编号未成功选中，请重试或重标定");
    }

    var s = app.state.settings || app.DEFAULT_SETTINGS;

    await setRadioByGroup("有无POC", s.hasPoc, false);
    await setRadioByGroup("有无EXP", s.hasExp, false);
    await setRadioByGroup("有无检测工具", s.hasTool, false);
    await setRadioByGroup("是否验证过", s.verified, true);

    await delayStep();

    var uploadInput = app.selectors.getElement("page1_upload_input", { visible: false });
    if (!uploadInput) {
      throw new Error("未找到上传控件");
    }
    if (
      uploadInput.tagName !== "INPUT" ||
      String(uploadInput.type || "").toLowerCase() !== "file"
    ) {
      throw new Error("上传控件标定错误，请将“上传文件input”重置为 input[type=file]");
    }

    var zipBlob = await app.queue.getBlob(task.zipBlobId);
    if (!zipBlob) {
      throw new Error("未找到待上传zip数据");
    }

    await withInternalAction(async function () {
      var file = new File([zipBlob], task.zipName || "upload.zip", { type: "application/zip" });
      var dt = new DataTransfer();
      dt.items.add(file);
      uploadInput.files = dt.files;
      fireInputEvents(uploadInput);
    });

    var uploaded = await waitForUploadDone(task);
    if (!uploaded) {
      await app.logger.append("warn", "page1", "未检测到上传完成标志，继续执行", task.id);
    } else {
      await app.logger.append("info", "page1", "附件上传完成: " + task.zipName, task.id);
    }

    var supportName = app.selectors.getElement("page1_support_name", { visible: false });
    var supportPhone = app.selectors.getElement("page1_support_phone", { visible: false });
    var supportEmail = app.selectors.getElement("page1_support_email", { visible: false });

    if (!supportName || !supportPhone || !supportEmail) {
      throw new Error("技术支持字段定位失败，请重标定");
    }

    await clearAndType(supportName, s.supportName || "", true);
    await clearAndType(supportPhone, s.supportPhone || "", true);
    await clearAndType(supportEmail, s.supportEmail || "", true);

    await delayStep();

    var nextBtn = app.selectors.getElement("page1_next_btn");
    if (!nextBtn) {
      var byText = app.selectors.findByText("下一步");
      nextBtn = byText && byText.tagName === "BUTTON" ? byText : byText ? byText.closest("button") : null;
    }

    if (!nextBtn) {
      throw new Error("未找到第一页下一步按钮");
    }

    var nextBtnText = (nextBtn.innerText || nextBtn.textContent || nextBtn.value || "").replace(/\s+/g, "");
    if (nextBtnText.indexOf("上传") >= 0) {
      throw new Error("下一步按钮误命中上传按钮，请在字段配置中重标定“第一页下一步按钮”");
    }

    await clickElement(nextBtn);

    var enteredPage2 = await waitFor(function () {
      if (detectPageStage() === "page2") {
        return true;
      }
      var submitBtn = app.selectors.findButtonByText
        ? app.selectors.findButtonByText("提交", { exact: true })
        : app.selectors.findByText("提交");
      var title = app.selectors.getElement("page2_title_input", { visible: false });
      var editor = app.selectors.getElement("page2_editor", { visible: false });
      return !!(submitBtn && (title || editor || hasVisibleText("撰写漏洞通报")));
    }, 35000, 350);

    if (!enteredPage2) {
      throw new Error("点击下一步后未进入第二页");
    }

    await app.logger.append("info", "page1", "第一页完成，已进入第二页", task.id);
  }

  function isEditor(el) {
    return !!el && (
      el.isContentEditable ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "INPUT" ||
      el.tagName === "IFRAME"
    );
  }

  async function fillEditorPlainText(editor, text) {
    if (!isEditor(editor)) {
      throw new Error("正文编辑器不可用");
    }

    var plain = String(text || "");
    await withInternalAction(async function () {
      editor.focus();
      if (editor.tagName === "IFRAME") {
        var doc = editor.contentDocument || (editor.contentWindow && editor.contentWindow.document);
        var body = doc && doc.body ? doc.body : null;
        if (!body) {
          throw new Error("正文编辑器iframe不可访问");
        }
        body.focus();
        body.innerHTML = "";
        body.dispatchEvent(new Event("input", { bubbles: true }));

        var iframeLines = plain.split(/\r?\n/);
        body.innerHTML = iframeLines
          .map(function (line) {
            var escaped = line
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            return "<p>" + (escaped || "<br>") + "</p>";
          })
          .join("");

        body.dispatchEvent(new Event("input", { bubbles: true }));
        body.dispatchEvent(new Event("change", { bubbles: true }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (editor.isContentEditable) {
        editor.innerText = "";
        editor.dispatchEvent(new Event("input", { bubbles: true }));

        var lines = plain.split(/\r?\n/);
        editor.innerHTML = lines
          .map(function (line) {
            var escaped = line
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            return "<p>" + (escaped || "<br>") + "</p>";
          })
          .join("");

        editor.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        editor.value = plain;
        fireInputEvents(editor);
      }
    });
  }

  async function fillPage2(task) {
    await app.logger.append("info", "page2", "开始填写第二页", task.id);

    var titleInput = app.selectors.getElement("page2_title_input", { visible: false });
    if (!titleInput) {
      throw new Error("未找到漏洞通报名称输入框");
    }

    await clearAndType(titleInput, task.bulletinTitle, true);
    await delayStep();

    var editor = app.selectors.getElement("page2_editor", { visible: false });
    if (!editor) {
      throw new Error("未找到正文编辑区");
    }

    await fillEditorPlainText(editor, task.textBody || "");
    await app.logger.append("info", "page2", "已写入正文纯文本", task.id);

    var mode = (app.state.settings && app.state.settings.submitMode) || "auto";
    if (mode === "manual") {
      await pauseQueue("第二页为手动提交模式，请手工点提交后再继续");
      await app.queue.updateTask(task.id, { status: "paused", reason: "等待手动提交" });
      emitStateChange();
      return;
    }

    await delayStep();

    var submitBtn = app.selectors.getElement("page2_submit_btn");
    if (!submitBtn) {
      var byText = app.selectors.findByText("提交");
      submitBtn = byText && byText.tagName === "BUTTON" ? byText : byText ? byText.closest("button") : null;
    }

    if (!submitBtn) {
      throw new Error("未找到第二页提交按钮");
    }

    var submitText = (submitBtn.innerText || submitBtn.textContent || submitBtn.value || "").replace(/\s+/g, "");
    if (submitText.indexOf("提交成功") >= 0) {
      throw new Error("第二页提交按钮误命中成功页按钮，请在字段配置中重标定“第二页提交按钮”");
    }

    await clickElement(submitBtn);

    var enteredPage3 = await waitFor(function () {
      return detectPageStage() === "page3";
    }, 25000, 400);

    if (!enteredPage3) {
      throw new Error("提交后未进入成功页");
    }

    await app.logger.append("info", "page2", "第二页提交完成", task.id);
  }

  async function finishPage3(task) {
    var successAnchor = app.selectors.findByText("提交成功");
    if (!successAnchor) {
      throw new Error("未检测到提交成功文本");
    }

    var successBtn = findSuccessButton();
    if (!successBtn) {
      throw new Error("未找到提交成功按钮");
    }

    await clickElement(successBtn);

    var backPage1 = await waitFor(function () {
      return detectPageStage() === "page1";
    }, 14000, 350);

    if (!backPage1) {
      await app.logger.append("warn", "page3", "成功页后未回第一页，尝试切到报送页", task.id);
      var recovered = await navigateToSendPageSoft();

      if (!recovered) {
        throw new Error("点击提交成功后未返回第一页");
      }
    }

    await app.logger.append("info", "page3", "任务提交成功并返回第一页", task.id);
  }

  async function runTask(task) {
    await ensurePage1Ready();
    await fillPage1(task);
    if ((app.state.runtime && app.state.runtime.paused) || !(app.state.runtime && app.state.runtime.running)) {
      return;
    }
    await fillPage2(task);
    if ((app.state.runtime && app.state.runtime.paused) || !(app.state.runtime && app.state.runtime.running)) {
      return;
    }
    await finishPage3(task);
  }

  async function completeTaskSuccess(taskId) {
    await app.queue.updateTask(taskId, {
      status: "success",
      reason: "",
      retries: app.queue.getTaskById(taskId).retries || 0
    });
  }

  async function failTaskWithRetry(task, errorMessage) {
    var nowTask = app.queue.getTaskById(task.id) || task;
    var currentRetries = Number(nowTask.retries || 0);

    if (currentRetries < 2) {
      await app.queue.updateTask(task.id, {
        status: "pending",
        retries: currentRetries + 1,
        reason: "重试中: " + errorMessage
      });
      await app.logger.append("warn", "retry", "任务重试(" + (currentRetries + 1) + "/2): " + errorMessage, task.id);
      return;
    }

    await app.queue.updateTask(task.id, {
      status: "failed",
      reason: errorMessage,
      retries: currentRetries
    });
    await app.logger.append("error", "task", "任务失败: " + errorMessage, task.id);
  }

  async function runLoop() {
    if (loopBusy) {
      return;
    }
    loopBusy = true;

    try {
      while (app.state.runtime.running && !app.state.runtime.paused) {
        var task = app.queue.getNextPendingTask();

        if (!task) {
          await app.queue.saveRuntime({
            running: false,
            paused: false,
            currentTaskId: ""
          });
          await app.logger.append("info", "queue", "队列已完成");
          emitStateChange();
          break;
        }

        await app.queue.saveRuntime({ currentTaskId: task.id });
        await app.queue.updateTask(task.id, { status: "running", reason: "" });
        emitStateChange();

        try {
          await app.logger.append("info", "task", "开始任务: " + task.fileName, task.id);
          await runTask(task);

          if (app.state.runtime.paused || !app.state.runtime.running) {
            var updated = app.queue.getTaskById(task.id);
            if (updated && updated.status === "running") {
              await app.queue.updateTask(task.id, { status: "paused", reason: "运行已暂停" });
            }
            emitStateChange();
            break;
          }

          await completeTaskSuccess(task.id);
          await app.logger.append("info", "task", "任务完成: " + task.fileName, task.id);
          emitStateChange();
          await delayStep();
        } catch (err) {
          var message = err && err.message ? err.message : String(err);
          await failTaskWithRetry(task, message);
          emitStateChange();
          await delayStep();
        }
      }
    } finally {
      loopBusy = false;
      emitStateChange();
    }
  }

  async function startQueue() {
    var counts = app.queue.getQueueCounts();
    if (!counts.pending) {
      await app.logger.append("warn", "queue", "没有可执行的待处理任务");
      emitStateChange();
      return;
    }

    await app.queue.saveRuntime({
      running: true,
      paused: false,
      currentTaskId: ""
    });

    await app.logger.append("info", "queue", "队列开始执行");
    emitStateChange();
    runLoop();
  }

  async function pauseQueue(reason) {
    var why = reason || "手动暂停";
    await app.queue.saveRuntime({
      running: false,
      paused: true
    });

    var currentTaskId = app.state.runtime.currentTaskId;
    if (currentTaskId) {
      var current = app.queue.getTaskById(currentTaskId);
      if (current && current.status === "running") {
        await app.queue.updateTask(currentTaskId, {
          status: "paused",
          reason: why
        });
      }
    }

    await app.logger.append("warn", "queue", why, currentTaskId || "");
    emitStateChange();
  }

  async function resumeQueue() {
    var pausedTasks = (app.state.tasks || []).filter(function (task) {
      return task.status === "paused";
    });

    if (pausedTasks.length) {
      var reset = app.state.tasks.map(function (task) {
        if (task.status === "paused") {
          return Object.assign({}, task, { status: "pending", reason: "" });
        }
        return task;
      });
      await app.queue.saveTasks(reset);
    }

    await app.queue.saveRuntime({
      running: true,
      paused: false
    });

    await app.logger.append("info", "queue", "队列继续执行");
    emitStateChange();
    runLoop();
  }

  async function stopQueue() {
    await app.queue.saveRuntime({
      running: false,
      paused: false,
      currentTaskId: ""
    });

    var reset = (app.state.tasks || []).map(function (task) {
      if (task.status === "running" || task.status === "paused") {
        return Object.assign({}, task, {
          status: "pending",
          reason: ""
        });
      }
      return task;
    });
    await app.queue.saveTasks(reset);

    await app.logger.append("warn", "queue", "队列已停止");
    emitStateChange();
  }

  function installManualInterferenceWatcher() {
    var onUserAction = function (event) {
      if (!event.isTrusted) {
        return;
      }
      if (internalActionDepth > 0) {
        return;
      }
      var runtime = app.state.runtime || app.DEFAULT_RUNTIME;
      if (!runtime.running || runtime.paused) {
        return;
      }
      if (event.target && event.target.closest && event.target.closest("#cnnvd-assistant-root")) {
        return;
      }
      pauseQueue("检测到人工操作，已自动暂停");
    };

    document.addEventListener("click", onUserAction, true);
    document.addEventListener("input", onUserAction, true);
    document.addEventListener("keydown", onUserAction, true);
  }

  async function init() {
    installManualInterferenceWatcher();
    emitStateChange();
  }

  app.automation = {
    init: init,
    startQueue: startQueue,
    pauseQueue: pauseQueue,
    resumeQueue: resumeQueue,
    stopQueue: stopQueue,
    detectPageStage: detectPageStage,
    runLoop: runLoop
  };
})(window);
