(function initSelectors(global) {
  var app = global.__CNNVD_ASSISTANT__;
  if (!app) {
    return;
  }

  var FIELD_DEFS = {
    page1_cve_input: {
      label: "关联漏洞输入框",
      page: "page1",
      selectors: [
        'input[placeholder*="关联漏洞编号"]',
        'input[placeholder*="添加关联漏洞编号"]'
      ]
    },
    page1_dropdown_container: {
      label: "关联漏洞下拉容器",
      page: "page1",
      selectors: [
        ".el-select-dropdown:visible",
        ".el-autocomplete-suggestion",
        '[role="listbox"]'
      ]
    },
    page1_none_option: {
      label: "关联漏洞暂无项",
      page: "page1",
      selectors: [
        ".el-select-dropdown__item",
        ".el-autocomplete-suggestion li",
        '[role="option"]'
      ]
    },
    page1_upload_input: {
      label: "上传文件input",
      page: "page1",
      selectors: ['input[type="file"]']
    },
    page1_support_name: {
      label: "技术支持人员姓名",
      page: "page1",
      selectors: [
        'input[placeholder*="技术支持人员姓名"]',
        'input[name*="support"][name*="name"]'
      ]
    },
    page1_support_phone: {
      label: "技术支持联系电话",
      page: "page1",
      selectors: [
        'input[placeholder*="技术支持联系电话"]',
        'input[name*="support"][name*="phone"]'
      ]
    },
    page1_support_email: {
      label: "技术支持邮箱",
      page: "page1",
      selectors: [
        'input[placeholder*="技术支持邮箱"]',
        'input[name*="support"][name*="email"]'
      ]
    },
    page1_next_btn: {
      label: "第一页下一步按钮",
      page: "page1",
      selectors: [
        'button.el-button--primary',
        'button[type="button"]',
        'input[type="button"]'
      ]
    },
    page2_title_input: {
      label: "漏洞通报名称输入框",
      page: "page2",
      selectors: [
        'input[placeholder*="关于"]',
        'input[placeholder*="通报"]'
      ]
    },
    page2_editor: {
      label: "漏洞通报正文编辑区",
      page: "page2",
      selectors: [
        '[contenteditable="true"]',
        '.w-e-text-container [contenteditable="true"]',
        '.ql-editor',
        'iframe.tox-edit-area__iframe',
        '.tox-edit-area iframe'
      ]
    },
    page2_submit_btn: {
      label: "第二页提交按钮",
      page: "page2",
      selectors: [
        'button.el-button--primary',
        'button[type="button"]'
      ]
    },
    page3_success_text: {
      label: "提交成功文本锚点",
      page: "page3",
      selectors: ["body"]
    },
    page3_success_btn: {
      label: "提交成功按钮",
      page: "page3",
      selectors: [
        'button.el-button--primary',
        'button[type="button"]'
      ]
    }
  };

  function escapeCssIdent(text) {
    return String(text).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }

  function isVisible(el) {
    if (!el) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    var style = global.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function isInsideAssistantPanel(el) {
    if (!el || !el.closest) {
      return false;
    }
    return !!(el.closest("#cnnvd-assistant-root") || el.closest("#cnnvd-assistant-toggle"));
  }

  function getOverrideSelector(fieldKey) {
    var map = (app.state.settings && app.state.settings.selectorOverrides) || {};
    var item = map[fieldKey];
    if (!item || !item.cssPath) {
      return "";
    }
    return String(item.cssPath)
      .replace(/\.cnnvd-bind-hover/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function queryAll(selector) {
    if (!selector) {
      return [];
    }
    if (selector.indexOf(":visible") >= 0) {
      selector = selector.replace(":visible", "");
      return Array.prototype.slice
        .call(document.querySelectorAll(selector))
        .filter(isVisible);
    }
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function findTextNodeElement(keyword, tags) {
    var list = Array.prototype.slice.call(document.querySelectorAll(tags || "label,span,div,p"));
    var target = list.find(function (el) {
      if (!isVisible(el)) {
        return false;
      }
      if (isInsideAssistantPanel(el)) {
        return false;
      }
      var text = (el.innerText || el.textContent || "").replace(/\s+/g, "");
      return text.indexOf(keyword.replace(/\s+/g, "")) >= 0;
    });
    return target || null;
  }

  function findInputNearLabel(labelText) {
    var label = findTextNodeElement(labelText);
    if (!label) {
      return null;
    }

    var roots = [
      label.closest(".el-form-item"),
      label.parentElement,
      label.parentElement && label.parentElement.parentElement
    ].filter(Boolean);

    for (var i = 0; i < roots.length; i += 1) {
      var input = roots[i].querySelector("input,textarea,[contenteditable='true']");
      if (input) {
        return input;
      }
    }

    var nextInput = label.nextElementSibling && label.nextElementSibling.querySelector
      ? label.nextElementSibling.querySelector("input,textarea,[contenteditable='true']")
      : null;

    return nextInput || null;
  }

  function firstMatch(selectors, options) {
    var requireVisible = !(options && options.visible === false);
    for (var i = 0; i < selectors.length; i += 1) {
      var hits = queryAll(selectors[i]);
      if (requireVisible) {
        hits = hits.filter(isVisible);
      }
      if (hits.length) {
        return hits[0];
      }
    }
    return null;
  }

  function findByText(text, root) {
    var scope = root || document.body;
    var all = Array.prototype.slice.call(scope.querySelectorAll("*"));
    var normalized = String(text || "").replace(/\s+/g, "");
    return all.find(function (el) {
      if (!isVisible(el)) {
        return false;
      }
      if (isInsideAssistantPanel(el)) {
        return false;
      }
      var t = (el.innerText || el.textContent || "").replace(/\s+/g, "");
      return t.indexOf(normalized) >= 0;
    }) || null;
  }

  function extractControlText(el) {
    if (!el) {
      return "";
    }
    var text = "";
    if (el.tagName === "INPUT") {
      text = el.value || el.getAttribute("value") || "";
    } else {
      text = el.innerText || el.textContent || "";
    }
    if (!text) {
      text = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    }
    return String(text || "").replace(/\s+/g, "");
  }

  function findButtonByText(text, options) {
    var keyword = String(text || "").replace(/\s+/g, "");
    var exact = !!(options && options.exact);
    var scope = (options && options.root) || document;
    var nodes = Array.prototype.slice.call(
      scope.querySelectorAll("button,input[type='button'],input[type='submit'],a")
    ).filter(function (el) {
      return isVisible(el) && !isInsideAssistantPanel(el);
    });

    var hit = nodes.find(function (el) {
      var content = extractControlText(el);
      if (!content) {
        return false;
      }
      if (exact) {
        return content === keyword;
      }
      return content.indexOf(keyword) >= 0;
    });

    return hit || null;
  }

  function getElement(fieldKey, options) {
    var def = FIELD_DEFS[fieldKey];
    if (!def) {
      return null;
    }

    var override = getOverrideSelector(fieldKey);
    if (override) {
      var overrideHit = firstMatch([override], options);
      if (overrideHit) {
        return overrideHit;
      }
    }

    if (fieldKey === "page1_next_btn") {
      return (
        findButtonByText("下一步", { exact: true }) ||
        findButtonByText("下一步")
      );
    }
    if (fieldKey === "page2_submit_btn") {
      var exactSubmit = findButtonByText("提交", { exact: true });
      if (exactSubmit) {
        return exactSubmit;
      }
      var anySubmit = findButtonByText("提交");
      if (anySubmit) {
        var text = extractControlText(anySubmit);
        if (text.indexOf("提交成功") === -1) {
          return anySubmit;
        }
      }
    }
    if (fieldKey === "page3_success_btn") {
      return (
        findButtonByText("提交成功", { exact: true }) ||
        findButtonByText("提交成功")
      );
    }

    var hit = firstMatch(def.selectors || [], options);
    if (hit) {
      if (fieldKey === "page1_next_btn") {
        var text = (hit.textContent || "").replace(/\s+/g, "");
        if (text && text.indexOf("下一步") === -1) {
          var nextBtn = findByText("下一步");
          if (nextBtn && nextBtn.tagName === "BUTTON") {
            return nextBtn;
          }
        }
      }
      if (fieldKey === "page2_submit_btn") {
        var submit = findByText("提交");
        if (submit && submit.tagName === "BUTTON") {
          return submit;
        }
      }
      return hit;
    }

    if (fieldKey === "page1_cve_input") {
      return findInputNearLabel("关联漏洞编号");
    }
    if (fieldKey === "page1_support_name") {
      return findInputNearLabel("技术支持人员姓名");
    }
    if (fieldKey === "page1_support_phone") {
      return findInputNearLabel("技术支持联系电话");
    }
    if (fieldKey === "page1_support_email") {
      return findInputNearLabel("技术支持邮箱");
    }
    if (fieldKey === "page2_title_input") {
      return findInputNearLabel("漏洞通报名称");
    }
    if (fieldKey === "page2_editor") {
      var iframeEditor = firstMatch(
        ['iframe.tox-edit-area__iframe', '.tox-edit-area iframe'],
        options
      );
      if (iframeEditor) {
        return iframeEditor;
      }
      return findInputNearLabel("漏洞通报");
    }
    if (fieldKey === "page3_success_text") {
      return findByText("提交成功") || document.body;
    }

    return null;
  }

  function getElements(fieldKey, options) {
    var def = FIELD_DEFS[fieldKey];
    if (!def) {
      return [];
    }
    var selectors = [];
    var override = getOverrideSelector(fieldKey);
    if (override) {
      selectors.push(override);
    }
    selectors = selectors.concat(def.selectors || []);
    var all = [];
    selectors.forEach(function (selector) {
      all = all.concat(queryAll(selector));
    });
    var requireVisible = !(options && options.visible === false);
    if (requireVisible) {
      all = all.filter(isVisible);
    }
    return all;
  }

  function getFieldDefs() {
    return FIELD_DEFS;
  }

  function buildCssPath(element) {
    if (!element || !element.tagName) {
      return "";
    }

    if (element.id) {
      return "#" + escapeCssIdent(element.id);
    }

    var path = [];
    var current = element;

    while (current && current.nodeType === 1 && current !== document.body) {
      var part = current.tagName.toLowerCase();

      if (current.classList && current.classList.length) {
        var stableClasses = Array.prototype.slice.call(current.classList)
          .filter(function (cls) {
            return cls && cls.indexOf("cnnvd-bind-") !== 0;
          })
          .slice(0, 2);
        if (stableClasses.length) {
          part += "." + stableClasses.map(escapeCssIdent).join(".");
        }
      }

      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (node) {
          return node.tagName === current.tagName;
        });
        if (siblings.length > 1) {
          part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
      }

      path.unshift(part);
      var selector = path.join(" > ");
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }

      current = parent;
    }

    return path.join(" > ");
  }

  async function saveBinding(fieldKey, cssPath) {
    var current = (app.state.settings && app.state.settings.selectorOverrides) || {};
    var next = Object.assign({}, current);
    next[fieldKey] = {
      cssPath: cssPath,
      label: FIELD_DEFS[fieldKey] ? FIELD_DEFS[fieldKey].label : fieldKey,
      page: FIELD_DEFS[fieldKey] ? FIELD_DEFS[fieldKey].page : "page1"
    };
    await app.queue.saveSettings({ selectorOverrides: next });
    return next[fieldKey];
  }

  async function resetBindings() {
    await app.queue.saveSettings({ selectorOverrides: {} });
  }

  function testBinding(fieldKey) {
    var element = getElement(fieldKey, { visible: false });
    var def = FIELD_DEFS[fieldKey];
    if (!def) {
      return {
        ok: false,
        message: "字段不存在",
        count: 0,
        selector: ""
      };
    }

    var selector = getOverrideSelector(fieldKey) || (def.selectors && def.selectors[0]) || "";
    var count = selector ? queryAll(selector).length : 0;

    if (!element) {
      return {
        ok: false,
        message: "未找到元素",
        count: count,
        selector: selector
      };
    }

    return {
      ok: true,
      message: "命中成功",
      count: count || 1,
      selector: selector
    };
  }

  function findRadioOption(groupLabel, optionText) {
    var labelNode = findTextNodeElement(groupLabel, "label,span,div");
    if (!labelNode) {
      return null;
    }

    var container = labelNode.closest(".el-form-item") || labelNode.parentElement || document.body;
    var items = Array.prototype.slice.call(container.querySelectorAll("label,span,div"));

    var hit = items.find(function (node) {
      var text = (node.textContent || "").replace(/\s+/g, "");
      return text === optionText || text.indexOf(optionText) >= 0;
    });

    if (hit && typeof hit.click === "function") {
      return hit;
    }

    return null;
  }

  app.selectors = {
    getFieldDefs: getFieldDefs,
    getElement: getElement,
    getElements: getElements,
    findByText: findByText,
    findButtonByText: findButtonByText,
    buildCssPath: buildCssPath,
    saveBinding: saveBinding,
    resetBindings: resetBindings,
    testBinding: testBinding,
    findRadioOption: findRadioOption,
    isVisible: isVisible
  };
})(window);
