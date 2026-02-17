const ProjectService = require('../server/src/services/ProjectService');

console.log('Scanning projects...');
const projects = ProjectService.listProjects();
console.log('Result:', projects);

if (projects.includes('pedrorfmlopes-sys/InvoiceExpressPro')) {
    console.log('SUCCESS: Target project found!');
} else {
    console.log('FAIL: Target project not found.');
}
