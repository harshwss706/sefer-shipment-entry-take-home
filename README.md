# Entry Desk

A TypeScript web app that turns shipment PDFs into a **reviewable NetCHB entry XML draft**, with page-level evidence, discrepancies, missing filing information and an editable review workflow.

The supplied shipment is **not ready to file from these documents alone**. The example deliberately omits unknown required header values instead of fabricating them; it fails XSD validation until those values are supplied. The six-digit invoice HS codes pass NetCHB's permissive XSD but are still blocked by the app until a broker supplies ten-digit US HTS codes and statistical quantities. XSD validity and filing readiness are separate signals.

## Run locally

Requires Node.js **24 LTS**, npm, Poppler (`pdftoppm`) and libxml2 (`xmllint`).

```bash
# macOS
brew install node@24 poppler libxml2
# If Homebrew's xmllint is not on PATH:
# export XMLLINT_PATH="$(brew --prefix libxml2)/bin/xmllint"

# Ubuntu/Debian, with Node 24 already installed
# sudo apt-get install poppler-utils libxml2-utils

npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend on port 3001. No API key is required. Click **Open reviewed example** to inspect the supplied shipment without uploading; this fixture explicitly includes visual transcription corrections. Uploading the actual PDFs runs the extraction pipeline from scratch and can produce OCR mistakes that require review.

Production, locally:

```bash
npm run build
npm start
# http://127.0.0.1:3001
```

Docker bundles the system dependencies:

```bash
docker build -t entry-desk .
docker run --rm -p 127.0.0.1:3001:3001 --env-file .env entry-desk
```

No hosted deployment is claimed. The server binds to loopback by default. Public deployment needs authentication, isolated workers and durable storage; the Docker example is for local use.

## Extraction modes

**Local baseline (default):** PDF.js reconstructs embedded text by position. Scanned pages are rasterized with Poppler, deskewed and stripped of long table grid strokes, then read with Tesseract.js. English OCR data is bundled in the npm dependency, so OCR does not download language assets at request time. Conservative rules recognize labeled fields, common invoice tables and packing rows. All facts retain a page and quote. The parser contains no shipment IDs, prices, item styles or filenames specific to the supplied shipment.

**Structured AI extraction (recommended for unseen layouts):** set `OPENAI_API_KEY` in `.env`. `EXTRACTION_MODEL` defaults to `gpt-4.1-mini`; `OPENAI_BASE_URL` supports a compatible chat-completions endpoint. The backend sends extracted page text, not PDF binaries, to the configured provider. The UI reports the active mode. The document is untrusted data: a system instruction forbids following embedded instructions and forbids inventing missing facts. JSON is checked with Zod, and facts whose quotes cannot be found on the cited page are discarded. A valid quote is evidence of presence, not proof that its interpretation is correct; human review remains necessary.

The live AI provider was **not exercised** during development because no key was available. Its adapter is tested with a mocked response. Local PDF extraction, OCR, reconciliation, actual XSD validation and browser upload were exercised with the supplied files. OCR is English only; poor scans, complex layouts and handwriting can still be misread.

## Review and export

1. Upload up to six PDFs (20 MB each, 60 MB combined, 40 pages combined; each PDF at most 30 pages).
2. Inspect source text and exact quotes. The app keeps original evidence immutable when selected values are edited.
3. Supply broker metadata and per-line HTS, MID and statistical quantities. The full shipment JSON editor supports transport fields, descriptions, weights, prices and extra lines.
4. Save and regenerate. Supply corrected evidence for disagreements and record a decision. Review notes cannot waive missing-field blockers. Shipment or broker-data edits invalidate previous decisions.
5. Download the draft XML at any time after saving, or a reviewed export once the schema passes and all issues are addressed. Download the JSON report to retain provenance and decisions.

The current filing-readiness rules cover **ordinary ocean consumption entries (01)** with master/house bills. Air, land, other entry types, waiver handling, comprehensive agency filings and complex multi-invoice accounting require further work. Recognizing document data is broader than the supported filing subset. The app does not transmit to NetCHB or CBP.

## NetCHB research

The public service directory led to the real SOAP WSDL and upload schema:

- [EntryUploadService WSDL](https://www.netchb.com/main/services/entry/EntryUploadService?wsdl)
- [Entry XML XSD](https://www.netchb.com/xml/entry/entry.xsd)
- [Shared datatypes XSD](https://www.netchb.com/xml/data/data_type.xsd)
- [Upload response documentation](https://www.netchb.com/xml/entry/entryUploadResponse.html)

`uploadEntry(username, password, entryXml)` is SOAP 1.1 RPC/literal in `http://www.netchb.com/`, at `https://www.netchb.com/main/services/entry/EntryUploadService`, with an empty SOAPAction. `entryXml` is a string containing a separately namespaced entry document. This app generates that inner document, not a credential-bearing SOAP request.

