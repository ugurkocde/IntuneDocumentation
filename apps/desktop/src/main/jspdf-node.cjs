// jsPDF's Node build is CommonJS and exposes the constructor as
// exports.jsPDF and exports.default. esbuild bundles the shared generators
// (a "type": "module" package) with Node interop, where a default import
// receives the whole exports object instead. The main process build points
// "jspdf" here so `import jsPDF from "jspdf"` yields the constructor.
module.exports = require("jspdf/dist/jspdf.node.min.js").jsPDF;
