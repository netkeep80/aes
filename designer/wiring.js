
let wiringGesture=null, pickedPort=null, selectedWire='', mapDrag=null;
const circuitInk={AC:'#5680a2',DC:'#b37938',CTRL:'#9271a0',PE:'#418045'};
function svgText(x,y,value,cls='',more=''){return '<text x="'+x+'" y="'+y+'" class="'+cls+'" '+more+'>'+esc(value)+'</text>';}
function clipped(s,n){return s.length>n?s.slice(0,n-1)+'…':s;}
function svgPoint(svg,e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function linePath(points){return points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ');}
function nodeBox(n,x,y,w,h){
  const ps=Object.entries(nodePorts(n)),pins=new Map();
  for(const side of [-1,1]){
    const row=ps.filter(([,p])=>(p.dir==='in'?-1:1)===side);
    row.forEach(([k,p],i)=>pins.set(k,{x:x+w*(i+1)/(row.length+1),y:side<0?y:y+h,side,node:n.id,port:k,p}));
  }
  return {n,x,y,w,h,pins};
}
function drawBox(box,isBoard){
  const {n,x,y,w,h,pins}=box,k=kinds[n.kind],limit=Math.max(3,Math.floor((w-9)/6));
  let out='<g class="wirednode" data-node="'+esc(n.id)+'" tabindex="0" role="button" aria-label="'+esc(n.tag+' · '+n.name)+'"><title>'+esc(n.tag+' · '+n.name)+'</title>'+
   '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="4" fill="'+(selected===n.id?'#fff4df':'#fcfdf9')+'" stroke="'+(selected===n.id?'#b36b18':'#91a39a')+'"/>'+
   '<path d="M'+(x+3)+' '+(y+9)+'h'+(w-6)+'" stroke="var(--'+k[3]+')" stroke-width="3"/>'+svgText(x+5,y+25,clipped(n.tag,limit),'drawtag');
  if(w>70)out+=svgText(x+5,y+40,clipped(n.name,limit),'drawlabel');
  if(isBoard)out+='<rect x="'+(x+w*.28)+'" y="'+(y+h-17)+'" width="'+(w*.44)+'" height="7" rx="2" fill="#51635a"/>';
  out+='</g>';
  for(const [key,pin] of pins){
    const data='data-pin="'+esc(n.id+':'+key)+'"',title=n.tag+' · '+pin.p.label+' ('+pin.p.medium+')';
    out+='<g '+data+' class="wirepin" tabindex="0" role="button" aria-label="'+esc(title)+'"><title>'+esc(title+' · протяните или выберите два порта')+'</title>'+
      '<circle cx="'+pin.x+'" cy="'+pin.y+'" r="9" fill="transparent"/><circle cx="'+pin.x+'" cy="'+pin.y+'" r="4.2" fill="#fff" stroke="'+circuitInk[pin.p.medium]+'" stroke-width="2"/></g>';
  }
  return out;
}
function drawGeometry(ns,ls,b){
  const boxes=new Map(),rows=[],pad=55,pitch=49,first=61,rowGap=150,edgeItems=[];
  const ix=new Map(model.nodes.map(n=>[n.id,n]));
  let width,height;
  if(b){
    for(const n of ns)boxes.set(n.id,nodeBox(n,pad+(n.place.slot-1)*pitch+2,first+(n.place.row-1)*rowGap,n.width*pitch-4,65));
    width=pad*2+b.slots*pitch;height=first+b.rows*rowGap+30;
  }else{
    const groups=new Map();for(const n of ns){const g=placeGroup(model,n);if(!groups.has(g.id))groups.set(g.id,{g,ns:[]});groups.get(g.id).ns.push(n);}
    let i=0,maxY=55;
    for(const {g,ns:items} of groups.values()){
      const x=30+i++*215;
      rows.push(svgText(x,19,clipped(g.title,28),'grouplabel'));let y=55;
      for(const n of items){const w=Math.max(150,Math.min(189,Math.max(1,Object.keys(nodePorts(n)).length)*10));boxes.set(n.id,nodeBox(n,x,y,w,50));y+=104;}
      maxY=Math.max(maxY,y);
    }
    width=i*215+30;height=maxY;
  }
  const exitGroups=new Map();
  for(const l of ls){
    const from=boxes.get(l.from.node)?.pins.get(l.from.port),to=boxes.get(l.to.node)?.pins.get(l.to.port);
    if(!from&&!to)continue;
    for(const wire of l.wires.length?l.wires:[null]){
      const item={l,wire,from,to};
      if(!from||!to){
        if(!b)continue;
        const g=placeGroup(model,ix.get(!from?l.from.node:l.to.node));
        if(!exitGroups.has(g.id))exitGroups.set(g.id,{g,items:[]});
        exitGroups.get(g.id).items.push(item);
      }
      edgeItems.push(item);
    }
  }
  if(b){
    for(let r=0;r<b.rows;r++){
      const y=first+r*rowGap;
      rows.push('<rect x="'+pad+'" y="'+(y+23)+'" width="'+b.slots*pitch+'" height="18" fill="#c1cdc5" stroke="#99aaa0"/>');
      rows.push(svgText(8,y+35,'DIN '+(r+1),'grouplabel'));
      for(let i=0;i<b.slots;i++)rows.push(svgText(pad+i*pitch+pitch*.5,y-21,String(i+1),'slotlabel','text-anchor="middle"'));
    }
    let left=pad;
    for(const {g,items} of exitGroups.values()){
      const span=Math.max(104,items.length*15+14),y=height;
      rows.push('<rect x="'+left+'" y="'+y+'" width="'+span+'" height="37" rx="5" fill="#e3eae2" stroke="#9aaa9c"><title>'+esc(g.title)+'</title></rect>'+svgText(left+7,y+16,clipped(g.title,Math.floor(span/7)),'exitlabel')+svgText(left+7,y+29,items.length+' отвод.','slotlabel'));
      items.forEach((item,i)=>{const pin={x:left+(i+1)*span/(items.length+1),y,side:-1,exit:true};if(!item.from)item.from=pin;else item.to=pin;});
      left+=span+10;
    }
    width=Math.max(width,left+pad);height+=exitGroups.size?52:0;
  }
  return {boxes,rows,width,height,edgeItems};
}
function autoPoints(a,b,i,boxes,isBoard){
  const lane=12+(i%6)*3,ay=a.y+a.side*lane,by=b.y+b.side*lane;
  const p=[a,{x:a.x,y:ay}];
  if(Math.abs(ay-by)>1){
    let trunk;
    if(isBoard){const right=Math.max(...[...boxes.values()].map(box=>box.x+box.w))+14;trunk=(a.x+b.x)/2>right/2 ? right+(i%7)*3 : 12+(i%7)*4;}
    else {const bound=boxes.get(a.node);trunk=bound?bound.x+bound.w+12+(i%6)*3:a.x+20;}
    p.push({x:trunk,y:ay},{x:trunk,y:by});
  }
  return [...p,{x:b.x,y:by},b];
}
function displayedPoints(a,b,manual,i,boxes,isBoard){
  if(!manual?.length)return autoPoints(a,b,i,boxes,isBoard);
  return [a,{x:a.x,y:a.y+a.side*10},...manual,{x:b.x,y:b.y+b.side*10},b];
}
function wireDrawing(ns,ls,b=null){
  if(!ns.length&&!b)return empty('Устройств в этой области пока нет.');
  const {boxes,rows,width,height,edgeItems}=drawGeometry(ns,ls,b),reach=!b&&trace&&selected?connectedSet(selected,ls):null;
  const pieces=[],handles=[];
  edgeItems.forEach(({l,wire:w,from:a,to:z},i)=>{
    const editing=!!(b&&routeEdit&&w&&routeEdit.id===w.id),chosen=!!w&&w.id===selectedWire;
    const manual=editing?routeEdit.points:(b&&w?.routes?.[b.id]);
    const d=linePath(displayedPoints(a,z,manual,i,boxes,!!b));
    const color=w?coreColors[w.color][1]:'#84958d',data=w?'data-wire="'+esc(w.id)+'"':'data-link="'+esc(l.id)+'"';
    const tip=w?w.name+' · '+coreColors[w.color][0]+' · '+node(l.from.node).tag+' → '+node(l.to.node).tag:'Логическая связь без провода';
    pieces.push('<g '+data+' class="drawedge" opacity="'+(reach && !reach.has(l.from.node) ? 0.2 : 1)+'"><title>'+esc(tip)+'</title><path d="'+d+'" fill="none" stroke="transparent" stroke-width="9"/><path class="visiblewire" d="'+d+'" fill="none" stroke="'+color+'" stroke-width="'+(chosen||editing?4:2.3)+'" '+(w?'':'stroke-dasharray="3 4"')+'/>'+(w?.color==='pe'?'<path d="'+d+'" fill="none" stroke="#f2d848" stroke-dasharray="6 5" stroke-width="2"/>':'')+'</g>');
    if(editing)manual.forEach((p,j)=>handles.push('<circle data-bend="'+j+'" class="bend" cx="'+p.x+'" cy="'+p.y+'" r="6" fill="#ffb45a" stroke="#5c462c"/>'));
  });
  const content=rows.join('')+pieces.join('')+[...boxes.values()].map(x=>drawBox(x,!!b)).join('')+handles.join('');
  const w=b?width:width*zoom,h=b?height:height*zoom;
  return '<div class="'+(b?'boarddrawing':'netcanvas')+'"><svg class="wiringsvg" aria-label="'+(b?'Проводка щита':'Сеть устройств')+'" viewBox="0 0 '+width+' '+height+'" width="'+w+'" height="'+h+'">'+content+'</svg></div>';
}
function panelWireList(b){
  const links=model.links.filter(l=>node(l.from.node).place?.board===b.id||node(l.to.node).place?.board===b.id);
  const buttons=links.flatMap(l=>l.wires.map(w=>act('wireOptions',w.name+' · '+node(l.from.node).tag+' → '+node(l.to.node).tag,'link','',extraAttr('id',w.id))));
  return '<details class="wirecatalog"><summary>Провода щита ('+buttons.length+')</summary><div class="chooseitems">'+buttons.join('')+'</div></details>';
}
function routeControls(){
  if(!routeEdit)return '<div class="wirehint">Протяните провод между клеммами или выберите две клеммы по очереди. Нажмите провод для правки трассы.</div>';
  return '<div class="routetools"><b>Ручная трасса</b><span>Нажмите на схему для изгиба. Точки перетаскиваются мышью.</span>'+act('popBend','Убрать точку')+act('saveRoute','Сохранить трассу','','primary')+act('cancelRoute','Отмена')+'</div>';
}
function wireMenu(ref){
  const {wire:w,link:l}=ref;selectedWire=w.id;render();
  const route=b=>w.routes?.[b]?.length?'ручная':'автоматическая';
  modal(w.name+' · '+signalRoles[w.role],'<p>'+esc(node(l.from.node).tag+' → '+node(l.to.node).tag)+' · '+esc(coreColors[w.color][0])+'</p><div class="menu-actions">'+act('editWire','Свойства провода','edit','',extraAttr('id',w.id))+
   (page==='board'?act('startRoute','Ручная прокладка','edit','',extraAttr('id',w.id))+act('resetRoute','Автопрокладка','net','',extraAttr('id',w.id)):'')+'</div>'+(page==='board'?'<p>Трасса в этом щите: '+route(boardId)+'.</p>':''));
}
function parsePin(key){const [node,port]=key.split(':');return {node,port};}
function completePins(first,last){
  if(first===last)return;
  let a=parsePin(first),b=parsePin(last),p=nodePorts(node(a.node))[a.port],q=nodePorts(node(b.node))[b.port];
  if(p.dir==='in'||q.dir==='out'){[a,b]=[b,a];[p,q]=[q,p];}
  if(a.node===b.node||p.dir==='in'||q.dir==='out'||p.medium!==q.medium){message('Нужны совместимые порты двух разных устройств.');return;}
  const existing=model.links.find(l=>l.from.node===a.node&&l.from.port===a.port&&l.to.node===b.node&&l.to.port===b.port);
  wireForm(existing,null,{from:a,to:b});
}
function clearPin(){pickedPort=null;document.querySelectorAll('.pinpicked').forEach(el=>el.classList.remove('pinpicked'));}
function choosePin(el){
  const pin=el.dataset.pin;
  if(pickedPort){const first=pickedPort;clearPin();completePins(first,pin);}
  else{pickedPort=pin;el.classList.add('pinpicked');message('Выберите вторую клемму. Esc — отмена.');}
}
function bounded(svg,e){
  const p=svgPoint(svg,e),box=svg.viewBox.baseVal;
  return {x:Math.round(Math.max(1,Math.min(box.width-1,p.x))),y:Math.round(Math.max(1,Math.min(box.height-1,p.y)))};
}
document.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const svg=e.target.closest('.wiringsvg');if(!svg)return;
  const pin=e.target.closest('[data-pin]'),bend=e.target.closest('[data-bend]');
  if(routeEdit&&page==='board'){
    e.preventDefault();e.stopPropagation();
    if(bend){wiringGesture={svg,bend:+bend.dataset.bend,target:bend};svg.setPointerCapture(e.pointerId);}
    else if(routeEdit.points.length<64){routeEdit.points.push(bounded(svg,e));render();}
    return;
  }
  if(!pin)return;
  e.preventDefault();const start=svgPoint(svg,e),line=document.createElementNS('http://www.w3.org/2000/svg','path');
  line.setAttribute('class','rubberwire');svg.append(line);svg.setPointerCapture(e.pointerId);
  wiringGesture={svg,pin,start,line,cx:e.clientX,cy:e.clientY};
});
document.addEventListener('pointermove',e=>{
  const g=wiringGesture;if(!g)return;
  if(g.bend!==undefined){const p=bounded(g.svg,e);routeEdit.points[g.bend]=p;g.target.setAttribute('cx',p.x);g.target.setAttribute('cy',p.y);
    const edge=[...g.svg.querySelectorAll('.drawedge')].find(el=>el.dataset.wire===routeEdit.id);
    if(edge){const vertices=edge.querySelector('path').getAttribute('d').match(/[ML][^ML]+/g);vertices[g.bend+2]='L'+p.x+' '+p.y;edge.querySelectorAll('path').forEach(path=>path.setAttribute('d',vertices.join(' ')));}
    return;}
  const p=svgPoint(g.svg,e);g.line.setAttribute('d',linePath([g.start,p]));
});
document.addEventListener('pointerup',e=>{
  const g=wiringGesture;if(!g)return;wiringGesture=null;
  if(g.svg.hasPointerCapture(e.pointerId))g.svg.releasePointerCapture(e.pointerId);
  if(g.bend!==undefined){render();return;}
  g.line.remove();const end=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-pin]');
  if(Math.hypot(e.clientX-g.cx,e.clientY-g.cy)<5){choosePin(g.pin);return;}
  clearPin();if(end)completePins(g.pin.dataset.pin,end.dataset.pin);else message('Отпустите провод на клемме назначения.');
});
document.addEventListener('pointercancel',()=>{wiringGesture?.line?.remove();wiringGesture=null;mapDrag=null;});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){clearPin();if(routeEdit){routeEdit=null;render();}}
  if(['Enter',' '].includes(e.key)&&e.target.matches('[data-pin]')){e.preventDefault();choosePin(e.target);}
});
document.addEventListener('click',e=>{
  if(routeEdit&&e.target.closest('.wiringsvg')){e.stopImmediatePropagation();return;}
  const wire=e.target.closest('.drawedge[data-wire]');if(wire){e.stopImmediatePropagation();const ref=rawWire(wire.dataset.wire);if(ref)wireMenu(ref);}
},true);
