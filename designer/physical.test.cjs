const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const source = ['model.js','engineering.js'].map(p=>fs.readFileSync(path.join(__dirname,p),'utf8')).join('\n');
const api = new Function('crypto',source+'\nreturn {makeDemo,kinds,clone,loadCurrent,calculateCircuit,physicalRows,checkModel};')(webcrypto);
const {makeDemo,kinds,clone,loadCurrent,calculateCircuit,physicalRows,checkModel} = api;

const ok=(state,msg)=>{if(!state)throw Error(msg);};
const rejects=(fn,msg)=>{try{fn();}catch{return;}throw Error(msg);};
const m=makeDemo();
ok(Object.keys(kinds).length>=40,'catalog');
const old=clone(m); old.format='AES/1';delete old.areas;delete old.cables;
for(const n of [...old.nodes,...old.boards]){delete n.area;delete n.xy;}
old.links.forEach(l=>delete l.wires);
rejects(()=>checkModel(old),'unsupported project format');
ok(Math.abs(loadCurrent({mode:'AC3',watts:Math.sqrt(3)*400*10*.8,volts:400,pf:.8})-10)<1e-8,'AC3 current');
ok(loadCurrent({mode:'DC',watts:120,volts:12,pf:1})===10,'DC current');
const cable=m.cables.find(c=>c.design.members[0]==='appliance');
ok(physicalRows(m).filter(r=>r.wire.cable===cable.id).length===3,'three distinct cores');
let r=calculateCircuit(m,cable,['AC']);ok(r.current===10&&r.nominal===10&&r.candidate.section===1.5,'AC1 fixture');
r=calculateCircuit(m,{...cable,length:100},['AC']);ok(r.candidate.section===10,'drop dominates');
r=calculateCircuit(m,{...cable,design:{...cable.design,factor:.5}},['AC']);ok(r.candidate.section===2.5,'derating dominates');
for(const members of [['grid','appliance'],['appliance','lights'],[]]){const rejected=calculateCircuit(m,{...cable,design:{...cable.design,members}});ok(!rejected.candidate&&rejected.reason,'ambiguous basis');}
ok(!calculateCircuit(m,cable,['DC']).candidate,'medium mismatch');
ok(!calculateCircuit(m,{...cable,length:null}).candidate,'unknown length');
ok(!calculateCircuit(m,{...cable,material:'Al'}).candidate,'unknown thermal profile');
const collision=clone(m);const shared=physicalRows(collision).filter(r=>r.wire.cable===cable.id);
shared[1].wire.core=shared[0].wire.core;rejects(()=>checkModel(collision),'core alias');
const badColor=clone(m);physicalRows(badColor).find(r=>r.wire.role==='PE').wire.color='blue';rejects(()=>checkModel(badColor),'PE color');
console.log('PASS physical model, catalogue, current schema, thermal selection, AC/DC, voltage drop, grouping, cable cores and colors');

const geometry = fs.readFileSync(path.join(__dirname,'ortho.js'),'utf8');
const {orthogonalRoute,slideSegment} = new Function(geometry+'\nreturn {orthogonalRoute,slideSegment};')();
const rects=[{x:30,y:110,w:100,h:60},{x:290,y:90,w:85,h:110},{x:530,y:110,w:100,h:60}];
const start={x:130,y:140,dx:1,dy:0},end={x:530,y:140,dx:-1,dy:0};
function verifyPath(points,boxes){
  ok(points.length>=2,'missing route');
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    ok(a.x===b.x||a.y===b.y,'diagonal');
    for(const r of boxes){
      const x1=Math.max(r.x,Math.min(a.x,b.x)),x2=Math.min(r.x+r.w,Math.max(a.x,b.x));
      const y1=Math.max(r.y,Math.min(a.y,b.y)),y2=Math.min(r.y+r.h,Math.max(a.y,b.y));
      const cuts=a.x===b.x?a.x>r.x&&a.x<r.x+r.w&&y1<y2:a.y>r.y&&a.y<r.y+r.h&&x1<x2;
      ok(!cuts,'route enters rectangle');
    }
  }
}
for(let lane=0;lane<8;lane++){
  const route=orthogonalRoute(start,end,rects,null,lane);verifyPath(route,rects);
  for(let i=0;i<route.length-1;i++){
    const moved=[6,-6,2,-2].map(delta=>slideSegment(route,i,delta,rects)).find(p=>p&&JSON.stringify(p)!==JSON.stringify(route));
    ok(moved,'unmovable segment '+i);verifyPath(moved,rects);
    ok(moved[0].x===start.x&&moved[0].y===start.y&&moved.at(-1).x===end.x&&moved.at(-1).y===end.y,'detached endpoint');
  }
  const blocked={x:270,y:48,w:80,h:170};
  verifyPath(orthogonalRoute(start,end,[...rects,blocked],route,lane),[...rects,blocked]);
}
const direct=orthogonalRoute(start,end,[rects[0],rects[2]]);
ok(direct.length===2,'straight default');
const jog=slideSegment(direct,0,25,rects.filter((_,i)=>i!==1));ok(jog.length===6,'both terminal doglegs');
ok(!slideSegment(direct,0,25,[...rects,{x:160,y:148,w:50,h:50}]),'invalid drop');
console.log('PASS orthogonal detours, all segment indices, terminal doglegs, blocked routes and reconnection');
const upper={x:40,y:30,w:100,h:50},lower={x:40,y:210,w:100,h:50};
const plug={x:90,y:80,dx:0,dy:1},socket={x:90,y:210,dx:0,dy:-1};
const parallelCores=[-8,0,8].map((spread,i)=>orthogonalRoute(plug,socket,[upper,lower],null,i,spread));
parallelCores.forEach(p=>verifyPath(p,[upper,lower]));
ok(new Set(parallelCores.map(p=>JSON.stringify(p))).size===3,'parallel cores share a trace');
