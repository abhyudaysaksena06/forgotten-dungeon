import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { MeshoptDecoder } from 'meshoptimizer'; import sharp from 'sharp';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]); const out = process.argv[3];
const node = doc.getRoot().listNodes().find((n) => n.getMesh());
const p = node.getMesh().listPrimitives()[0]; const pos = p.getAttribute('POSITION'); const n = pos.getCount();
const t = node.getTranslation(), s = node.getScale(); const v = [0,0,0];
const P = new Float32Array(n*3); for (let i=0;i<n;i++){pos.getElement(i,v);for(let k=0;k<3;k++)P[i*3+k]=v[k]*s[k]+t[k];}
let mn=[9,9,9],mx=[-9,-9,-9];for(let i=0;i<n;i++)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],P[i*3+k]);mx[k]=Math.max(mx[k],P[i*3+k]);}
console.log('bbox',mn.map(x=>x.toFixed(3)),mx.map(x=>x.toFixed(3)));
const R=400, W=2*R; // 400 px per metre? use 300px/m
const ppm=300; const ZCUT=Number(process.argv[4]??-9);
for (const [name, ax, depth] of [['front',0,2],['side',2,0]]) {
  const w = Math.ceil((mx[ax]-mn[ax])*ppm)+80, h = Math.ceil((mx[1]-mn[1])*ppm)+80;
  const img = new Uint8Array(w*h*3).fill(20);
  const zb = new Float32Array(w*h).fill(-9);
  for (let i=0;i<n;i++){if(name==='front'&&P[i*3+2]<ZCUT)continue;const x=Math.round((P[i*3+ax]-mn[ax])*ppm)+40, y=h-1-(Math.round((P[i*3+1]-mn[1])*ppm)+40); const d=P[i*3+depth]*(name==='front'?1:1);
    if (d>zb[y*w+x]){zb[y*w+x]=d; const c=Math.max(40,Math.min(255,Math.round(140+(d)*180))); img.set([c,c,c],(y*w+x)*3);} }
  // grid every 0.1 m, labelled lines every 0.5
  for (let gx=Math.ceil(mn[ax]*10)/10; gx<=mx[ax]; gx+=0.1){const x=Math.round((gx-mn[ax])*ppm)+40; for(let y=0;y<h;y++){const o=(y*w+x)*3; if(img[o]===20){img.set(Math.abs(gx-Math.round(gx*2)/2)<1e-6?[150,40,40]:[50,50,70],o);}}}
  for (let gy=0; gy<=mx[1]; gy+=0.1){const y=h-1-(Math.round((gy-mn[1])*ppm)+40); for(let x=0;x<w;x++){const o=(y*w+x)*3; if(img[o]===20){img.set(Math.abs(gy-Math.round(gy*2)/2)<1e-6?[150,40,40]:[50,50,70],o);}}}
  await sharp(Buffer.from(img),{raw:{width:w,height:h,channels:3}}).png().toFile(`${out}/${name}.png`);
  console.log(name, 'x-axis', ax===0?'X':'Z', 'origin px', Math.round((0-mn[ax])*ppm)+40, 'ground px', h-1-(Math.round((0-mn[1])*ppm)+40), 'size', w, h);
}
