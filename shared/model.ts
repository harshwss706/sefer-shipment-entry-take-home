import { z } from 'zod';

export const fieldNames = ['invoiceNo','invoiceDate','currency','seller','buyer','shipTo','manufacturer','manufacturerAddress','origin','exportCountry','exportDate','eta','incoterm','purchaseOrder','portLoading','portDischarge','vessel','voyage','masterScac','masterBill','houseScac','houseBill','container','seal','packages','packageUnit','grossWeight','netWeight','freight','insurance','fobTotal','invoiceTotal','totalQuantity'] as const;
export const itemNames = ['style','description','composition','hsCode','quantity','unit','unitPrice','amount','origin','cartons','netWeight','grossWeight','assist','customsValue','manufacturer','manufacturerAddress'] as const;
export const factSchema = z.object({ value: z.union([z.string().max(2000),z.number().finite()]), page: z.number().int().min(1), quote: z.string().min(1).max(4000) }).strict();
export type Fact = z.infer<typeof factSchema>;
const facts = <T extends readonly string[]>(names:T) => z.object(Object.fromEntries(names.map(k=>[k,factSchema.nullable().optional()]))).strict();
export const extractionSchema = z.object({ kind: z.enum(['invoice','packing','bill','other']), fields: facts(fieldNames), items: z.array(facts(itemNames)).max(500), notes: z.array(z.string().max(2000)).max(50) }).strict();
export type Extraction = z.infer<typeof extractionSchema>;
export interface Page { page: number; text: string; method: 'text'|'ocr' }
export interface SourceDocument extends Extraction { id: string; name: string; pages: Page[]; engine: 'rules'|'ai'; warnings: string[] }
export interface Evidence extends Fact { document: string; documentId: string }
export const lineSchema = z.object({
  id:z.string().min(1).max(100), invoiceNo:z.string().max(50), style:z.string().max(100), description:z.string().max(2000), composition:z.string().max(1000),
  hsCode:z.string().max(20), hts:z.string().max(20).default(''), origin:z.string().max(2), quantity:z.number().finite().nonnegative().nullable(), unit:z.string().max(20),
  unitPrice:z.number().finite().nonnegative().nullable(), amount:z.number().finite().nonnegative().nullable(), assist:z.number().finite().nonnegative().default(0),
  customsValue:z.number().finite().nonnegative().nullable(), cartons:z.number().int().nonnegative().nullable(), netWeight:z.number().finite().nonnegative().nullable(), grossWeight:z.number().finite().nonnegative().nullable(),
  manufacturer:z.string().max(500), manufacturerAddress:z.string().max(1000), manufacturerId:z.string().max(15).default(''),
  quantity1:z.number().finite().nonnegative().nullable().default(null), uom1:z.string().max(10).default(''), quantity2:z.number().finite().nonnegative().nullable().default(null), uom2:z.string().max(10).default(''),
}).strict();
export const shipmentSchema = z.object({
  fields:z.record(z.string().max(100),z.union([z.string().max(2000),z.number().finite(),z.null()])),
  lines:z.array(lineSchema).max(500), evidence:z.record(z.string(),z.array(factSchema.extend({document:z.string(),documentId:z.string()}))).default({})
}).strict().superRefine((s,ctx)=>{if(new Set(s.lines.map(l=>l.id)).size!==s.lines.length)ctx.addIssue({code:'custom',path:['lines'],message:'Line IDs must be unique.'});});
export type Shipment = z.infer<typeof shipmentSchema>;
export type Line = z.infer<typeof lineSchema>;
export const brokerSchema = z.object({
  processingPort:z.string().max(4).default(''), entryPort:z.string().max(4).default(''), entryDate:z.string().max(10).default(''), entryType:z.string().max(2).default(''),
  importerTaxId:z.string().max(20).default(''), consigneeTaxId:z.string().max(20).default(''), consigneeName:z.string().max(100).default(''),
  bondType:z.string().max(2).default(''), suretyCode:z.string().max(3).default(''), paymentType:z.string().max(1).default(''), firmsCode:z.string().max(4).default(''),
  arrivalDate:z.string().max(10).default(''), mode:z.string().max(2).default(''), relatedParty:z.enum(['','Y','N']).default(''),
  exchangeRate:z.number().positive().finite().nullable().default(null), confirmations:z.record(z.string(),z.string().max(2000)).default({})
}).strict();
export type Broker = z.infer<typeof brokerSchema>;
export interface Issue { id:string; severity:'blocker'|'review'|'info'; title:string; detail:string; evidence:Evidence[]; resolved:boolean; note?:string }
export interface Review { shipment:Shipment; broker:Broker; issues:Issue[]; xml:string; schema:{valid:boolean|null; errors:string[]}; ready:boolean; totals:{ merchandise:number; assists:number; samples:number; proposedValue:number; freight:number; insurance:number }; documents:SourceDocument[] }
export const emptyBroker = ():Broker => brokerSchema.parse({});
