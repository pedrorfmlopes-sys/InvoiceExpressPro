const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function pdfBufferToTextPoppler(pdfBuffer) {
    const exe = process.env.PDFTOTEXT_PATH || "pdftotext";
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "invstudio-poppler-"));
    const pdfPath = path.join(tmpDir, "doc.pdf");

    fs.writeFileSync(pdfPath, pdfBuffer);

    try {
        return execFileSync(exe, ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
    } finally {
        try { fs.unlinkSync(pdfPath); } catch { }
        try { fs.rmdirSync(tmpDir); } catch { }
    }
}

module.exports = { pdfBufferToTextPoppler };
