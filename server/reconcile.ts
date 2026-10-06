import { createHash } from 'node:crypto';
import { emptyBroker, lineSchema, type Broker, type Evidence, type Issue, type Shipment, type SourceDocument } from '../shared/model.js';
import { country } from './extract.js';
export const amount=(v:unknown)=> typeof v==='number'&&Number.isFinite(v)?v:0;
const str=(v:unknown)=>v===null||v===undefined?'':String(v);
const num=(v:unknown)=> typeof v==='number'?v:null;

export function mergeDocuments(documents:SourceDocument[]):Shipment {
 const shipment:Shipment={fields:{},lines:[],evidence:{}};
 const push=(key:string,doc:SourceDocument,f:SourceDocument['fields'][string])=>{if(f)(shipment.evidence[key]??=[]).push({...f,document:doc.name,documentId:doc.id});};
 const order=[...documents].sort((a,b)=>['invoice','packing','bill','other'].indexOf(a.kind)-['invoice','packing','bill','other'].indexOf(b.kind));
 for(const doc of order)for(const [key,f]of Object.entries(doc.fields))if(f){push(key,doc,f);if(shipment.fields[key]===undefined)shipment.fields[key]=f.value;}
 for(const doc of documents.filter(d=>d.kind==='invoice')) {
   const invoiceNo=str(doc.fields.invoiceNo?.value);
   doc.items.forEach((i,n)=>{
     const line=lineSchema.parse({id:`${doc.id.slice(0,12)}-${n+1}`,invoiceNo,style:str(i.style?.value),description:str(i.description?.value),composition:str(i.composition?.value),hsCode:str(i.hsCode?.value),origin:country(str(i.origin?.value??doc.fields.origin?.value)),quantity:num(i.quantity?.value),unit:str(i.unit?.value),unitPrice:num(i.unitPrice?.value),amount:num(i.amount?.value),assist:amount(i.assist?.value),customsValue:num(i.customsValue?.value),cartons:null,netWeight:null,grossWeight:null,manufacturer:str(i.manufacturer?.value),manufacturerAddress:str(i.manufacturerAddress?.value)});
     shipment.lines.push(line);
     for(const [key,f]of Object.entries(i))push(`${line.id}.${key}`,doc,f);
     if(!i.origin)push(`${line.id}.origin`,doc,doc.fields.origin);
   });
 }
 for(const doc of documents.filter(d=>d.kind==='packing'))for(const i of doc.items) {
   const matches=shipment.lines.filter(l=>l.style===str(i.style?.value)&&(!doc.fields.invoiceNo||l.invoiceNo===doc.fields.invoiceNo.value));
   if(matches.length!==1)continue;
   const line=matches[0];
   for(const [key,f]of Object.entries(i)) {
     push(`${line.id}.${key}`,doc,f);
     if(f&&['cartons','netWeight','grossWeight'].includes(key))Object.assign(line,{[key]:num(f.value)});
     if(f&&['manufacturer','manufacturerAddress'].includes(key))Object.assign(line,{[key]:str(f.value)});
     if(key==='origin'&&f&&!line.origin)line.origin=country(str(f.value));
   }
   if(!line.manufacturer)line.manufacturer=str(doc.fields.manufacturer?.value);
   if(!line.manufacturerAddress)line.manufacturerAddress=str(doc.fields.manufacturerAddress?.value);
 }
 return shipment;
}

export function lineValue(line:Shipment['lines'][number]) {return (line.customsValue??line.amount??0)+line.assist;}
export function totals(s:Shipment,b:Broker=emptyBroker()) {
 const rate=s.fields.currency==='USD'?1:b.exchangeRate??1;
 const merchandise=s.lines.filter(l=>l.customsValue===null).reduce((n,l)=>n+amount(l.amount),0)*rate;
 const samples=s.lines.filter(l=>l.customsValue!==null).reduce((n,l)=>n+amount(l.customsValue),0)*rate;
 const assists=s.lines.reduce((n,l)=>n+l.assist,0)*rate;
 return {merchandise,assists,samples,proposedValue:Math.round((merchandise+assists+samples)*100)/100,freight:amount(s.fields.freight)*rate,insurance:amount(s.fields.insurance)*rate};
}

