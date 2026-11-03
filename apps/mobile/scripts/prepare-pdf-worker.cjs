const { mkdirSync, copyFileSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "legacy/build/pdf.worker.min.mjs",
);
mkdirSync(path.join(root, "public"), { recursive: true });
copyFileSync(source, path.join(root, "public/pdf.worker.min.mjs"));

copyFileSync(
  path.join(
    path.dirname(require.resolve("pdfjs-dist/package.json")),
    "legacy/build/pdf.mjs",
  ),
  path.join(root, "public/pdf-reader.mjs"),
);
