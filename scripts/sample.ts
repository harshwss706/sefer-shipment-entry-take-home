import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readPdf} from '../server/pdf.js';
import {extractDocument,extractRules,validateEvidence} from '../server/extract.js';
import {mergeDocuments,reviewIssues,totals} from '../server/reconcile.js';
import {generateXml,validateXml} from '../server/xml.js';
import {emptyBroker,type SourceDocument,type Page} from '../shared/model.js';
let documents:SourceDocument[];
const args=process.argv.slice(2);
if(args[0]==='--from-pages'){
 documents=[];
 for(const name of ['invoice','packing','bill']){
  const pages=JSON.parse(await readFile(path.join(args[1],name+'-pages.json'),'utf8')) as Page[];
  const extracted=validateEvidence(extractRules(pages),pages);
  documents.push({...extracted.extraction,id:createHash('sha256').update(JSON.stringify(pages)).digest('hex'),name:{invoice:'KBAS-NB-26-0912_Commercial_Invoice.pdf',packing:'SPG-PL-2609-117_Packing_List.pdf',bill:'BMLVHCM26090418_House_BL.pdf'}[name]!,pages,engine:'rules',warnings:extracted.warnings});
 }
 await writeFile('examples/documents.json',JSON.stringify(documents,null,2));
}else if(args.length){documents=[];for(const arg of args){const bytes=await readFile(arg);documents.push(await extractDocument(path.basename(arg),bytes,await readPdf(bytes)));}await writeFile('examples/documents.json',JSON.stringify(documents,null,2));}
else documents=JSON.parse(await readFile('examples/documents.json','utf8')) as SourceDocument[];
const shipment=mergeDocuments(documents);const broker=emptyBroker();
await writeFile('examples/entry.unreviewed.draft.xml',generateXml(shipment,broker));
// Human/AI visual review corrections are explicit fixture data, not extractor logic.
const corrections=JSON.parse(await readFile('examples/visual-review.json','utf8')) as {fields:Record<string,string>;lines:Record<string,Record<string,string>>;notes:string[]};
Object.assign(shipment.fields,corrections.fields);
for(const l of shipment.lines)Object.assign(l,corrections.lines[l.style]??{});
const xml=generateXml(shipment,broker);const schema=await validateXml(xml);
await writeFile('examples/entry.draft.xml',xml);
await writeFile('examples/review-report.json',JSON.stringify({shipment,broker,documents,issues:reviewIssues(shipment,broker,documents),totals:totals(shipment,broker),schema,ready:false,visualReview:corrections},null,2));
console.log(JSON.stringify({totals:totals(shipment,broker),lines:shipment.lines.length,schema,ready:false},null,2));
