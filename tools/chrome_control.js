#!/usr/bin/env node

const { spawnSync } = require("child_process");

function usage() {
  console.log(`Usage:
  node tools/chrome_control.js status
  node tools/chrome_control.js start
  node tools/chrome_control.js pause
  node tools/chrome_control.js resume
  node tools/chrome_control.js stop
  node tools/chrome_control.js click <cssSelector>
  node tools/chrome_control.js eval <javascript>

Requires Chrome setting:
  View > Developer > Allow JavaScript from Apple Events
`);
}

function runInChrome(jsCode) {
  const applescript = `
on run argv
  set jsCode to item 1 of argv
  tell application "Google Chrome"
    return execute active tab of front window javascript jsCode
  end tell
end run
`;

  const result = spawnSync("osascript", ["-", jsCode], {
    input: applescript,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const errorText = (result.stderr || result.stdout || "osascript failed").trim();
    if (errorText.includes("通过 AppleScript 执行 JavaScript 的功能已关闭")) {
      throw new Error(
        [
          "Chrome 未开启 AppleScript JS 执行权限。",
          "请在 Chrome 菜单启用：查看 > 开发者 > 允许 Apple 事件中的 JavaScript",
          "启用后重试当前命令。"
        ].join("\\n")
      );
    }
    throw new Error(errorText);
  }

  return (result.stdout || "").trim();
}

function safeJSON(value) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return value;
  }
}

function appSnippet(expr) {
  return `(function(){
    try {
      var root = document.getElementById("cnnvd-assistant-root");
      ${expr}
    } catch (err) {
      return JSON.stringify({ok:false,error:String(err && err.message ? err.message : err)});
    }
  })();`;
}

function clickBySelector(selector) {
  const escaped = JSON.stringify(selector);
  return appSnippet(`
    var el = document.querySelector(${escaped});
    if (!el) {
      return JSON.stringify({ok:false,error:"ELEMENT_NOT_FOUND",selector:${escaped}});
    }
    el.click();
    return JSON.stringify({ok:true,selector:${escaped}});
  `);
}

function clickInPanel(selector) {
  const escaped = JSON.stringify(selector);
  return appSnippet(`
    if (!root) {
      return JSON.stringify({ok:false,error:"PANEL_NOT_FOUND"});
    }
    var el = root.querySelector(${escaped});
    if (!el) {
      return JSON.stringify({ok:false,error:"ELEMENT_NOT_FOUND",selector:${escaped}});
    }
    el.click();
    return JSON.stringify({ok:true,selector:${escaped}});
  `);
}

function statusSnippet() {
  return appSnippet(`
    if (!root) {
      return JSON.stringify({ok:false,error:"PANEL_NOT_FOUND",href:location.href});
    }
    function textOf(sel) {
      var el = root.querySelector(sel);
      return el ? (el.innerText || el.textContent || "").trim() : "";
    }
    function numOf(sel) {
      var t = textOf(sel);
      var raw = String(t || "");
      var digits = "";
      for (var i = 0; i < raw.length; i++) {
        var ch = raw.charAt(i);
        if (ch >= "0" && ch <= "9") {
          digits += ch;
        }
      }
      var n = Number(digits || "0");
      return isNaN(n) ? 0 : n;
    }
    var status = textOf("#cnnvd_status_text");
    return JSON.stringify({
      ok: true,
      href: location.href,
      hasPanel: !!root,
      statusText: status,
      running: status.indexOf("运行中") >= 0,
      paused: status.indexOf("暂停") >= 0,
      currentTask: textOf("#cnnvd_current_task"),
      counts: {
        total: numOf("#cnnvd_count_total"),
        success: numOf("#cnnvd_count_success"),
        failed: numOf("#cnnvd_count_failed")
      },
      importStats: {
        total: numOf("#cnnvd_import_total"),
        filtered: numOf("#cnnvd_import_filtered"),
        queued: numOf("#cnnvd_import_queued"),
        unsupported: numOf("#cnnvd_import_unsupported"),
        duplicate: numOf("#cnnvd_import_duplicate")
      }
    });
  `);
}

function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    usage();
    process.exit(1);
  }

  let js;

  if (cmd === "status") {
    js = statusSnippet();
  } else if (cmd === "start") {
    js = clickInPanel("#cnnvd_start_btn");
  } else if (cmd === "pause") {
    js = clickInPanel("#cnnvd_pause_btn");
  } else if (cmd === "resume") {
    js = clickInPanel("#cnnvd_resume_btn");
  } else if (cmd === "stop") {
    js = clickInPanel("#cnnvd_stop_btn");
  } else if (cmd === "click") {
    const selector = process.argv[3];
    if (!selector) {
      console.error("missing selector");
      process.exit(1);
    }
    js = clickBySelector(selector);
  } else if (cmd === "eval") {
    js = process.argv.slice(3).join(" ");
    if (!js) {
      console.error("missing javascript");
      process.exit(1);
    }
  } else {
    usage();
    process.exit(1);
  }

  const output = runInChrome(js);
  const parsed = safeJSON(output);
  if (typeof parsed === "string") {
    console.log(parsed);
  } else {
    console.log(JSON.stringify(parsed, null, 2));
  }
}

main();
