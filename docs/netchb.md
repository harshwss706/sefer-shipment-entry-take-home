# Mapping notes and sources

Researched 2026-10-06 from NetCHB's public WSDL, entry XSD, shared datatypes and response documentation. Public directory: https://www.netchb.com/main/services/JamcoXmlUploadService (lists the other services, including EntryUploadService).

| App value | Upload element | Decision |
|---|---|---|
| Entry number | `entry/entry-no/system-generated` | Account generates number; no invented filer code. |
| Broker metadata | `header/processing-port`, `entry-port`, `entry-date`, `entry-type` | Required by XSD; absent in documents. Omit until supplied. |
| Importer | `header/importer-tax-id`, `importer-name` | Name is evidence; ID and account registration need broker. |
| Ultimate consignee | `header/ultimate-consignee/tax-id`, `consignee-name` | Warehouse delivery is not an automatic customs-party determination. |
| Bond | `header/bond-type`, `surety-code` | XSD uses 00/08/09; account-specific details. Waiver not supported. |
| Charges | `header/charges` | International freight plus insurance, rounded to integer for xsd:long. |
| Gross kg | `header/gross-weight`, `line-item/gross-weight` | Rounded to schema's integer constraints; original decimals preserved in report. |
| Vessel/voyage | `header/vessel-name`, `voyage-no` | Document evidence. ETA is not actual arrival. |
| Bills | `manifest/bill-of-lading/{master,house}-scac`, `{master,house}-bill` | Separately report SCAC. Remove matching SCAC prefix once from full document number; carrier verification required. |
| Packages | `manifest/bill-of-lading/quantity`, `unit` | Cartons reported as CTNS; bill quantity/unit required by XSD. |
| Container | `containers/container/container-number`, `seal-numbers` | Optional; handwritten replacement needs carrier confirmation. |
| Invoice | `invoices/invoice/invoice-no` | Invalid characters map to hyphens with a review issue; no truncation; collisions block readiness. |
| Origin/export | `line-item/country-origin`, `country-export` | Item origin takes precedence over blanket origin. Bangladesh samples exported through Vietnam retain BD origin. |
| Manufacturer | `line-item/manufacturer-id` | Actual factory, not seller. Never invent an MID from incomplete/unconfirmed address. |
| Description | `line-item/commercial-description` | Includes style and composition. No response-only `tariff-description`. |
| Invoice quantity | `line-item/invoice-quantity` | Printed invoice value selected, disputes remain visible. |
| Tariff | `line-item/tariffs/tariff/tariff-no` | Six-digit HS retained in draft; ten-digit HTS required for readiness. |
| Value | `tariff/value` | Printed commercial amount + style-specific assist; declared sample value included separately. USD conversion explicit. No double-counted freight. |
| Statistical units | `tariff/quantity1`, `unit-of-measure1`, optional second pair | Broker enters HTS-required units; pieces are not automatically converted to dozens or kg. |

Root child order is respected. Within `xsd:all` blocks child order is flexible. No tax/duty rates are guessed, and `precalculated` is omitted so NetCHB's account calculation can apply; that does not establish correct classification, remedies or fees.

The WSDL defines `uploadEntry` with string parameters `username`, `password`, `entryXml`, SOAP 1.1 RPC/literal and an empty SOAPAction. The endpoint is `https://www.netchb.com:443/main/services/entry/EntryUploadService`. There is no application code that sends this operation. Any future adapter must require an authorized broker account, validate the export, avoid `transmit` until deliberate filing authorization, protect credentials, handle warnings/rejections and distinguish upload from customs acceptance.

## Sample valuation reasoning

Invoice amount column: 6,480 + 8,880 + 6,255 + 1,260 = **22,875**. Invoice stated FOB: **23,235**. Adding the specific **4,180** fabric assist and **24** declared sample value gives **27,079** provisionally. The **360** discrepancy matches the T-shirt amount difference (2,400 × 2.85 = 6,840). A corrected 6,840 line would instead give **27,439**, before any other corrections such as hoodie shortages or assist costs.

Commercial invoice is not complete customs valuation evidence. The seller should correct pricing/totals, reconcile quantities and composition, substantiate actual freight/insurance, and establish all assist costs/apportionment. Sample valuation is not necessarily transaction value because the goods are free; a broker must confirm the appropriate valuation method. Free samples are not automatically duty exempt.

Sources:

- https://www.netchb.com/main/services/entry/EntryUploadService?wsdl
- https://www.netchb.com/xml/entry/entry.xsd
- https://www.netchb.com/xml/data/data_type.xsd
- https://www.netchb.com/xml/entry/entryUploadResponse.html
- https://rulings.cbp.gov/ruling/H354576 (buyer materials and assists)
- https://rulings.cbp.gov/ruling/546363 (actual freight/insurance exclusions)

Snapshots in `schema/` are for reproducibility. The datatype import was localized for offline validation. Always verify current NetCHB/account requirements and current tariff/remedy rules before real filing.
