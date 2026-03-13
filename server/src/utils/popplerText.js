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
        const output = execFileSync(exe, ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            maxBuffer: 10 * 1024 * 1024, // 10MB
        });
        return output;
    } catch (err) {
        console.error(`[Poppler] pdftotext failed with exe: ${exe}. Error:`, err.message);
        throw new Error(`Falha na extração de PDF (Poppler): ${err.message}`);
    } finally {
        try {
            if (fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn("[Poppler] Cleanup failed:", e.message);
        }
    }
}

module.exports = { pdfBufferToTextPoppler };
