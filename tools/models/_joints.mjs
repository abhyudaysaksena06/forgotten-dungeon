import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read('../../client/public/models/boss_nemesis.glb');
const node = doc.getRoot().listNodes().find((n) => n.getMesh()); const pos = node.getMesh().listPrimitives()[0].getAttribute('POSITION');
const n = pos.getCount(), t = node.getTranslation(), s = node.getScale(), v = [0,0,0], P = [];
for (let i=0;i<n;i++){pos.getElement(i,v);P.push([v[0]*s[0]+t[0],v[1]*s[1]+t[1],v[2]*s[2]+t[2]]);}
const stat = (name, f) => { const q = P.filter(f); if (!q.length) return console.log(name, 'none'); const m = [0,1,2].map((k) => q.reduce((a,p)=>a+p[k],0)/q.length); const lo=[0,1,2].map(k=>Math.min(...q.map(p=>p[k]))), hi=[0,1,2].map(k=>Math.max(...q.map(p=>p[k]))); console.log(name.padEnd(14), 'n', String(q.length).padStart(6), 'mean', m.map(x=>x.toFixed(2)).join(','), 'lo', lo.map(x=>x.toFixed(2)).join(','), 'hi', hi.map(x=>x.toFixed(2)).join(',')); };
// sword: far in front, low
const sw = P.filter(p => p[2] > 0.3);
stat('sword z>0.3', p => p[2] > 0.3);
// PCA line of the sword part
const m = [0,1,2].map(k => sw.reduce((a,p)=>a+p[k],0)/sw.length); let c=[[0,0,0],[0,0,0],[0,0,0]]; for (const p of sw) for (let a=0;a<3;a++) for (let b=0;b<3;b++) c[a][b]+=(p[a]-m[a])*(p[b]-m[b]);
let d=[0,1,0]; for (let it=0;it<50;it++){const nd=[0,1,2].map(a=>c[a][0]*d[0]+c[a][1]*d[1]+c[a][2]*d[2]);const l=Math.hypot(...nd);d=nd.map(x=>x/l);} if (d[1]<0) d=d.map(x=>-x);
console.log('sword axis dir (up)', d.map(x=>x.toFixed(3)), 'through', m.map(x=>x.toFixed(2)));
// walk up the axis: radius of points near the axis at each height
for (let y = 0.1; y < 1.3; y += 0.1) { const tt=(y-m[1])/d[1]; const c0=[m[0]+d[0]*tt,y,m[2]+d[2]*tt]; const near=P.filter(p=>Math.abs(p[1]-y)<0.03 && Math.hypot(p[0]-c0[0],p[2]-c0[2])<0.12); const r=near.length?Math.max(...near.map(p=>Math.hypot(p[0]-c0[0],p[2]-c0[2]))):0; console.log(' axis at y',y.toFixed(1),'centre',c0.map(x=>x.toFixed(2)).join(','),'pts',near.length,'r',r.toFixed(3)); }
const front = (p) => p[2] > -0.3 && p[2] < 0.3;
stat('foot R', p => front(p) && p[1] < 0.15 && p[0] < 0.08);
stat('foot L', p => front(p) && p[1] < 0.15 && p[0] > 0.08 && p[2] < 0.3);
stat('knee R', p => front(p) && Math.abs(p[1]-0.5) < 0.04 && p[0] < 0.08 && p[0] > -0.35);
stat('knee L', p => front(p) && Math.abs(p[1]-0.5) < 0.04 && p[0] > 0.08 && p[0] < 0.45);
stat('hand L', p => p[0] > 0.33 && Math.abs(p[1]-0.92) < 0.06);
stat('elbow L', p => p[0] > 0.28 && Math.abs(p[1]-1.17) < 0.04);
stat('arm R 1.17', p => p[0] < -0.12 && Math.abs(p[1]-1.17) < 0.04 && p[2] > -0.3);
stat('arm R 1.0', p => p[0] < -0.08 && Math.abs(p[1]-1.0) < 0.04 && p[2] > -0.1);
stat('torso 1.3', p => Math.abs(p[1]-1.3) < 0.03 && Math.abs(p[0]-0.08) < 0.2);
stat('head 1.7', p => Math.abs(p[1]-1.7) < 0.03);
stat('waist 1.0', p => Math.abs(p[1]-1.0) < 0.03 && Math.abs(p[0]-0.08) < 0.18 && p[2] > -0.3);
