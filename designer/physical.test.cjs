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
