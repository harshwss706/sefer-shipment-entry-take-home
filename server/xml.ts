import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Broker, Shipment } from '../shared/model.js';
import { lineValue,totals } from './reconcile.js';
const exec=promisify(execFile);
const schemaPath=fileURLToPath(new URL('../schema/entry.xsd',import.meta.url));
export function escapeXml(value:unknown):string {return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
export const invoiceIdentifier=(value:string)=>value.replace(/[^A-Za-z0-9-]/g,'-');
function tag(name:string,value:unknown) {return value===null||value===undefined||value===''?'':`<${name}>${escapeXml(value)}</${name}>`;}
export function isoDate(s:unknown):string {
 const v=String(s??'');if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
 const m=v.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 return m&&months.includes(m[2].toUpperCase())?`${m[3]}-${String(months.indexOf(m[2].toUpperCase())+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';
}
export function generateXml(s:Shipment,b:Broker):string {
 const f=s.fields;const t=totals(s,b);const rate=f.currency==='USD'?1:b.exchangeRate??1;
 const header=[tag('importer-tax-id',b.importerTaxId),tag('importer-name',f.buyer),b.consigneeTaxId?`<ultimate-consignee>${tag('tax-id',b.consigneeTaxId)}${tag('consignee-name',b.consigneeName)}</ultimate-consignee>`:'',tag('processing-port',b.processingPort),tag('entry-port',b.entryPort),tag('entry-date',b.entryDate),tag('entry-type',b.entryType),tag('bond-type',b.bondType),tag('payment-type',b.paymentType),tag('charges',Math.round(t.freight+t.insurance)),tag('gross-weight',f.grossWeight!==undefined?Math.round(Number(f.grossWeight)):null),tag('description','Imported merchandise'),tag('surety-code',b.suretyCode),tag('vessel-name',f.vessel),tag('mode-transportation',b.mode),tag('unlading-port',b.entryPort),tag('arrival-date',b.arrivalDate),tag('carrier-code',f.masterScac),tag('customer-reference-no',f.purchaseOrder),tag('voyage-no',f.voyage),tag('location-of-goods',b.firmsCode)].filter(Boolean).join('\n    ');
 // The document includes SCAC prefixes in full bills. NetCHB fields separate them.
 const strip=(bill:unknown,scac:unknown)=>{const v=String(bill??'');const prefix=String(scac??'');return prefix&&v.startsWith(prefix)?v.slice(prefix.length):v;};
 const manifest=[tag('master-scac',f.masterScac),tag('master-bill',strip(f.masterBill,f.masterScac)),tag('house-scac',f.houseScac),tag('house-bill',strip(f.houseBill,f.houseScac)),tag('quantity',f.packages),tag('unit',f.packageUnit)].filter(Boolean).join('\n      ');
 const groups=new Map<string,Shipment['lines']>();for(const l of s.lines){if(!groups.has(l.invoiceNo))groups.set(l.invoiceNo,[]);groups.get(l.invoiceNo)!.push(l);}
 const invoices=[...groups].map(([invoiceNo,lines])=>`<invoice>\n      ${tag('invoice-no',invoiceIdentifier(invoiceNo))}\n      <line-items>\n${lines.map(l=>{
 const tariff=tag('tariff-no',(l.hts||l.hsCode).replace(/\./g,''))+tag('value',(lineValue(l)*rate).toFixed(2))+tag('quantity1',l.quantity1)+tag('unit-of-measure1',l.uom1)+tag('quantity2',l.quantity2)+tag('unit-of-measure2',l.uom2);
 return `        <line-item>\n          ${[tag('export-date',isoDate(f.exportDate)),tag('country-origin',l.origin),tag('manufacturer-id',l.manufacturerId),tag('related-party',b.relatedParty),tag('country-export',f.exportCountry),tag('gross-weight',l.grossWeight===null?null:Math.round(l.grossWeight)),tag('commercial-description',[l.style,l.description,l.composition].filter(Boolean).join(' / ')),tag('invoice-quantity',l.quantity),tag('po-number',f.purchaseOrder),`<tariffs><tariff>${tariff}</tariff></tariffs>`].filter(Boolean).join('\n          ')}\n        </line-item>`;
 }).join('\n')}\n      </line-items>\n    </invoice>`).join('\n    ');
 const containers=f.container?`\n  <containers><container>${tag('container-number',f.container)}${tag('seal-numbers',f.seal)}</container></containers>`:'';
 return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- PREPARATION EXPORT: consult the accompanying review report for missing facts and filing readiness. -->\n<entry xmlns="http://www.netchb.com/xml/entry">\n  <entry-no><system-generated/></entry-no>\n  <header>\n    ${header}\n  </header>\n  <manifest>\n    <bill-of-lading>\n      ${manifest}\n    </bill-of-lading>\n  </manifest>${containers}\n  <invoices>\n    ${invoices}\n  </invoices>\n</entry>\n`;
}
export async function validateXml(xml:string):Promise<{valid:boolean|null;errors:string[]}> {
 const dir=await mkdtemp(path.join(tmpdir(),'entry-'));const target=path.join(dir,'entry.xml');
 try {await writeFile(target,xml);await exec(process.env.XMLLINT_PATH??'xmllint',['--nonet','--noout','--schema',schemaPath,target],{timeout:15_000,maxBuffer:100_000});return {valid:true,errors:[]};}
 catch(e) {const err=e as NodeJS.ErrnoException&{stderr?:string};if(err.code==='ENOENT')return {valid:null,errors:['xmllint is not installed. Install libxml2; schema validation has not run.']};return {valid:false,errors:[(err.stderr??err.message).replaceAll(target,'entry.xml').replaceAll(schemaPath,'schema/entry.xsd')]};}
 finally {await rm(dir,{recursive:true,force:true});}
}
