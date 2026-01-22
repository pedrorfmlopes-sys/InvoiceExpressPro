const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

const PDF_PATH = path.resolve(__dirname, '../data/staging/reg_test.pdf');

async function val() {
    try {
        if (!fs.existsSync(PDF_PATH)) {
            console.log("File not found:", PDF_PATH);
            // Try another
            const folder = path.resolve(__dirname, '../uploads');
            const files = fs.readdirSync(folder).filter(f => f.endsWith('.pdf'));
            if (files.length) {
                const alt = path.join(folder, files[0]);
                console.log("Trying alt:", alt);
                const buf = fs.readFileSync(alt);
                const data = await pdf(buf);
                console.log("TEXT START:\n", data.text.substring(0, 500));
                return;
            }
            return;
        }
        const buf = fs.readFileSync(PDF_PATH);
        const data = await pdf(buf);
        console.log("TEXT START:\n", data.text.substring(0, 500));
    } catch (e) {
        console.error(e);
    }
}
val();
