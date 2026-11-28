
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
    const saved=g.record.xy;g.x=saved?.x??(35+(i%3)*278);g.y=saved?.y??(45+Math.floor(i/3)*140);i++;
  }
  return {groups,bundles};
}
function overviewPage(){
  const data=mapData(),scene=planScene(data),bundle=data.bundles.get(chosenBundle),g=data.groups.get(overviewSelection);
  let detail=empty('Нажмите группу кабелей для просмотра состава или узел для его свойств.');
  if(bundle)detail='<p><b>'+esc(data.groups.get(bundle.a).title)+' ↔ '+esc(data.groups.get(bundle.b).title)+'</b></p><p>Кабелей: '+bundle.cables.size+' · отдельных проводов: '+bundle.loose+' · связей без проводов: '+bundle.unknown+'</p>'+routeTools(scene.view,scene.edges.find(e=>e.key===chosenBundle))+bundleRows(bundle.links);
  else if(g){const action=byId(model.boards,g.id)?'openMapBoard':byId(model.areas,g.id)?'editArea':'nodeProperties';detail='<p><b>'+esc(g.title)+'</b></p>'+act(action,action==='openMapBoard'?'Открыть щит':'Свойства','edit','',extraAttr('id',g.record.id));}
  return crumb('План объектов')+heading('Участок','План объектов','Здания, щиты и направления прокладки',act('addArea','Здание / помещение','plus','primary'))+
   tabs([['panels','Щиты и помещения'],['buildings','Здания']],overviewMode,'mapMode')+'<div class="workspace"><section class="panel"><div class="panelhead"><h2>'+icon('net')+'Группы кабелей</h2></div><div class="mapscroll">'+diagramSvg(scene)+'</div><div class="wirehint">Потяните узел или сегмент трассы. Нажмите группу для выбора цвета. К — кабели, П — отдельные провода, ? — связи без описания жил.</div></section><aside class="panel mapdetail"><h2>Инспектор плана</h2>'+detail+'</aside></div>'+
   '<section class="panel tablepanel"><div class="panelhead"><h2>Здания и помещения</h2></div><div class="chooseitems">'+model.areas.map(a=>act('editArea',areaTitle(model,a.id),'pin','',extraAttr('id',a.id))).join('')+'</div></section>';
}
document.addEventListener('keydown',e=>{
  const card=e.target.closest('[data-mapid]');
  if(card&&[' ','Enter'].includes(e.key)){e.preventDefault();overviewSelection=card.dataset.mapid;chosenBundle='';render();}
});
Object.assign(actions,{
  files:el=>dropdown(el,[['newProject','Новый проект','plus'],['projectTitle','Переименовать','edit'],['import','Открыть JSON','upload'],['save','Сохранить копию','download'],['studio','Выбрать студию и проект','house'],...(demoWorkspace?[['demo','Восстановить исходное демо','undo']]:[])]),
  tools:el=>dropdown(el,[['addBoard','Добавить щит','box'],['addNode','Добавить устройство','chip'],['addArea','Здание / помещение','house'],['addCable','Добавить кабель','link'],['openCalc','Электрические расчёты','bolt']]),
  addArea:()=>areaForm(),editArea:el=>areaForm(byId(model.areas,el.dataset.id)),
  removeArea:()=>{const a=byId(model.areas,$('#form').dataset.area);if([...model.areas,...model.nodes,...model.boards].some(x=>x.area===a.id||x.parent===a.id))throw Error('Сначала перенесите объекты и помещения из этого места.');confirmAction('Удалить место?',a.name,'Удалить',()=>change(m=>m.areas=m.areas.filter(x=>x.id!==a.id)));},
  addCable:()=>cableForm(),editCable:el=>cableForm(byId(model.cables,el.dataset.id)),
  removeCable:()=>{const cid=$('#form').dataset.cable;if(physicalRows(model).some(r=>r.wire.cable===cid))throw Error('Кабель содержит жилы. Сначала переназначьте их.');confirmAction('Удалить кабель?',byId(model.cables,cid).name,'Удалить',()=>change(m=>m.cables=m.cables.filter(c=>c.id!==cid)));},
  addWireTo:el=>wireForm(byId(model.links,el.dataset.id)),
  editWire:el=>{const r=rawWire(el.dataset.id);wireForm(r.link,r.wire);},
  removeWire:()=>{const wid=$('#form').dataset.wire,r=rawWire(wid);confirmAction('Удалить провод?',r.wire.name+' · функциональная связь сохранится.','Удалить',()=>change(m=>{const l=byId(m.links,r.link.id);l.wires=l.wires.filter(w=>w.id!==wid);}));},
  boardFocus:()=>{boardFocus=!boardFocus;selectedWire='';render();},
  boardScale:()=>{boardScale=boardScale==='fit'?'actual':'fit';render();},
  boardMode:el=>{routeEdit=null;clearPin();boardMode=el.dataset.key;render();},
  stockMode:el=>{inventoryMode=el.dataset.key;render();},
  mapMode:el=>{overviewMode=el.dataset.key;chosenBundle='';overviewSelection='';render();},
  openMapBoard:el=>{boardId=el.dataset.id;nav('board');},
  wireOptions:el=>wireMenu(rawWire(el.dataset.id)),
  clearWire:()=>{selectedWire='';routeEdit=null;render();},
  wireColor:el=>{
    const ref=rawWire(selectedWire),color=el.dataset.color;
    if(!ref||!validWireColor(ref.wire.role,color)||color===ref.wire.color)return;
    change(m=>byId(byId(m.links,ref.link.id).wires,ref.wire.id).color=color);
    if($('#dialog').open)wireMenu(rawWire(selectedWire));
  },
  startRoute:el=>{const r=rawWire(el.dataset.id);routeEdit={id:r.wire.id,points:clone(boardRoute(r.wire,boardId))};closeDialog();render();},
  resetRoute:el=>{const r=rawWire(el.dataset.id);change(m=>{const w=byId(byId(m.links,r.link.id).wires,r.wire.id);if(w.routes)delete w.routes[boardId];});closeDialog();},
  saveRoute:()=>{const draft=routeEdit;routeEdit=null;storeBoardRoute(draft.id,draft.points);},
  cancelRoute:()=>{routeEdit=null;render();},popBend:()=>{routeEdit.points.pop();render();},
  designCircuit:el=>circuitForm(findStock(model,el.dataset.id)),openCalc:()=>nav('calc'),
  nodeProperties:el=>{selected=el.dataset.id;nodeForm(true);},
  powerPick:()=>modal('Электрические данные устройств','<div class="bundlelist">'+model.nodes.map(n=>act('nodeProperties',n.tag+' · '+n.name,'chip','',extraAttr('id',n.id))).join('')+'</div>')
});
