import { createCanvas, loadImage } from '@napi-rs/canvas';

// Estimate scan skew from long horizontal rules, then remove long dark grid
// strokes. This keeps table columns legible to OCR without altering source PDFs.
export async function prepareScan(buffer:Buffer):Promise<Buffer> {
 const source=await loadImage(buffer);const scale=Math.min(1,800/source.width);
 const w=Math.round(source.width*scale),h=Math.round(source.height*scale);
 const probe=createCanvas(w,h);const ctx=probe.getContext('2d');
 let angle=0,best=0;
 for(let deg=-4;deg<=4;deg+=0.25) {
  ctx.resetTransform();ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);ctx.rotate(deg*Math.PI/180);ctx.drawImage(source,-w/2,-h/2,w,h);
  const pixels=ctx.getImageData(0,0,w,h).data;let score=0;
  for(let y=0;y<h;y++) {let count=0;for(let x=0;x<w;x++){const i=(y*w+x)*4;if(pixels[i]+pixels[i+1]+pixels[i+2]<390)count++;}if(count>w*.4)score+=count*count;}
  if(score>best){best=score;angle=deg;}
 }
 const canvas=createCanvas(source.width,source.height);const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,source.width,source.height);
 c.translate(source.width/2,source.height/2);c.rotate(angle*Math.PI/180);c.drawImage(source,-source.width/2,-source.height/2);c.resetTransform();
 const data=c.getImageData(0,0,source.width,source.height);const pixels=data.data;const W=source.width,H=source.height;
 const dark=(x:number,y:number)=>{const n=(y*W+x)*4;return pixels[n]+pixels[n+1]+pixels[n+2]<420;};
 const marks=new Uint8Array(W*H);
 for(let y=0;y<H;y++){let start=0,gap=0;for(let x=0;x<=W;x++) {if(x<W&&dark(x,y)){gap=0;}else gap++;if(gap>3||x===W){const end=x-gap+1;if(end-start>W*.15)for(let k=start;k<end;k++)marks[y*W+k]=1;start=x+1;gap=0;}}}
 for(let x=0;x<W;x++){let start=0,gap=0;for(let y=0;y<=H;y++) {if(y<H&&dark(x,y)){gap=0;}else gap++;if(gap>3||y===H){const end=y-gap+1;if(end-start>H*.07)for(let k=start;k<end;k++)marks[k*W+x]=1;start=y+1;gap=0;}}}
 for(let i=0;i<marks.length;i++)if(marks[i]){const n=i*4;pixels[n]=pixels[n+1]=pixels[n+2]=255;}
 c.putImageData(data,0,0);return canvas.toBuffer('image/png');
}
