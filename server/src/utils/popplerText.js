const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function pdfBufferToTextPoppler(pdfBuffer) {
    let exe = process.env.PDFTOTEXT_PATH || "pdftotext";
    const localPoppler = path.join(__dirname, "../../../deps/poppler/poppler-24.08.0/Library/bin/pdftotext.exe");
    if (fs.existsSync(localPoppler)) {
        exe = localPoppler;
    }
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
