let netMode='columns', diagramScene=null, diagramDrag=null, freeEdge='';
const planInks=['#22738c','#ab6026','#7563aa','#2d8262','#b44c65','#4874ae','#95802c','#966095','#317e77','#97524a'];
function planInk(i){
  if(i<planInks.length)return planInks[i];
  const hue=(i*.61803398875)%1;
  const channel=n=>{const k=(n+hue*12)%12;return Math.round((.4-.23*Math.max(-1,Math.min(k-3,9-k,1)))*255).toString(16).padStart(2,'0');};
  return '#'+channel(0)+channel(8)+channel(4);
}
function diagramSettings(view,key,m=model){return m.diagramRoutes?.find(r=>r.view===view&&r.key===key);}
function setDiagramStyle(m,view,key,patch){
  m.diagramRoutes??=[];
  const list=m.diagramRoutes;let record=diagramSettings(view,key,m);
  if(!record){record={view,key};list.push(record);}
  for(const [name,value] of Object.entries(patch)){if(value==null)delete record[name];else record[name]=value;}
  if(!record.color&&!record.points)list.splice(list.indexOf(record),1);
  if(!list.length)delete m.diagramRoutes;
}
function placeDiagramCards(cards){
  // Current and imported drawings may contain overlapping positions. Give each
  // saved position priority over defaults and find clear space for any conflict.
  const occupied=[];
  for(const box of [...cards].sort((a,b)=>Number(b.saved)-Number(a.saved))){
    box.x=Math.max(25,box.x);box.y=Math.max(25,box.y);
    const origin={x:box.x,y:box.y};let i=0;
    while(occupied.some(other=>overlapCard(box,other,24))){
      i++;box.x=origin.x+(i%4)*(box.w+50);box.y=origin.y+Math.floor(i/4)*(box.h+60);
    }
    occupied.push(box);
  }
}
function planScene(data,preview){
  const boxes=[...data.groups.values()].map(g=>({...g,w:174,h:62,saved:!!g.record.xy}));
  if(preview)Object.assign(boxes.find(b=>b.id===preview.id),preview,{saved:true});
  placeDiagramCards(boxes);
  const byBox=new Map(boxes.map(b=>[b.id,b])),ports=new Map();
  const edges=[...data.bundles].sort(([a],[b])=>a.localeCompare(b)).map(([key,bundle],i)=>{
    // Use canonical endpoint order so reversing a functional link does not reverse a saved polyline.
    const [a,b]=JSON.parse(key).map(id=>byBox.get(id));
    const edge={key,bundle,a,b,color:planInk(i),label:bundle.cables.size+' К / '+bundle.loose+' П'+(bundle.unknown?' / '+bundle.unknown+' ?':''),title:a.title+' ↔ '+b.title};
    for(const [box,other,end] of [[a,b,'start'],[b,a,'end']]){
      const dx=other.x-box.x,dy=other.y-box.y;
      const side=Math.abs(dx)/box.w>Math.abs(dy)/box.h?(dx>0?'right':'left'):(dy>0?'bottom':'top');
      const id=JSON.stringify([box.id,side]);if(!ports.has(id))ports.set(id,[]);
      ports.get(id).push({edge,end,box,side,other});
    }
    return edge;
  });
  for(const group of ports.values()){
    const sx=group[0].side==='right'?1:group[0].side==='left'?-1:0,sy=group[0].side==='bottom'?1:group[0].side==='top'?-1:0;
    group.sort((a,b)=>sx?a.other.y-b.other.y:a.other.x-b.other.x);
    group.forEach(({box,edge,end},i)=>{
      const t=(i+1)/(group.length+1);
      edge[end]={x:box.x+box.w*(sx?(sx+1)/2:t),y:box.y+box.h*(sy?(sy+1)/2:t),dx:sx,dy:sy};
    });
  }
  return {view:overviewMode,boxes,edges,preview:p=>planScene(data,p)};
}
function freeScene(nodes,links,preview){
  const grid=new Map(model.nodes.map((n,i)=>[n.id,i])),cols=Math.max(2,Math.min(6,Math.ceil(Math.sqrt(model.nodes.length))));
  const all=model.nodes.map(n=>{
    const i=grid.get(n.id),w=Math.max(148,Math.min(220,Object.keys(nodePorts(n)).length*16));
    return {id:n.id,n,w,h:54,x:n.freeXY?.x??44+i%cols*218,y:n.freeXY?.y??52+Math.floor(i/cols)*122,saved:!!n.freeXY};
  });
  if(preview)Object.assign(all.find(b=>b.id===preview.id),preview,{saved:true});
  placeDiagramCards(all);
  const visible=new Set(nodes.map(n=>n.id)),boxes=all.filter(b=>visible.has(b.id)).map(b=>({...b,...nodeBox(b.n,b.x,b.y,b.w,b.h)}));
  const byBox=new Map(boxes.map(b=>[b.id,b])),edges=[];
  for(const l of links){
    const a=byBox.get(l.from.node),b=byBox.get(l.to.node);if(!a||!b)continue;
    const lead=(box,end)=>{const pin=box.pins.get(end.port);return {x:pin.x,y:pin.y,dx:0,dy:pin.side};};
    for(const wire of l.wires.length?l.wires:[null]){
      const key=(wire?'w:':'l:')+(wire?.id||l.id);
      edges.push({key,a,b,l,wire,start:lead(a,l.from),end:lead(b,l.to),color:wire?coreColors[wire.color][1]:'#82928a',
        title:(wire?wire.name:'Функциональная связь')+' · '+a.n.tag+' → '+b.n.tag});
    }
  }
  return {view:'free',boxes,edges,all,preview:p=>freeScene(nodes,links,p)};
}
function edgeCaption(edge,scene,occupied){
  const candidates=[];
  for(let i=1;i<edge.path.length;i++){
    const a=edge.path[i-1],b=edge.path[i],len=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
    for(const fraction of [.5,.32,.68]){
      const x=a.x+(b.x-a.x)*fraction,y=a.y+(b.y-a.y)*fraction;
      const r={x:x-38,y:y-9,w:76,h:18};
      if(!scene.boxes.some(box=>overlapCard(r,box,2))&&!occupied.some(box=>overlapCard(r,box,3)))
        candidates.push({x,y,r,score:len+(a.y===b.y?32:0)-Math.abs(.5-fraction)*30});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length)return '';
  const {x,y,r}=candidates[0];occupied.push(r);
  return '<g class="routecaption"><rect x="'+r.x+'" y="'+r.y+'" width="76" height="18" rx="5"/>'+svgText(x,y+3,edge.label,'slotlabel','text-anchor="middle"')+'</g>';
}
function pathMarkup(edge,scene,occupied){
  const plan=scene.view!=='free',selected=edge.key===(plan?chosenBundle:freeEdge);
  const attr=(plan?'data-bundle':'data-free-edge')+'="'+esc(edge.key)+'"';
  if(!edge.path.length)return '';
  const d=linePath(edge.path),ink=edge.ink,striped=!plan&&edge.wire?.role==='PE';
  const width=plan?Math.min(6,2.5+Math.log2(1+edge.bundle.links.size)):2.5;
  const segments=edge.path.slice(1).map((p,i)=>'<path data-segment="'+i+'" class="seghit '+(p.x===edge.path[i].x?'vertical':'horizontal')+'" d="'+linePath([edge.path[i],p])+'"/>').join('');
  return '<g '+attr+' class="routeedge '+(plan?'bundleedge ':'')+(selected?'routechosen':'')+'" tabindex="0" role="button" aria-label="'+esc(edge.title)+'"><title>'+esc(edge.title)+'</title>'+
    (selected?'<path class="routehalo" d="'+d+'"/>':'')+
    '<path class="routeink" d="'+d+'" stroke="'+ink+'" stroke-width="'+width+'" '+(!plan&&!edge.wire?'stroke-dasharray="4 4"':'')+'/>'+
    (striped?'<path d="'+d+'" class="routeink" stroke="#edd84c" stroke-width="1.7" stroke-dasharray="6 4"/>':'')+
    segments+(plan?edgeCaption(edge,scene,occupied):'')+'</g>';
}
function planCard(g){
  return '<g data-mapid="'+esc(g.id)+'" class="mapcard" tabindex="0" role="button" aria-label="'+esc(g.title)+'"><rect x="'+g.x+'" y="'+g.y+'" width="'+g.w+'" height="'+g.h+'" rx="8" fill="'+(overviewSelection===g.id?'#fff0db':'#fff')+'" stroke="#879d91"/>'+svgText(g.x+12,g.y+17,g.type.toUpperCase(),'slotlabel')+svgText(g.x+12,g.y+36,clipped(g.title,24),'drawtag')+svgText(g.x+12,g.y+51,amount(g.count,'устройство','устройства','устройств'),'slotlabel')+'</g>';
}
function diagramSvg(scene){
  const plan=scene.view!=='free',labels=[],settings=new Map((model.diagramRoutes||[]).filter(r=>r.view===scene.view).map(r=>[r.key,r]));
  let width=760,height=plan?400:320;
  for(const b of scene.boxes){width=Math.max(width,b.x+b.w+65);height=Math.max(height,b.y+b.h+65);}
  scene.edges.forEach((edge,i)=>{
    const record=settings.get(edge.key);
    edge.path=orthogonalRoute(edge.start,edge.end,scene.boxes,record?.points,i);
    edge.ink=record?.color||edge.color;
    for(const p of edge.path){width=Math.max(width,p.x+35);height=Math.max(height,p.y+35);}
  });
  const chosen=plan?chosenBundle:freeEdge;
  const sorted=[...scene.edges].sort((a,b)=>Number(a.key===chosen)-Number(b.key===chosen));
  const edges=sorted.map(edge=>pathMarkup(edge,scene,labels)).join('');
  const cards=scene.boxes.map(b=>plan?planCard(b):drawBox(b,false)).join('');
  const pins=plan?'':scene.boxes.map(drawPins).join('');
  diagramScene=scene;
  return '<svg class="orthoSvg '+(plan?'mapsvg':'wiringsvg')+'" viewBox="0 0 '+width+' '+height+'" width="'+width*(plan?1:zoom)+'" height="'+height*(plan?1:zoom)+'" aria-label="'+(plan?'План объектов':'Свободная сеть связей')+'">'+edges+cards+pins+'</svg>';
}
function routeTools(view,edge){
  const saved=diagramSettings(view,edge.key);
  return '<div class="diagramtools"><span>Прокладка · '+(saved?.points?'ручная':'автоматическая')+'</span>'+act('diagramAuto','Автопрокладка','net','',saved?.points?'':'disabled')+
    (view==='free'?'':'<label>Цвет группы <input type="color" id="groupcolor" value="'+(saved?.color||edge.color)+'"></label>'+act('diagramAutoColor','Автоцвет','','',saved?.color?'':'disabled'))+'</div>';
}
function activeDiagramEdge(){return diagramScene?.edges.find(e=>e.key===(diagramScene.view==='free'?freeEdge:chosenBundle));}
function changeRouteStyle(patch){
  const edge=activeDiagramEdge();if(edge)change(m=>setDiagramStyle(m,diagramScene.view,edge.key,patch));
}
document.addEventListener('change',e=>{if(e.target.id==='groupcolor')changeRouteStyle({color:e.target.value});});
Object.assign(actions,{
  diagramAuto:()=>changeRouteStyle({points:null}),diagramAutoColor:()=>changeRouteStyle({color:null}),
  networkMode:el=>{clearPin();netMode=el.dataset.key;freeEdge='';selectedWire='';trace=false;render();},
  selectFree:el=>selectDiagramEdge(el.dataset.id)
});
function selectDiagramEdge(key){
  const edge=diagramScene?.edges.find(e=>e.key===key);if(!edge)return;
  if(diagramScene.view==='free'){freeEdge=key;selectedWire=edge.wire?.id||'';}
  else{chosenBundle=key;overviewSelection='';}
  render();
}
function endDiagramDrag(commit){
  const g=diagramDrag;if(!g)return;
  diagramDrag=null;
  if(g.svg.hasPointerCapture(g.pointer))g.svg.releasePointerCapture(g.pointer);
  if(!commit){render();return;}
  if(g.edge){
    if(g.scene.view==='free'){freeEdge=g.edge.key;selectedWire=g.edge.wire?.id||'';}
    else{chosenBundle=g.edge.key;overviewSelection='';}
    if(g.points)change(m=>setDiagramStyle(m,g.scene.view,g.edge.key,{points:g.points}));
    else render();
  }else{
    const free=g.scene.view==='free';
    if(free){freeEdge='';selectedWire='';selected=g.card.id;}
    else{chosenBundle='';overviewSelection=g.card.id;}
    if(g.position)change(m=>{
      const owner=free?byId(m.nodes,g.card.id):[...m.areas,...m.boards,...m.nodes].find(o=>o.id===g.card.record.id);
      owner[free?'freeXY':'xy']=g.position;
    });else render();
  }
}
function closestDiagramSegment(path,p){
  let best=Infinity,index=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    const x=Math.max(Math.min(a.x,b.x),Math.min(Math.max(a.x,b.x),p.x));
    const y=Math.max(Math.min(a.y,b.y),Math.min(Math.max(a.y,b.y),p.y));
    const d=Math.hypot(p.x-x,p.y-y);if(d<best){best=d;index=i-1;}
  }
  return index;
}
document.addEventListener('pointerdown',e=>{
  const svg=e.target.closest('.orthoSvg');if(!svg||e.button!==0||diagramDrag||e.target.closest('[data-pin]'))return;
  const line=e.target.closest('.routeedge'),cardEl=e.target.closest('[data-mapid],[data-node]');
  if(!line&&!cardEl)return;
  const scene=diagramScene,start=svgPoint(svg,e),g={scene,svg,start,pointer:e.pointerId};
  if(line){
    const group=line;
    g.edge=scene.edges.find(edge=>edge.key===(group.dataset.bundle||group.dataset.freeEdge));
    const hit=e.target.closest('[data-segment]');
    g.index=hit?Number(hit.dataset.segment):closestDiagramSegment(g.edge.path,start);g.group=group;
  }else{g.card=scene.boxes.find(box=>box.id===(cardEl.dataset.mapid||cardEl.dataset.node));g.el=cardEl;}
  diagramDrag=g;svg.setPointerCapture(e.pointerId);e.preventDefault();
});
document.addEventListener('pointermove',e=>{
  const g=diagramDrag;if(!g||g.pointer!==e.pointerId)return;
  const p=svgPoint(g.svg,e),dx=Math.round(p.x-g.start.x),dy=Math.round(p.y-g.start.y);
  if(!g.moved&&Math.hypot(dx,dy)<3)return;
  g.moved=true;
  if(g.edge){
    const a=g.edge.path[g.index],b=g.edge.path[g.index+1];
    const path=slideSegment(g.edge.path,g.index,a.y===b.y?dy:dx,g.scene.boxes);
    if(path){g.points=path;g.group.querySelectorAll('.routeink,.routehalo').forEach(el=>el.setAttribute('d',linePath(path)));
      g.group.querySelector('.routecaption')?.setAttribute('visibility','hidden');}
  }else{
    const c=g.card,pos={x:Math.max(25,Math.min(50000,c.x+dx)),y:Math.max(25,Math.min(50000,c.y+dy))};
    if((g.scene.all||g.scene.boxes).some(b=>b.id!==c.id&&overlapCard({...c,...pos},b,24)))return;
    g.position=pos;
    if(!g.frame)g.frame=requestAnimationFrame(()=>{
      g.frame=0;if(diagramDrag!==g)return;
      const updated=g.scene.preview({id:c.id,...g.position});
      const wrapper=document.createElementNS('http://www.w3.org/2000/svg','g');
      wrapper.innerHTML=diagramSvg(updated).replace(/^<svg[^>]*>|<\/svg>$/g,'');
      g.svg.replaceChildren(wrapper);
    });
  }
});
document.addEventListener('pointerup',e=>{if(diagramDrag?.pointer===e.pointerId)endDiagramDrag(true);});
document.addEventListener('pointercancel',e=>{if(diagramDrag?.pointer===e.pointerId)endDiagramDrag(false);});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&diagramDrag){endDiagramDrag(false);return;}
  const edge=e.target.closest('.routeedge');
  if(edge&&['Enter',' '].includes(e.key)){e.preventDefault();selectDiagramEdge(edge.dataset.bundle||edge.dataset.freeEdge);}
});
document.addEventListener('click',e=>{
  const edge=e.target.closest('.routeedge');
  if(edge)selectDiagramEdge(edge.dataset.bundle||edge.dataset.freeEdge);
});
