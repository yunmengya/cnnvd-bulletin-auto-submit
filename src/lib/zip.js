(function initZip(global) {
  var app = global.__CNNVD_ASSISTANT__;
  if (!app) {
    return;
  }

  async function buildSingleDocxZip(file) {
    if (!global.JSZip) {
      throw new Error("JSZip not loaded");
    }

    var zip = new global.JSZip();
    var buffer = await file.arrayBuffer();
    zip.file(file.name, buffer);
    var blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });

    var zipName = String(file.name || "file.docx").replace(/\.docx$/i, "") + ".zip";
    return {
      zipName: zipName,
      zipBlob: blob
    };
  }

  app.zip = {
    buildSingleDocxZip: buildSingleDocxZip
  };
})(window);
