import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { createWorker, PSM } from 'tesseract.js';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Page } from '../shared/model.js';
import { prepareScan } from './raster.js';

Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const require = createRequire(import.meta.url);
// OCR data ships as an npm dependency: no document-time CDN downloads.
const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0');
const exec = promisify(execFile);

function layout(items:{str:string; x:number; y:number; width:number}[]) {
  const rows:{y:number; items:typeof items}[]=[];
  for(const item of items.sort((a,b)=>b.y-a.y||a.x-b.x)) {
    let row=rows.find(r=>Math.abs(r.y-item.y)<3);
    if(!row) {row={y:item.y,items:[]};rows.push(row);} row.items.push(item);
  }
  return rows.map(row=>{
    let end=0;
    return row.items.sort((a,b)=>a.x-b.x).map(item=>{
      const gap=item.x-end;end=item.x+item.width;
      return (gap>12?'    ':' ')+item.str;
    }).join('').trim();
  }).join('\n');
}

export async function readPdf(buffer:Buffer):Promise<Page[]> {
  if(buffer.subarray(0,5).toString()!=='%PDF-') throw new Error('Upload must be a valid PDF.');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({ data:new Uint8Array(buffer),useSystemFonts:true });
  const pdf=await task.promise;
  let worker:Awaited<ReturnType<typeof createWorker>>|undefined;
  let scratch:string|undefined;
  try {
    if(pdf.numPages>30) throw new Error('Each PDF must have 30 pages or fewer. Split large documents.');
    const pages:Page[]=[];
    for(let n=1;n<=pdf.numPages;n++) {
      const p=await pdf.getPage(n);const content=await p.getTextContent();
      let text=layout(content.items.filter((x):x is import('pdfjs-dist/types/src/display/api.js').TextItem=>'str' in x).map(x=>({str:x.str,x:x.transform[4],y:x.transform[5],width:x.width})));
      let method:Page['method']='text';
      if(text.replace(/\s/g,'').length<80) {
        worker??=await createWorker('eng',1,{langPath,gzip:true,cacheMethod:'none'});
        await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK});
        if(!scratch) {scratch=await mkdtemp(path.join(tmpdir(),'shipment-ocr-'));await writeFile(path.join(scratch,'input.pdf'),buffer);}
        // Poppler is stable for scanned/rotated PDFs and bounds raster dimensions.
        // Filenames and arguments never pass through a shell.
        await exec(process.env.PDFTOPPM_PATH??'pdftoppm',['-f',String(n),'-l',String(n),'-scale-to','2500','-png','-singlefile',path.join(scratch,'input.pdf'),path.join(scratch,'page')],{timeout:30_000,maxBuffer:100_000});
        const result=await worker.recognize(await prepareScan(await readFile(path.join(scratch,'page.png'))));
        text=result.data.text;
        method='ocr';
      }
      if(text.length>100_000) throw new Error('Page text exceeds processing limit.');
      pages.push({page:n,text,method});p.cleanup();
    }
    return pages;
  } finally { await worker?.terminate();await task.destroy();if(scratch)await rm(scratch,{recursive:true,force:true}); }
}