Entry namespace: `http://www.netchb.com/xml/entry`. Root children must follow the XSD sequence: `entry-no`, optional controls, `header`, optional consolidated entries, `manifest`, optional `containers`/ACE parties, then `invoices`. Header uses `xsd:all`; required header fields are processing port, entry port, entry date and entry type. A line needs country-origin and tariffs; each tariff needs tariff-no and value. `invoice-no` allows only 1–17 letters/digits/hyphens, so `KBAS/NB/26-0912` maps visibly to `KBAS-NB-26-0912`. Bond values are `00`, `08`, `09`, not the response example's single digits. The XSD permits 5–10 digit tariff numbers; the app requires broker-confirmed ten-digit codes for readiness.

`<system-generated/>` delegates entry numbering to the broker's NetCHB account. The app does not include `transmit`, certification, blanket PGA disclaimers, invented duty rates or `precalculated`. Response XML has fields that upload XML does not, such as `line-no` and `tariff-description`; those are intentionally not copied into requests. NetCHB upload acceptance is not CBP acceptance, and an importer must exist in the account's importer table.

Schema and WSDL snapshots are in `schema/`. Retrieved **2026-10-06**. The sole schema modification is replacing the shared datatype import URL with `data_type.xsd` to permit offline `xmllint --nonet` validation. No constraints were relaxed. Research details and mapping are in [docs/netchb.md](docs/netchb.md).

## Supplied shipment findings

| Finding | Evidence and provisional treatment |
|---|---|
| T-shirt arithmetic | 2,400 × $2.85 = $6,840; printed amount $6,480. Preserve $6,480 pending corrected invoice. |
| Invoice totals | First three amounts total $21,615 versus carried $21,975. All commercial amounts total $22,875 versus stated FOB $23,235. Both differ by $360. |
| Hoodies | Invoice 1,200 pieces, 60/40 cotton/polyester; packing 1,176 pieces, `TC 65/35`. Preserve invoice provisionally and flag both differences. |
| Piece count | Invoice 5,100 commercial + 24 samples = 5,124; packing rows total 5,100 including samples. |
| Gross weight | Packing 1,888 kg; B/L 1,930 kg. Preserve packing provisionally; carrier correction needed. |
| Blouse assist | $1,260 CMT + $4,180 buyer fabric = proposed $5,440, subject to assist cost and apportionment verification. |
| FOC samples | $24 declared customs value, Bangladesh origin and Bangladesh manufacturer, despite blanket Vietnam declarations. No exemption assumed. |
| Freight/insurance | $3,850 + $185 reported separately as $4,035 charges; excluded from the provisional customs value subject to actual-cost evidence. |
| Bill/container OCR | Master bill visually reads OPLUSGN260917735. Printed container ending 8 is crossed out; handwritten replacement appears OPLU3041722, consistent with its check digit. Carrier/AMS confirmation remains required. |

**Provisional customs value: $22,875 + $4,180 + $24 = $27,079.** If the seller confirms the T-shirt line should instead be $6,840, the corresponding value becomes $27,439. Neither discrepancy is silently resolved. The statutory valuation basis and actual assist/freight evidence need broker review ([CBP assist guidance/ruling](https://rulings.cbp.gov/ruling/H354576), [CBP freight/insurance guidance/ruling](https://rulings.cbp.gov/ruling/546363)).

Files:

- `examples/entry.draft.xml`: generated after explicit visual transcription corrections, still incomplete for filing.
- `examples/entry.unreviewed.draft.xml`: generated directly from the local extraction fixture.
- `examples/review-report.json`: selected values, evidence, issues, totals, schema result and visual review notes.
- `examples/visual-review.json`: transparent corrections; no automatic-extraction accuracy is claimed for these.
- `docs/approach.pdf`: one-page writeup.

Reproduce from the committed extraction fixture:

```bash
npm run sample
```

Re-extract from the source PDFs (filenames are ordinary inputs, not parser triggers):

```bash
npm run sample -- /path/to/invoice.pdf /path/to/packing.pdf /path/to/bill.pdf
```

The sample script applies `examples/visual-review.json` only when preparing the supplied example deliverable; the upload extractor never reads that fixture. Do not use this sample-generation script for an unrelated shipment; use the app instead.

## Verification

```bash
npm test
npm run build
```

Tests cover the supplied discrepancies, multi-page invoices, assist/sample treatment, an unseen EUR/Italy invoice, unsupported layouts, invalid evidence, immutable blockers, stale decisions, duplicate IDs, XML escaping, invoice normalization and actual schema pass/fail. A schema-valid synthetic test uses **test-only** broker data; it is not substituted into the real sample. GitHub Actions installs the system dependencies and runs build/tests.

## Data handling and limits

Uploads are processed in memory. Temporary OCR files use random private directories and are deleted after extraction. Extracted text and evidence stay in backend memory for one hour, with at most 16 review sessions; restart discards sessions. API responses disable caching. Source PDF binaries are not retained or sent to the optional AI provider. One upload is processed at a time. This prototype has no accounts, persistence, OCR cancellation or worker isolation and should not be exposed publicly without additional safeguards.

The chat-history deliverable is in `docs/ai-chat-history.md`, with linked image assets, and is also provided separately. It preserves the visible conversation and tool activity; hidden model reasoning and internal system instructions are not part of a chat export.
