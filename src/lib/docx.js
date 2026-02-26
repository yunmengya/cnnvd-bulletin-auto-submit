(function initDocx(global) {
  var app = global.__CNNVD_ASSISTANT__;
  if (!app) {
    return;
  }

  var CVE_REGEX = /CVE-\d{4}-\d{4,7}/i;

  function extractCve(fileName) {
    var match = String(fileName || "").match(CVE_REGEX);
    return match ? match[0].toUpperCase() : "";
  }

  function normalizeSubject(fileName) {
    var name = String(fileName || "");
    name = name.replace(/\.[^./\\]+$/, "");
    name = name.replace(/^\s*【漏洞通报】\s*/i, "");
    name = name.replace(/[（(]\s*CVE-\d{4}-\d{4,7}\s*[)）]\s*$/i, "");
    return name.trim();
  }

  function buildBulletinTitle(subject) {
    return "关于" + subject + "的通报";
  }

  async function extractTextFromDocx(file) {
    if (!global.JSZip) {
      throw new Error("JSZip not loaded");
    }

    var buffer = await file.arrayBuffer();
    var zip = await global.JSZip.loadAsync(buffer);
    var documentXml = zip.file("word/document.xml");

    if (!documentXml) {
      throw new Error("word/document.xml not found");
    }

    var xmlString = await documentXml.async("string");
    var xml = new DOMParser().parseFromString(xmlString, "application/xml");
    var xmlError = xml.querySelector("parsererror");

    if (xmlError) {
      throw new Error("docx xml parse failed");
    }

    var paragraphs = Array.prototype.slice.call(xml.getElementsByTagName("w:p"));

    var lines = paragraphs
      .map(function (p) {
        var texts = Array.prototype.slice.call(p.getElementsByTagName("w:t"));
        return texts
          .map(function (node) {
            return node.textContent || "";
          })
          .join("")
          .trim();
      })
      .filter(function (line) {
        return line.length > 0;
      });

    return lines.join("\n");
  }

  function extractBodyFromAnchor(fullText) {
    var text = String(fullText || "");
    if (!text.trim()) {
      return "";
    }

    var anchors = ["产品描述", "1、产品描述", "1. 产品描述"];
    var best = -1;

    anchors.forEach(function (anchor) {
      var idx = text.indexOf(anchor);
      if (idx >= 0 && (best === -1 || idx < best)) {
        best = idx;
      }
    });

    if (best === -1) {
      return "";
    }

    return text.slice(best).trim();
  }

  function isDocx(file) {
    return /\.docx$/i.test(String(file && file.name ? file.name : ""));
  }

  function keywordMatch(fileName, keywords) {
    var source = String(fileName || "").toLowerCase();
    var list = Array.isArray(keywords) ? keywords : [];
    for (var i = 0; i < list.length; i += 1) {
      var keyword = String(list[i] || "").trim().toLowerCase();
      if (!keyword) {
        continue;
      }
      if (source.indexOf(keyword) !== -1) {
        return keyword;
      }
    }
    return "";
  }

  app.docx = {
    extractCve: extractCve,
    normalizeSubject: normalizeSubject,
    buildBulletinTitle: buildBulletinTitle,
    extractTextFromDocx: extractTextFromDocx,
    extractBodyFromAnchor: extractBodyFromAnchor,
    isDocx: isDocx,
    keywordMatch: keywordMatch
  };
})(window);
