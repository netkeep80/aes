
function mapData(){
  const byNode=new Map(),groups=new Map(),bundles=new Map(),areas=new Map(model.areas.map(a=>[a.id,a]));
  function put(g,record){
    if(overviewMode==='buildings'&&g.area){
      let a=areas.get(g.area);if(a?.type==='room')a=areas.get(a.parent);
      if(a){g={id:a.id,title:a.name,type:'Здание',area:a.id};record=a;}
    }
    if(!groups.has(g.id))groups.set(g.id,{...g,record,count:0});
    return groups.get(g.id);
  }
  for(const a of model.areas){
    if((overviewMode==='buildings'&&a.type==='building')||(overviewMode==='panels'&&a.type==='room'))put({id:a.id,title:a.name,type:a.type==='room'?'Помещение':'Здание',area:a.id},a);
  }
  for(const b of model.boards)put({id:b.id,title:b.tag+' · '+b.name,type:'Щит',area:b.area},b);
  for(const n of model.nodes){
    const group=placeGroup(model,n);const record=byId(model.boards,group.id)||areas.get(group.id)||n;
    const g=put(group,record);byNode.set(n.id,g.id);g.count++;
  }
  for(const l of model.links){
    const a=byNode.get(l.from.node),b=byNode.get(l.to.node);if(a===b)continue;
    const key=JSON.stringify([a,b].sort());
    if(!bundles.has(key))bundles.set(key,{a,b,links:new Set(),cables:new Set(),loose:0,unknown:0});
    const bundle=bundles.get(key);bundle.links.add(l.id);if(!l.wires.length)bundle.unknown++;
    for(const w of l.wires){if(w.cable)bundle.cables.add(w.cable);else bundle.loose++;}
  }
  let i=0;
  for(const g of groups.values()){
    const saved=g.record.xy;g.x=saved?.x??(35+(i%3)*235);g.y=saved?.y??(45+Math.floor(i/3)*140);i++;
  }
  return {groups,bundles};
}
function overviewSVG(data){
  const gs=[...data.groups.values()],width=Math.max(760,...gs.map(g=>g.x+240)),height=Math.max(400,...gs.map(g=>g.y+148));
  const edges=[...data.bundles].map(([key,b])=>{
    const a=data.groups.get(b.a),z=data.groups.get(b.b);
    const dx=z.x-a.x,dy=z.y-a.y,horizontal=Math.abs(dx)/174>=Math.abs(dy)/62;
    const ax=a.x+87+(horizontal?Math.sign(dx)*87:0),ay=a.y+31+(horizontal?0:Math.sign(dy)*31),
          bx=z.x+87-(horizontal?Math.sign(dx)*87:0),by=z.y+31-(horizontal?0:Math.sign(dy)*31);
    const mx=(ax+bx)/2,my=(ay+by)/2;
    const selected=key===chosenBundle;
    const label=b.cables.size+' К / '+b.loose+' П'+(b.unknown?' / '+b.unknown+' ?':'');
    return '<g data-bundle="'+esc(key)+'" class="bundleedge" tabindex="0" role="button" aria-label="'+esc(a.title+' — '+z.title)+'"><title>'+esc(a.title+' ↔ '+z.title+' · '+label)+'</title><path d="M'+ax+' '+ay+' L'+bx+' '+by+'" stroke="transparent" stroke-width="18"/><path d="M'+ax+' '+ay+' L'+bx+' '+by+'" stroke="'+(selected?'#b66d16':'#718e88')+'" stroke-width="'+Math.min(9,3+Math.log2(1+b.links.size))+'"/><rect x="'+(mx-39)+'" y="'+(my-10)+'" width="78" height="20" rx="6" fill="#f7f9f3" stroke="#a7b7aa"/>'+svgText(mx,my+4,label,'slotlabel','text-anchor="middle"')+'</g>';
  }).join('');
  const cards=gs.map(g=>'<g data-mapid="'+esc(g.id)+'" class="mapcard" tabindex="0" role="button" aria-label="'+esc(g.title)+'"><rect x="'+g.x+'" y="'+g.y+'" width="174" height="62" rx="8" fill="'+(overviewSelection===g.id?'#fff0db':'#fff')+'" stroke="#879d91"/>'+svgText(g.x+12,g.y+17,g.type.toUpperCase(),'slotlabel')+svgText(g.x+12,g.y+36,clipped(g.title,24),'drawtag')+svgText(g.x+12,g.y+51,amount(g.count,'устройство','устройства','устройств'),'slotlabel')+'</g>').join('');
  return '<svg class="mapsvg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" aria-label="План объектов">'+edges+cards+'</svg>';
}
function overviewPage(){
  const data=mapData(),bundle=data.bundles.get(chosenBundle),g=data.groups.get(overviewSelection);
  let detail=empty('Нажмите группу кабелей для просмотра состава или узел для его свойств.');
  if(bundle)detail='<p><b>'+esc(data.groups.get(bundle.a).title)+' ↔ '+esc(data.groups.get(bundle.b).title)+'</b></p><p>Кабелей: '+bundle.cables.size+' · отдельных проводов: '+bundle.loose+' · связей без проводов: '+bundle.unknown+'</p>'+bundleRows(bundle.links);
  else if(g){const action=byId(model.boards,g.id)?'openMapBoard':byId(model.areas,g.id)?'editArea':'nodeProperties';detail='<p><b>'+esc(g.title)+'</b></p>'+act(action,action==='openMapBoard'?'Открыть щит':'Свойства','edit','',extraAttr('id',g.record.id));}
  return crumb('План объектов')+heading('Участок','План объектов','Здания, щиты и направления прокладки',act('addArea','Здание / помещение','plus','primary'))+
   tabs([['panels','Щиты и помещения'],['buildings','Здания']],overviewMode,'mapMode')+'<div class="workspace"><section class="panel"><div class="panelhead"><h2>'+icon('net')+'Группы кабелей</h2></div><div class="mapscroll">'+overviewSVG(data)+'</div><div class="wirehint">Перетаскивайте узлы. К — кабели, П — отдельные провода, ? — связи без описания жил.</div></section><aside class="panel mapdetail"><h2>Инспектор плана</h2>'+detail+'</aside></div>'+
   '<section class="panel tablepanel"><div class="panelhead"><h2>Здания и помещения</h2></div><div class="chooseitems">'+model.areas.map(a=>act('editArea',areaTitle(model,a.id),'pin','',extraAttr('id',a.id))).join('')+'</div></section>';
}
function selectMap(el){if(el.dataset.mapid){overviewSelection=el.dataset.mapid;chosenBundle='';}else{chosenBundle=el.dataset.bundle;overviewSelection='';}render();}
document.addEventListener('pointerdown',e=>{
  const el=e.target.closest('.mapcard');if(!el||e.button!==0)return;
  const svg=el.ownerSVGElement,p=svgPoint(svg,e),data=mapData(),g=data.groups.get(el.dataset.mapid);
  mapDrag={svg,data,g,start:p,x:g.x,y:g.y,moved:false};svg.setPointerCapture(e.pointerId);e.preventDefault();
});
document.addEventListener('pointermove',e=>{
  if(!mapDrag)return;
  const {svg,g,start,x,y,data}=mapDrag,p=svgPoint(svg,e);
  if(Math.hypot(p.x-start.x,p.y-start.y)<4&&!mapDrag.moved)return;
  mapDrag.moved=true;g.x=Math.round(Math.max(0,Math.min(svg.viewBox.baseVal.width-174,x+p.x-start.x)));
  g.y=Math.round(Math.max(0,Math.min(svg.viewBox.baseVal.height-62,y+p.y-start.y)));
  const layer=document.createElementNS('http://www.w3.org/2000/svg','g');
  layer.innerHTML=overviewSVG(data).replace(/^<svg[^>]*>|<\/svg>$/g,'');svg.replaceChildren(layer);
});
document.addEventListener('pointerup',e=>{
  if(!mapDrag)return;
  const {svg,g,moved}=mapDrag;mapDrag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
  overviewSelection=g.id;chosenBundle='';
  if(moved)change(m=>{const item=[...m.areas,...m.boards,...m.nodes].find(x=>x.id===g.record.id);item.xy={x:g.x,y:g.y};});
  else render();
});
document.addEventListener('click',e=>{const el=e.target.closest('[data-bundle]');if(el)selectMap(el);});
document.addEventListener('keydown',e=>{const el=e.target.closest('[data-bundle],[data-mapid]');if(el&&[' ','Enter'].includes(e.key)){e.preventDefault();selectMap(el);}});
Object.assign(actions,{
  files:el=>dropdown(el,[['newProject','Новый проект','plus'],['projectTitle','Переименовать','edit'],['import','Открыть JSON','upload'],['save','Сохранить копию','download'],['demo','Демонстрационный проект','house']]),
  tools:el=>dropdown(el,[['addBoard','Добавить щит','box'],['addNode','Добавить устройство','chip'],['addArea','Здание / помещение','house'],['addCable','Добавить кабель','link'],['openCalc','Электрические расчёты','bolt']]),
  addArea:()=>areaForm(),editArea:el=>areaForm(byId(model.areas,el.dataset.id)),
  removeArea:()=>{const a=byId(model.areas,$('#form').dataset.area);if([...model.areas,...model.nodes,...model.boards].some(x=>x.area===a.id||x.parent===a.id))throw Error('Сначала перенесите объекты и помещения из этого места.');confirmAction('Удалить место?',a.name,'Удалить',()=>change(m=>m.areas=m.areas.filter(x=>x.id!==a.id)));},
  addCable:()=>cableForm(),editCable:el=>cableForm(byId(model.cables,el.dataset.id)),
  removeCable:()=>{const cid=$('#form').dataset.cable;if(physicalRows(model).some(r=>r.wire.cable===cid))throw Error('Кабель содержит жилы. Сначала переназначьте их.');confirmAction('Удалить кабель?',byId(model.cables,cid).name,'Удалить',()=>change(m=>m.cables=m.cables.filter(c=>c.id!==cid)));},
  addWireTo:el=>wireForm(byId(model.links,el.dataset.id)),
  editWire:el=>{const r=rawWire(el.dataset.id);wireForm(r.link,r.wire);},
  removeWire:()=>{const wid=$('#form').dataset.wire,r=rawWire(wid);confirmAction('Удалить провод?',r.wire.name+' · функциональная связь сохранится.','Удалить',()=>change(m=>{const l=byId(m.links,r.link.id);l.wires=l.wires.filter(w=>w.id!==wid);}));},
  boardMode:el=>{routeEdit=null;clearPin();boardMode=el.dataset.key;render();},
  stockMode:el=>{inventoryMode=el.dataset.key;render();},
  mapMode:el=>{overviewMode=el.dataset.key;chosenBundle='';overviewSelection='';render();},
  openMapBoard:el=>{boardId=el.dataset.id;nav('board');},
  wireOptions:el=>wireMenu(rawWire(el.dataset.id)),
  startRoute:el=>{const r=rawWire(el.dataset.id);routeEdit={id:r.wire.id,points:clone(r.wire.routes?.[boardId]||[])};closeDialog();render();},
  resetRoute:el=>{const r=rawWire(el.dataset.id);change(m=>{const w=byId(byId(m.links,r.link.id).wires,r.wire.id);if(w.routes)delete w.routes[boardId];});closeDialog();},
  saveRoute:()=>{const r=rawWire(routeEdit.id),points=routeEdit.points;routeEdit=null;change(m=>{const w=byId(byId(m.links,r.link.id).wires,r.wire.id);w.routes??={};Object.defineProperty(w.routes,boardId,{value:points,enumerable:true,writable:true,configurable:true});});},
  cancelRoute:()=>{routeEdit=null;render();},popBend:()=>{routeEdit.points.pop();render();},
  designCircuit:el=>circuitForm(findStock(model,el.dataset.id)),openCalc:()=>nav('calc'),
  nodeProperties:el=>{selected=el.dataset.id;nodeForm(true);},
  powerPick:()=>modal('Электрические данные устройств','<div class="bundlelist">'+model.nodes.map(n=>act('nodeProperties',n.tag+' · '+n.name,'chip','',extraAttr('id',n.id))).join('')+'</div>')
});