export function reviewIssues(s:Shipment,b:Broker,docs:SourceDocument[]):Issue[] {
 const issues:Issue[]=[];
 const {confirmations:_notes,...brokerValues}=b;
 const revision=JSON.stringify({fields:s.fields,lines:s.lines,broker:brokerValues});
 const add=(key:string,severity:Issue['severity'],title:string,detail:string,evidence:Evidence[]=[])=>{
   const id=key+'-'+createHash('sha256').update(detail+revision).digest('hex').slice(0,10);
   const note=b.confirmations[id];issues.push({id,severity,title,detail,evidence,resolved:severity==='info'||(severity==='review'&&(note?.trim().length??0)>=10),note});
 };
 const ev=(key:string)=>s.evidence[key]??[];
 if(b.entryType&&b.entryType!=='01')add('unsupported-entry','blocker','Entry type needs additional implementation','This prototype prepares ordinary consumption entries (01). Other types need additional type-specific rules before a reviewed export.');
 if(b.mode&&!['10','11'].includes(b.mode))add('unsupported-mode','blocker','Transport mode needs additional implementation','The current XML mapping supports ocean shipments. Air and land transport need their own manifest rules.');
 const required:{key:keyof Broker;label:string;pattern:RegExp}[]=[
  {key:'processingPort',label:'Processing port',pattern:/^\d{4}$/},{key:'entryPort',label:'Entry port',pattern:/^\d{4}$/},
  {key:'entryType',label:'Entry type',pattern:/^\d{2}$/},{key:'entryDate',label:'Entry date',pattern:/^\d{4}-\d{2}-\d{2}$/},
  {key:'importerTaxId',label:'Importer tax ID',pattern:/^(\d{2}-\d{7}[\dA-Za-z]{0,2}|\d{6}-\d{5}|\d{3}-\d{2}-\d{4})$/},
  {key:'consigneeTaxId',label:'Ultimate consignee tax ID',pattern:/^(\d{2}-\d{7}[\dA-Za-z]{0,2}|\d{6}-\d{5}|\d{3}-\d{2}-\d{4})$/},
  {key:'bondType',label:'Bond type',pattern:/^(00|08|09)$/},{key:'paymentType',label:'Payment type',pattern:/^[1-8]$/},
  {key:'firmsCode',label:'FIRMS location',pattern:/^[A-Z0-9]{4}$/},{key:'arrivalDate',label:'Actual arrival date',pattern:/^\d{4}-\d{2}-\d{2}$/},
  {key:'mode',label:'Mode of transportation',pattern:/^\d{2}$/},{key:'relatedParty',label:'Related-party status',pattern:/^[YN]$/},
 ];
 for(const r of required)if(!r.pattern.test(str(b[r.key])))add(`missing-${r.key}`,'blocker',r.label+' required',`Enter a broker-confirmed ${r.label.toLowerCase()}. It cannot be established from the uploaded documents.`);
 for(const key of ['entryDate','arrivalDate'] as const)if(b[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(b[key])||Number.isNaN(Date.parse(b[key]))||new Date(b[key]).toISOString().slice(0,10)!==b[key]))add('invalid-'+key,'blocker','Invalid date',`${key} must be a real ISO calendar date.`);
 if(b.bondType&&b.bondType!=='00'&&!/^\d{3}$/.test(b.suretyCode))add('surety','blocker','Surety code required','Enter the surety for the confirmed bond.');
 if(b.bondType==='00')add('bond-waiver','blocker','Bond waiver needs additional implementation','Confirm the applicable waiver reason and implement its ACE mapping before filing.');
 if(!b.consigneeName)add('consignee','blocker','Confirm the ultimate consignee','A warehouse delivery address does not prove the customs ultimate consignee. Select the appropriate party and confirm its identifier.',ev('shipTo'));
 if(!s.fields.currency)add('currency','blocker','Invoice currency missing','Confirm the currency before computing customs value.');
 if(s.fields.currency&&s.fields.currency!=='USD'&&!b.exchangeRate)add('exchange','blocker','Currency conversion needed',`Provide a broker-confirmed USD per ${s.fields.currency} exchange rate for the relevant date.`);
 if(!s.lines.length)add('no-lines','blocker','No invoice lines extracted','Use an extraction provider or enter lines in the shipment editor. An empty entry is not complete.');
 const invoiceNumbers=[...new Set(s.lines.map(l=>l.invoiceNo))];const normalized=invoiceNumbers.map(v=>v.replace(/[^A-Za-z0-9-]/g,'-'));
 if(new Set(normalized).size!==normalized.length)add('invoice-collision','blocker','Invoice identifier collision','Different document invoice numbers normalize to the same NetCHB identifier. Choose distinct broker-approved identifiers.');
 invoiceNumbers.forEach((value,n)=>{if(!/^[A-Za-z0-9-]{1,17}$/.test(normalized[n]))add('invoice-format-'+n,'blocker','Invoice identifier exceeds NetCHB limits',`${value}: provide an invoice reference that maps to 1–17 alphanumeric/hyphen characters. No truncation is performed.`);else if(value!==normalized[n])add('invoice-normalize-'+n,'review','Invoice number normalized for NetCHB',`Original ${value} becomes ${normalized[n]}. NetCHB invoice-no allows only 1–17 letters, digits and hyphens. Confirm this identifier mapping.`,ev('invoiceNo'));});
 if(!docs.some(d=>d.kind==='invoice'))add('no-invoice','blocker','Commercial invoice missing','Upload the invoice.');
 if(docs.filter(d=>d.kind==='invoice').length>1)add('multiple-invoices','blocker','Multiple-invoice accounting needs review','The prototype extracts multiple invoices but requires additional invoice-level currency, charge and total reconciliation before a reviewed export.');
 if(!docs.some(d=>d.kind==='bill'))add('no-bill','blocker','Transport document missing','Upload the bill of lading or appropriate air/land transport document.');
 for(const d of docs.filter(d=>d.kind==='packing'))for(const i of d.items){const matches=s.lines.filter(l=>l.style===i.style?.value&&(!d.fields.invoiceNo||l.invoiceNo===d.fields.invoiceNo.value));if(matches.length!==1)add('packing-join-'+d.id+'-'+str(i.style?.value),'review','Packing row cannot be matched uniquely',`${d.name}: ${i.style?.value??'unknown style'} matches ${matches.length} invoice lines. Reconcile omitted goods or ambiguous references.`,i.style?[{...i.style,document:d.name,documentId:d.id}]:[]);}
 const currencySet=new Set(docs.filter(d=>d.kind==='invoice').map(d=>d.fields.currency?.value).filter(Boolean));
 if(currencySet.size>1)add('mixed-currencies','blocker','Mixed invoice currencies','Separate invoices by currency; this prototype has one shipment-level conversion rate.');
 if(!s.fields.packages||!Number.isInteger(s.fields.packages)||Number(s.fields.packages)<1)add('packages','blocker','Package count required','Confirm the manifest package count.',ev('packages'));
 if(!/^[A-Z]{1,5}$/.test(str(s.fields.packageUnit)))add('package-unit','blocker','Package unit required','Confirm the manifest unit (for example CTNS, BOXES or PLTS). Invoice pieces are not a package unit.');
 for(const key of ['masterScac','masterBill','houseScac','houseBill'])if(!s.fields[key])add('manifest-'+key,'blocker',`${key} missing`,'Confirm the manifest identifiers with the carrier. This prototype expects master and house bills.');
 const composition=(value:unknown)=>{const v=str(value).toUpperCase();const ratio=v.match(/\b(\d{1,3})\/(\d{1,3})\b/);if(ratio)return ratio[1]+'/'+ratio[2];const percentages=[...v.matchAll(/(\d{1,3})\s*%/g)].map(m=>m[1]);return percentages.length?percentages.join('/'):v;};
 const conflicts=(key:string,title:string)=>{const evidence=ev(key);const values=[...new Set(evidence.map(e=>key.endsWith('.composition')?composition(e.value):str(e.value).trim().toLowerCase()))];if(values.length>1)add('conflict-'+key,'review',title,`Sources disagree: ${evidence.map(e=>`${e.document}: ${e.value}`).join('; ')}. Obtain corrected evidence, edit the selected value if needed, then record the decision.`,evidence);};
 conflicts('grossWeight','Gross weight mismatch');conflicts('packages','Package count mismatch');
 for(const l of s.lines) {
  if(!l.invoiceNo)add('invoice-'+l.id,'blocker','Invoice number missing',`Provide the invoice reference for ${l.style||l.id}.`);
  if(!l.description)add('description-'+l.id,'blocker','Description missing',`Provide a specific commercial description for ${l.style||l.id}.`);
  if(!/^[A-Z]{2}$/.test(l.origin))add('origin-'+l.id,'blocker','Country of origin missing',`Confirm origin for ${l.style||l.id}.`,ev(l.id+'.origin'));
  if(l.quantity===null||l.quantity<=0)add('quantity-'+l.id,'blocker','Quantity missing',`Confirm shipped quantity for ${l.style||l.id}.`);
  if(l.amount===null&&l.customsValue===null)add('value-'+l.id,'blocker','Customs value missing',`Confirm the valuation of ${l.style||l.id}.`);
  if((l.customsValue??l.amount??0)+l.assist<=0)add('positive-value-'+l.id,'blocker','Positive customs value required',`${l.style}: free-of-charge goods still require a customs valuation.`);
  if(!/^\d{10}$/.test(l.hts.replace(/\./g,'')))add('hts-'+l.id,'blocker','10-digit HTS needed',`${l.style}: document HS ${l.hsCode||'unknown'} is a classification clue. Confirm current US statistical HTS, units, Chapter 99 remedies and applicable agency requirements.`,ev(l.id+'.hsCode'));
  if(!l.manufacturerId)add('mid-'+l.id,'blocker','Manufacturer ID needed',`${l.style}: establish the actual manufacturer and MID. Seller and manufacturer may be different. ${l.manufacturer} ${l.manufacturerAddress}`.trim(),ev(l.id+'.manufacturer'));
  if(!s.fields.exportCountry)add('export-country-'+l.id,'blocker','Country of export needed','Confirm the country of export independently of origin. Transshipped samples can have different origin and export country.');
  if(l.quantity1===null||!l.uom1)add('uom-'+l.id,'blocker','Tariff quantity and unit needed',`${l.style}: enter the HTS-required quantity/unit(s). Invoice pieces are not automatically a statistical unit.`);
  if(l.unitPrice!==null&&l.quantity!==null&&l.amount!==null&&l.customsValue===null&&Math.abs(l.unitPrice*l.quantity-l.amount)>0.02)add('arithmetic-'+l.id,'review','Price × quantity mismatch',`${l.style}: ${l.quantity} × ${l.unitPrice} = ${(l.quantity*l.unitPrice).toFixed(2)}, but the printed amount is ${l.amount.toFixed(2)}. Draft uses the printed amount. Request a corrected invoice.`,ev(l.id+'.amount'));
  conflicts(l.id+'.quantity',`${l.style}: quantity mismatch`);conflicts(l.id+'.composition',`${l.style}: composition mismatch`);
  conflicts(l.id+'.origin',`${l.style}: origin mismatch`);
  if(l.assist>0)add('assist-'+l.id,'review','Buyer-supplied assist',`${l.style}: proposed value includes ${l.assist.toFixed(2)} in buyer-supplied material. Confirm the cost, transport to production and apportionment; CMT alone is incomplete.`,ev(l.id+'.assist'));
  if(l.customsValue!==null)add('samples-'+l.id,'review','Free samples still need valuation',`${l.style}: retain declared customs value ${l.customsValue.toFixed(2)} and origin ${l.origin}. Confirm valuation and eligibility before claiming any sample exemption.`,ev(l.id+'.customsValue'));
 }
 const total=totals(s,b);
 if(s.fields.fobTotal!==undefined&&Math.abs(total.merchandise/(s.fields.currency==='USD'?1:b.exchangeRate??1)-amount(s.fields.fobTotal))>0.02)add('fob-sum','review','Invoice subtotal mismatch','Sum of commercial line amounts differs from the stated FOB subtotal.',ev('fobTotal'));
 if(s.fields.invoiceTotal!==undefined&&s.fields.fobTotal!==undefined&&Math.abs(amount(s.fields.invoiceTotal)-amount(s.fields.fobTotal)-amount(s.fields.freight)-amount(s.fields.insurance))>0.02)add('cif-sum','review','Invoice total does not reconcile','FOB + freight + insurance differs from invoice total.',ev('invoiceTotal'));
 if(total.freight||total.insurance)add('freight','review','Freight and insurance excluded from proposed value',`Proposed value uses merchandise + assists + sample customs value; international freight ${total.freight.toFixed(2)} and insurance ${total.insurance.toFixed(2)} are separately reported as charges. Confirm actual costs and eligibility for exclusion.`,[...ev('freight'),...ev('insurance')]);
 if(s.fields.exportDate)add('export-date','review','Confirm actual export date',`Selected export date ${s.fields.exportDate} may be an estimated departure date. Confirm the actual date against the on-board stamp and manifest.`,ev('exportDate'));
 if(docs.some(d=>d.kind==='bill'&&d.pages.some(p=>p.method==='ocr')))add('manifest-ocr','review','Verify bill and container identifiers','Confirm the master and house bill numbers character by character against the carrier/AMS record. Inspect handwritten container corrections; OCR may read crossed-out numbers or transpose digits.',[...ev('masterBill'),...ev('houseBill')]);
 if(s.lines.some(l=>l.origin!==s.fields.origin))add('origin-exception','review','Item origin overrides shipment declaration','At least one line has an origin different from the blanket declaration. Confirm the item-specific origin and actual manufacturer; do not use shipment origin for every line.',ev('origin'));
 const selectedPieces=s.lines.reduce((n,l)=>n+(l.quantity??0),0);
 const packingPieces=docs.filter(d=>d.kind==='packing').flatMap(d=>d.items).reduce((n,i)=>n+amount(i.quantity?.value),0);
 if(packingPieces&&packingPieces!==selectedPieces)add('piece-total','review','Shipment piece counts differ',`Selected invoice quantities total ${selectedPieces}; recognized packing rows total ${packingPieces}. Reconcile shortages and sample quantities before filing.`);
 for(const d of docs) {
  if(d.pages.some(p=>p.method==='ocr'))add('ocr-'+d.id,'review','Verify scanned document',`${d.name}: check OCR against every original page, especially overwritten container numbers.`,[]);
  if(d.warnings.some(w=>w.startsWith('Discarded')))add('unsupported-'+d.id,'review','Extraction evidence rejected',d.warnings.filter(w=>w.startsWith('Discarded')).join(' '));
  if((d.kind==='invoice'||d.kind==='packing')&&!d.items.length)add('empty-'+d.id,'review','Document table not extracted',`${d.name}: no items recognized. Review original and enter missing data or configure structured extraction.`);
 }
 add('filing-review','review','Broker filing review','Confirm importer/consignee profiles exist in NetCHB, POA and bond are in place, actual manifest data, valuation, origin, HTS/remedies, duties/fees, PGA requirements and any ISF status. No duty rates or exemptions are inferred.');
 return issues;
}
