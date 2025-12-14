
// Simulation of Frontend Validation logic
function checkValidation(doc) {
    const hasType = doc.docType || doc.docTypeLabel || doc.docTypeId;
    const hasNumber = doc.docNumber && String(doc.docNumber).trim().length > 0;

    if (!hasType || !hasNumber) {
        let missing = [];
        if (!hasType) missing.push("Tipo do documento");
        if (!hasNumber) missing.push("Nº do documento");
        return `FAIL: Falta: ${missing.join(', ')}`;
    }
    return "PASS";
}

// Test Cases
const cases = [
    { name: "Empty", doc: {}, expected: "FAIL" },
    { name: "Legacy Only", doc: { docType: "Fatura", docNumber: "123" }, expected: "PASS" },
    { name: "Canonical Only", doc: { docTypeLabel: "Fatura", docNumber: "123" }, expected: "PASS" },
    { name: "Review Pending", doc: { docType: null, docTypeLabel: null, docNumber: "123" }, expected: "FAIL" },
    { name: "No Number", doc: { docType: "Fatura" }, expected: "FAIL" }
];

console.log("Running Finalize Logic Verification:");
cases.forEach(c => {
    const res = checkValidation(c.doc);
    const pass = res.startsWith(c.expected);
    console.log(`[${pass ? 'OK' : 'ERR'}] ${c.name}: ${res}`);
});
