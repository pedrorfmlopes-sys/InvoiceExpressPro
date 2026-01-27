const pdf = require('pdf-parse');

async function extractWithCoords(dataBuffer) {
    const options = {
        pagerender: function (pageData) {
            return pageData.getTextContent()
                .then(function (textContent) {
                    let items = [];
                    for (let item of textContent.items) {
                        // item.transform [scaleX, skewX, skewY, scaleY, x, y]
                        // PDF origin is usually bottom-left
                        // item.str is the text
                        // item.width, item.height
                        const tx = item.transform;
                        const x = tx[4];
                        const y = tx[5];

                        if (item.str.trim().length === 0) continue; // Skip empty whitespace items? 
                        // Keeping whitespace tokens might be useful for column separation if using text flow, 
                        // but for coordinates, we care about data clusters. 
                        // Let's keep distinct strings.

                        items.push({
                            str: item.str,
                            x: x,
                            y: y,
                            w: item.width,
                            h: item.height || 0 // Sometimes height is hidden in font size, but transform[0/3] usually scales it.
                        });
                    }
                    return JSON.stringify(items) + "\n----------PAGE_BREAK----------\n";
                });
        }
    }

    try {
        const data = await pdf(dataBuffer, options);
        // data.text will contain JSON strings per page separated by break
        const rawPages = data.text.split("----------PAGE_BREAK----------");

        const pages = [];
        let pageNum = 1;
        for (const raw of rawPages) {
            const trimmed = raw.trim();
            if (trimmed.length === 0) continue;
            try {
                const items = JSON.parse(trimmed);
                // Assign page number to items?
                // Or just return array of pages
                pages.push({
                    page: pageNum,
                    items: items
                });
                pageNum++;
            } catch (e) {
                console.error(`Error parsing page ${pageNum} JSON:`, e);
                // Skip malformed
            }
        }
        return pages;

    } catch (e) {
        console.error("PDF Coords Extraction Failed:", e);
        return [];
    }
}

module.exports = { extractWithCoords };
