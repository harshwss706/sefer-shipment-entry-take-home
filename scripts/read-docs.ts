import { readPdf } from '../server/pdf.js';
import { readFile, writeFile } from 'node:fs/promises';
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2) {
 const pages=await readPdf(await readFile(args[i+1]));
 await writeFile(args[i],JSON.stringify(pages,null,2));
 console.log(args[i],pages.map(p=>({page:p.page,method:p.method,length:p.text.length})));
}
