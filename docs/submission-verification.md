# Submission verification — 2026-10-07

- TypeScript typecheck and production Vite build: passed.
- All 10 regression tests: passed, including actual NetCHB XSD pass/fail, unseen invoice data, evidence validation, XML escaping, and stale review decisions.
- Fresh HTTP multipart upload of the three supplied PDFs: passed; 3 source documents, 5 invoice lines, provisional customs value USD 27,079, 44 review items, readiness false.
- HTTP review regeneration using test-only ports 1234, entry type 01, date 2026-10-07: actual XSD passed; filing readiness correctly remained false. These test values were not added to the submission example.
- Empty upload and invalid PDF: both returned HTTP 400.
- Browser: production app loaded; reviewed example and XML screen rendered the correct shipment, missing-header schema errors, and export controls. Copy action showed success. Automated download capture timed out and browser clipboard readback was empty, so downloaded-file and clipboard contents were not independently verified in this browser session.
- Sample generation from the committed fixture reproduced the sample XML without changes.
- Approach PDF: one A4 page. README includes local setup, dependencies, extraction modes, research sources, reproduction, and limitations.
- Offline production dependency audit: reported zero known vulnerabilities using the available local audit data; not a fresh online vulnerability lookup.

## Remaining submission steps and limits

The local repository has no GitHub remote. GitHub creation/push remains pending approval of the exact private destination and inclusion of shipment-derived data and visible chat history. No deployed URL exists; deployment is optional for the assignment. Actual NetCHB upload/CBP acceptance, Docker execution, and the live AI extraction provider have not been tested. Unknown layouts have conservative fallback behavior; arbitrary unseen shipment extraction accuracy is not established by the synthetic regression case.

The supplied XML is deliberately an incomplete draft: required broker header fields and other filing data are absent from the supplied documents. The README and review report explain the missing information rather than inventing it. The chat history is a snapshot through its export timestamp; refresh it after further task work before final submission.
