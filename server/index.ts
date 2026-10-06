import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { brokerSchema, emptyBroker, shipmentSchema, type SourceDocument, type Review, type Shipment, type Broker } from '../shared/model.js';
import { readPdf } from './pdf.js';
import { extractDocument } from './extract.js';
import { mergeDocuments, reviewIssues, totals } from './reconcile.js';
import { generateXml, validateXml } from './xml.js';
const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');next();});
app.use(express.json({limit:'2mb'}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:6,fields:0},fileFilter:(_req,file,cb)=>{if(!/\.pdf$/i.test(file.originalname))cb(new Error('Only PDF files are supported.'));else cb(null,true);}});
const sessions=new Map<string,{documents:SourceDocument[]; evidence:Shipment['evidence'];expires:number}>();
let busy=false;
function sweep(){for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);}
export async function buildReview(shipment:Shipment,broker:Broker,documents:SourceDocument[]):Promise<Review> {
 const issues=reviewIssues(shipment,broker,documents);const xml=generateXml(shipment,broker);const schema=await validateXml(xml);
 return {shipment,broker,documents,issues,xml,schema,ready:schema.valid===true&&!issues.some(i=>i.severity==='blocker'||!i.resolved),totals:totals(shipment,broker)};
}
app.get('/api/config',(_req,res)=>res.json({engine:process.env.OPENAI_API_KEY?'ai':'rules',model:process.env.OPENAI_API_KEY?process.env.EXTRACTION_MODEL??'gpt-4.1-mini':null,retention:'In memory for 1 hour. Files are not stored. Temporary OCR files are deleted after extraction.'}));
app.post('/api/example',async(_req,res,next)=>{try {
 const report=JSON.parse(await readFile(new URL('../examples/review-report.json',import.meta.url),'utf8')) as Review;
 const shipment=shipmentSchema.parse(report.shipment);const sessionId=randomUUID();sweep();
 if(sessions.size>=16)sessions.delete(sessions.keys().next().value!);
 sessions.set(sessionId,{documents:report.documents,evidence:shipment.evidence,expires:Date.now()+3600_000});
 res.json({sessionId,...await buildReview(shipment,emptyBroker(),report.documents)});
}catch(e){next(e);}});
app.post('/api/shipments',(req,res,next)=>{
 if(busy){res.status(429).json({error:'Another shipment is processing. Try again shortly.'});return;}
 busy=true;
 upload.array('documents',6)(req,res,async error=>{
  try {
   if(error)throw error;
   const files=req.files as Express.Multer.File[];
   if(!files?.length) {res.status(400).json({error:'Upload at least one PDF.'});return;}
   if(files.reduce((sum,f)=>sum+f.size,0)>60*1024*1024)throw new Error('Combined upload limit is 60 MB.');
   const documents:SourceDocument[]=[];let pageCount=0;
   for(const file of files) {
    const pages=await readPdf(file.buffer);pageCount+=pages.length;if(pageCount>40)throw new Error('Shipment limit is 40 pages.');
    const doc=await extractDocument(path.basename(file.originalname).slice(0,200),file.buffer,pages);
    if(!documents.some(d=>d.id===doc.id))documents.push(doc);
   }
   const shipment=mergeDocuments(documents);const sessionId=randomUUID();sweep();
   if(sessions.size>=16)sessions.delete(sessions.keys().next().value!);
   sessions.set(sessionId,{documents,evidence:shipment.evidence,expires:Date.now()+3600_000});
   res.json({sessionId,...await buildReview(shipment,emptyBroker(),documents)});
  }catch(e){next(e);}finally {busy=false;}
 });
});
const reviewRequest=z.object({sessionId:z.string().uuid(),shipment:shipmentSchema,broker:brokerSchema}).strict();
app.post('/api/review',async(req,res,next)=>{try {
 const input=reviewRequest.parse(req.body);sweep();const session=sessions.get(input.sessionId);
 if(!session){res.status(410).json({error:'Review session expired. Re-upload your documents.'});return;}
 // Original evidence is immutable, even when the user edits selected values.
 input.shipment.evidence=session.evidence;
 res.json({sessionId:input.sessionId,...await buildReview(input.shipment,input.broker,session.documents)});
}catch(e){next(e);}});
const root=fileURLToPath(new URL('../',import.meta.url));app.use(express.static(path.join(root,'dist')));
app.get('/{*path}',(req,res)=>{if(req.path.startsWith('/api/'))res.status(404).json({error:'Unknown API route.'});else res.sendFile(path.join(root,'dist','index.html'));});
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
 if(error instanceof z.ZodError){res.status(422).json({error:'Invalid structured data.',details:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`)});return;}
 console.error(error instanceof Error?error.message:'Request failed');
 res.status(400).json({error:error instanceof Error?error.message:'Could not process the shipment.'});
});
const port=Number(process.env.PORT??3001);app.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`Entry Desk: http://${process.env.HOST??'127.0.0.1'}:${port}`));
