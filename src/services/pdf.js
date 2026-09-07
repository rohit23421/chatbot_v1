import { createRequire } from "module";

// pdf-parse is a CommonJS package and doesn't interop cleanly with
// native ESM `import` in some Node versions — createRequire is the
// standard workaround for pulling in CJS packages like this.
const require = createRequire(import.meta.url);
const pdfParseModule = require("pdf-parse");

// Depending on the installed version/module resolution, pdf-parse may
// come through as a plain function OR wrapped in a `.default` — handle
// both so this doesn't silently break again on a future install.
const pdfParse =
    typeof pdfParseModule === "function" ? pdfParseModule : pdfParseModule.default;

if (typeof pdfParse !== "function") {
    throw new Error(
        "pdf-parse did not resolve to a callable function — check the installed version."
    );
}

/**
 * Extracts plain text from a PDF buffer. Works well for normal, text-based
 * PDFs (reports, invoices, exported documents). It will NOT extract
 * anything meaningful from a scanned/photographed PDF that has no real
 * text layer — that needs OCR, which is a separate, harder feature.
 */
export async function extractPdfText(buffer) {
    const result = await pdfParse(buffer);
    return result.text.trim();
}

/**
 * Rough heuristic: if we got almost no text back from a PDF, it's very
 * likely a scanned/image-only PDF rather than a real parsing failure.
 */
export function looksLikeScannedPdf(extractedText) {
    return extractedText.length < 50;
}
