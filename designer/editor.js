'use strict';
const glyphs={
  bolt:'m13 2-9 12h7l-1 8 10-13h-8z',folder:'M3 7V5h6l2 2h10v12H3z',down:'m6 9 6 6 6-6',download:'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',menu:'M3 6h18M3 12h18M3 18h18',
  box:'M4 3h16v18H4zM7 8h10M7 14h10M9 6v4m5-4v4m-5 2v4m5-4v4',net:'M9 3h6v5H9zM2 16h6v5H2zM16 16h6v5h-6zM12 8v4M5 16v-4h14v4',list:'M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1',plus:'M12 5v14M5 12h14',house:'m2 11 10-8 10 8M5 10v11h14V10M9 21v-7h6v7',pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',arrow:'m9 5 7 7-7 7',undo:'m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12',redo:'m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',edit:'m4 16 12-12 4 4L8 20l-5 1zM13 7l4 4',
  rail:'M3 5h18M3 19h18M6 3v18m12-18v18M10 9h4v6h-4z',sliders:'M3 6h5m4 0h9M3 12h10m4 0h4M3 18h3m4 0h11M8 3v6m5 0v6M6 15v6',chip:'M6 5h12v14H6zM9 2v3m6-3v3M9 19v3m6-3v3M3 8h3m-3 8h3m12-8h3m-3 8h3',link:'m10 14 4-4m-6 2-2 2a3 3 0 0 0 4 5l4-4m-4-6 4-4a3 3 0 0 1 5 4l-2 2',x:'m6 6 12 12M18 6 6 18',upload:'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',file:'M5 3h9l5 5v13H5zM14 3v6h5',settings:'M4 7h16M4 17h16M8 4v6m8 4v6',info:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11v6m0-10v.1'
};
const icon = k => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+glyphs[k]+'"/></svg>';
const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);
const act = (key,label,ico='',cls='',extra='') => '<button type="button" class="'+cls+'" data-act="'+key+'" '+extra+'>'+(ico?icon(ico):'')+esc(label)+'</button>';
const iconbtn = (key,label,k,extra='') => act(key,'',k,'iconbtn','title="'+label+'" aria-label="'+label+'" '+extra);
const opt = (v,label,selected) => '<option value="'+esc(v)+'"'+(v===selected?' selected':'')+'>'+esc(label)+'</option>';
const empty = (text,btn='') => '<div class="empty">'+esc(text)+(btn?'<div>'+btn+'</div>':'')+'</div>';
const extraAttr = (name,value) => 'data-'+name+'="'+esc(value)+'"';
let model, page='board', boardId='', selected='', focusLink='', networkBoard='*', networkMedium='*', zoom=1, trace=false;
let past=[], future=[], storageKey='', diskValue=null, persistState='', onSubmit=null, timer;
const pristine='<!doctype html>\n'+document.documentElement.outerHTML;
function board(id=boardId){return model.boards.find(b=>b.id===id);}
function node(id=selected){return model.nodes.find(n=>n.id===id);}
function occupants(b){return model.nodes.filter(n=>n.place?.board===b.id).sort((a,z)=>a.place.row-z.place.row || a.place.slot-z.place.slot);}
function incident(n){return model.links.filter(l=>l.from.node===n.id || l.to.node===n.id);}
function portName(end){return nodePorts(node(end.node))[end.port].label;}
function medium(l){return nodePorts(node(l.from.node))[l.from.port].medium;}
function message(t){$('#toast').textContent=t;clearTimeout(timer);timer=setTimeout(()=>$('#toast').textContent='',4600);}
function normalizeUI(){
  if(!board())boardId=model.boards[0]?.id||'';
  if(!node() || (page==='board' && node().place?.board!==boardId))selected=(page==='board' && board()?occupants(board())[0]?.id:'')||'';
  if(!model.links.some(l=>l.id===focusLink))focusLink='';
  if(networkBoard!=='*' && networkBoard!=='!outside' && !board(networkBoard))networkBoard='*';
}
function persist(){
  if(portable){persistState='Изменения в памяти';return;}
  try{if(localStorage.getItem(storageKey)!==diskValue)throw Error('Другая вкладка изменила проект. Скачайте свою версию.');
    const data=JSON.stringify(model);localStorage.setItem(storageKey,data);diskValue=data;persistState='Сохранено локально';
  }catch(e){persistState=e.message.includes('вкладка')?'Конфликт вкладок':'Только в памяти';message(e.message.includes('вкладка')?e.message:'Автосохранение недоступно. Скачайте проект.');}
}
function change(fn, base=model){
  const next=clone(base);fn(next);checkModel(next);
  past.push(model);if(past.length>60)past.shift();future=[];model=next;persist();normalizeUI();render();
}
function undo(redo=false){const from=redo?future:past,to=redo?past:future;if(!from.length)return;to.push(model);model=from.pop();persist();normalizeUI();render();}
function nav(next){routeEdit=null;clearPin();page=next;focusLink='';trace=false;document.body.classList.remove('menu');normalizeUI();render();}
function side(){
  let boards=model.boards.map(b=>'<button class="boardnav '+(page==='board'&&b.id===boardId?'on':'')+'" data-board="'+esc(b.id)+'">'+icon('box')+'<span>'+esc(b.name)+'<small>'+esc(b.tag)+'</small></span></button>').join('');
  return '<div class="sideheading">Проект</div>'+act('projectTitle',model.title,'house','projectcard')+
   '<div class="sideheading">Рабочая область</div>'+[['overview','План объектов','house'],['board','Конструктор щита','rail'],['network','Сеть дома','net'],['calc','Расчёты','bolt'],['inventory','Ведомость','list']].map(([key,title,k])=>act('nav',title,k,'navbtn '+(page===key?'on':''),extraAttr('page',key))).join('')+
   '<div class="sideblock"><div class="sideheading">Щиты проекта '+act('addBoard','','plus','sideadd','aria-label="Добавить щит" title="Добавить щит"')+'</div>'+boards+'</div><div class="sidefoot">'+act('about','О модели','info')+'</div>';
}
function crumb(t){return '<div class="crumb">'+icon('house')+'<span>Проект</span>'+icon('arrow')+esc(t)+'<div class="right">'+iconbtn('undo','Отменить','undo',past.length?'':'disabled')+iconbtn('redo','Повторить','redo',future.length?'':'disabled')+'</div></div>';}
function heading(k,title,meta,actions){return '<div class="heading"><div><div class="kicker">'+esc(k)+'</div><h1>'+esc(title)+'</h1><div class="meta">'+meta+'</div></div><div class="actions">'+actions+'</div></div>';}
function cabinet(b,ns){
  let rows='';
  for(let r=1;r<=b.rows;r++){
    const devices=ns.filter(n=>n.place.row===r),used=devices.reduce((s,n)=>s+n.width,0);
    let nums='',cells='';
    for(let s=1;s<=b.slots;s++){
      nums+='<span>'+String(s).padStart(2,'0')+'</span>';
      if(!devices.some(n=>s>=n.place.slot&&s<n.place.slot+n.width)) cells+='<button class="emptycell" data-slot="'+s+'" data-row="'+r+'" style="grid-column:'+s+'" title="Добавить в позицию '+s+'" aria-label="Рейка '+r+', добавить в позицию '+s+'"></button>';
    }
    for(const n of devices){
      const k=kinds[n.kind],screws='<div class="termrow">'+'<i class="terminal"></i>'.repeat(Math.min(n.width,5))+'</div>';
      cells+='<button draggable="true" class="device tone-'+k[3]+(selected===n.id?' selected':'')+'" data-node="'+esc(n.id)+'" data-kind="'+n.kind+'" style="grid-column:'+n.place.slot+' / span '+n.width+'" title="'+esc(n.tag+' · '+n.name)+'" aria-label="'+esc(n.tag+' · '+n.name)+'" aria-pressed="'+(n.id===selected)+'">'+screws+'<span class="face"><b>'+esc(n.tag)+'</b><small>'+esc(n.rating||k[1])+'</small></span><i class="toggle"></i>'+screws+'</button>';
    }
    rows+='<div class="railblock"><div class="railcap"><b>DIN '+String(r).padStart(2,'0')+'</b><span>'+used+' / '+b.slots+' M</span></div><div class="railscroll"><div class="slotnums">'+nums+'</div><div class="rail"><div class="dinbar"></div>'+cells+'</div></div></div>';
  }
  return '<div class="paper"><div class="cabinet" style="--slots:'+b.slots+';--pitch:clamp(30px,3.25vw,53px)">'+['tl','tr','bl','br'].map(c=>'<i class="corner '+c+'"></i>').join('')+rows+'</div></div>';
}
function legend(){return '<div class="legend"><span class="tone-blue">Автомат</span><span class="tone-green">Дифзащита</span><span class="tone-orange">АВР / DC</span><span class="tone-violet">Автоматика</span></div>';}
function inspector(n){
  const top='<div class="panelhead"><h2>'+icon('sliders')+'Инспектор</h2></div>';
  if(!n)return '<aside class="panel inspector">'+top+empty('Выберите устройство.')+'</aside>';
  const k=kinds[n.kind],p=n.place,links=incident(n);
  const props=[...(n.power?[['Расчётный ток',numberText(loadCurrent(n.power))+' А']]:[]),['Маркировка',n.rating||'—'],['Размещение',p?board(p.board).tag:(n.location||'Вне щита')],...(p?[['Рейка / место',p.row+' / '+p.slot],['Ширина',n.width+' М']]:[]),['Связей',links.length]];
  return '<aside class="panel inspector">'+top+'<div class="identity"><span class="idicon">'+icon('chip')+'</span><div><b>'+esc(n.tag)+'</b><small>'+esc(k[0])+'</small></div></div>'+(n.name!==k[0]?'<p class="insname">'+esc(n.name)+'</p>':'')+'<dl class="props">'+props.map(([a,b])=>'<dt>'+a+'</dt><dd>'+esc(b)+'</dd>').join('')+'</dl><div class="insbuttons">'+act('editNode','Свойства','edit')+act('addLink','Соединить','link')+'</div><div class="related"><div class="eyebrow">Смежные устройства</div>'+links.slice(0,3).map(l=>{const other=node(l.from.node===n.id?l.to.node:l.from.node);return act('inspectRelated',other.tag+' · '+other.name,'link','linkchip',extraAttr('target',other.id));}).join('')+(links.length>3?act('showNet','Все связи ('+links.length+')','net','linkchip'):'')+(!links.length?'<p>Связей пока нет.</p>':'')+'</div></aside>';
}
function table(ns,all=false){return '<div class="scroll"><table class="data"><thead><tr><th>Код</th><th>Устройство</th><th>Тип</th><th>'+(all?'Размещение':'DIN / место')+'</th><th>Ширина</th></tr></thead><tbody>'+ns.map(n=>{const k=kinds[n.kind],p=n.place;return '<tr data-node="'+esc(n.id)+'" class="'+(n.id===selected?'selected':'')+'"><td><button class="tablebtn tag swatch tone-'+k[3]+'" data-node="'+esc(n.id)+'">'+esc(n.tag)+'</button></td><td>'+esc(n.name)+'</td><td>'+esc(k[0])+'</td><td class="unit">'+(p?(all?esc(board(p.board).tag)+' · ':'')+p.row+' / '+p.slot:esc(n.location||'Вне щита'))+'</td><td class="unit">'+(n.width?n.width+' М':'—')+'</td></tr>';}).join('')+'</tbody></table></div>';}
function boardPage(){
  const b=board();if(!b)return crumb('Конструктор щита')+heading('Компоновка','Щиты проекта','Добавьте первый щит и задайте размеры реек.',act('addBoard','Добавить щит','plus','primary'));
  const ns=occupants(b),total=b.rows*b.slots,used=ns.reduce((v,n)=>v+n.width,0);
  return crumb('Конструктор щита')+heading(b.tag,b.name,icon('pin')+esc(b.location||'Место не указано')+' <b>·</b> '+b.rows+' × '+b.slots+' мод. <b>·</b> Свободно '+(total-used)+' М',act('editBoard','Щит','settings')+act('addNode','Устройство','plus','primary'))+
    tabs([['wiring','Проводка'],['placement','Перестановка аппаратов']],boardMode,'boardMode')+'<div class="workspace"><section class="panel"><div class="panelhead"><h2>'+icon('rail')+(boardMode==='wiring'?'Проводка щита':'Компоновка щита')+'</h2><div class="capacity"><i style="--fill:'+used/total*100+'%"></i>'+used+' / '+total+' М</div></div>'+(boardMode==='wiring'?wireDrawing(ns,model.links.filter(l=>node(l.from.node).place?.board===b.id||node(l.to.node).place?.board===b.id),b)+routeControls()+panelWireList(b):cabinet(b,ns)+legend())+'</section>'+inspector(node())+'</div><section class="panel tablepanel"><div class="panelhead"><h2>Устройства щита <span class="count">'+ns.length+'</span></h2></div>'+(ns.length?table(ns):empty('Добавьте устройство в свободную позицию.'))+'</section>';
}
function render(){
  const previous=$('.netcanvas,.boarddrawing,.mapscroll');
  const position=previous?[previous.scrollLeft,previous.scrollTop]:[0,0];
  $('#side').innerHTML=side();$('#main').innerHTML=page==='board'?boardPage():page==='network'?networkPage():page==='overview'?overviewPage():page==='calc'?calculationPage():inventoryPage();
  const canvas=$('.netcanvas,.boarddrawing,.mapscroll');if(canvas)canvas.scrollTo(...position);
  $('#savestate').textContent=persistState;$('#savestate').className=['Только в памяти','Конфликт вкладок'].includes(persistState)?'warn':'';
}
function boardOptions(value){return opt('*','Весь проект',value)+model.boards.map(b=>opt(b.id,b.tag+' · '+b.name,value)).join('')+opt('!outside','Вне щитов',value);}
function inventoryPage(){
  const ns=model.nodes.filter(n=>networkBoard==='*'||(n.place?.board||'!outside')===networkBoard);
  return crumb('Ведомость')+heading('Оборудование','Ведомость проекта',amount(model.boards.length,'щит','щита','щитов')+' · '+projectCounts(),act('addNode','Устройство','plus','primary'))+
    tabs([['devices','Оборудование'],['wires','Провода и кабели']],inventoryMode,'stockMode')+'<div class="filters"><label>Размещение <select id="boardfilter">'+boardOptions(networkBoard)+'</select></label></div>'+(inventoryMode==='wires'?cableInventory():'<section class="panel"><div class="panelhead"><h2>Оборудование <span class="count">'+ns.length+'</span></h2></div>'+(ns.length?table(ns,true):empty('По этому фильтру устройств нет.'))+'</section>');
}
function connectedSet(start,ls){
  const visited=new Set([start]), pending=[start], neighbors=new Map();
  for(const l of ls){if(!neighbors.has(l.from.node))neighbors.set(l.from.node,[]);neighbors.get(l.from.node).push(l.to.node);}
  while(pending.length){for(const next of neighbors.get(pending.pop())||[]){if(!visited.has(next)){visited.add(next);pending.push(next);}}}
  return visited;
}
function amount(n,one,few,many){
  const mod=n%10,teen=n%100>=11 && n%100<=14;
  return n+' '+(!teen&&mod===1?one:!teen&&mod>=2&&mod<=4?few:many);
}
function projectCounts(){
  return amount(model.nodes.length,'устройство','устройства','устройств')+' · '+amount(model.links.length,'связь','связи','связей');
}
function networkPage(){
  const all=networkBoard==='*',within=n=>all||(n.place?.board||'!outside')===networkBoard;
  const ls=model.links.filter(l=>(networkMedium==='*'||medium(l)===networkMedium)&&(within(node(l.from.node))||within(node(l.to.node))));
  const linked=new Set(ls.flatMap(l=>[l.from.node,l.to.node]));
  const ns=model.nodes.filter(n=>linked.has(n.id)||(within(n)&&networkMedium==='*'));
  const rows=ls.map(l=>'<tr data-link="'+esc(l.id)+'" class="'+(l.id===focusLink?'selected':'')+'"><td><button class="tablebtn tag" data-link="'+esc(l.id)+'">'+esc(medium(l))+'</button></td><td>'+esc(node(l.from.node).tag+' · '+portName(l.from))+'</td><td>'+esc(node(l.to.node).tag+' · '+portName(l.to))+'</td><td>'+esc(l.label||'—')+'</td></tr>').join('');
  return crumb('Сеть дома')+heading('Топология','Сеть дома',projectCounts(),act('addNode','Устройство','plus')+act('addLink','Связь','link','primary'))+
  '<div class="filters"><label>Область <select id="boardfilter">'+boardOptions(networkBoard)+'</select></label><label>Линии <select id="mediumfilter">'+['*','AC','DC','CTRL','PE'].map(k=>opt(k,k==='*'?'Все типы':mediumName[k],networkMedium)).join('')+'</select></label></div>'+
  '<div class="workspace"><section class="panel"><div class="panelhead"><h2>'+icon('net')+'Схема связей</h2><div class="actions">'+act('fit','Вписать','','fit')+act('zoomOut','−','','iconbtn','aria-label="Уменьшить"')+'<span class="micro">'+Math.round(zoom*100)+'%</span>'+act('zoomIn','+','','iconbtn','aria-label="Увеличить"')+'</div></div>'+wireDrawing(ns,ls)+'<div class="legend netlegend"><span class="tone-blue">AC</span><span class="tone-orange">DC</span><span class="tone-violet">Управление</span>'+act('trace',trace?'Снять подсветку':'Пути от устройства','net','',node()?'':'disabled')+'</div></section>'+inspector(node())+'</div>'+
  '<section class="panel tablepanel"><div class="panelhead"><h2>Соединения <span class="count">'+ls.length+'</span></h2></div>'+(ls.length?'<div class="scroll"><table class="data"><thead><tr><th>Тип</th><th>Откуда</th><th>Куда</th><th>Кабель / метка</th></tr></thead><tbody>'+rows+'</tbody></table></div>':empty('Связей в этой области пока нет.'))+'</section>';
}
let dialogLifetime=new AbortController();
function modal(title,body,footer='',submit=null){
  dialogLifetime.abort();dialogLifetime=new AbortController();
  const d=$('#dialog');onSubmit=submit;$('#form').innerHTML='<div class="dialoghead"><h2>'+esc(title)+'</h2>'+iconbtn('close','Закрыть','x')+'</div><div class="dialogbody">'+body+'</div><div class="formerror" role="alert"></div>'+(footer?'<div class="dialogfoot">'+footer+'</div>':'');
  if(!d.open)d.showModal();
}
const closeDialog=()=>$('#dialog').close();
const commitButtons=(text='Применить',remove='')=>(remove?act(remove,'Удалить','','danger'):'')+act('close','Отмена')+'<button type="submit" class="primary">'+esc(text)+'</button>';
const field = (title,formControl,wide=false)=>'<label class="field '+(wide?'wide':'')+'">'+title+formControl+'</label>';
const textInput=(name,value,max=160,required=true)=>'<input name="'+name+'" value="'+esc(value)+'" maxlength="'+max+'" '+(required?'required':'')+'>';
const numberInput=(name,value,min,max)=>'<input name="'+name+'" type="number" value="'+value+'" min="'+min+'" max="'+max+'" step="1" required>';
const select=(name,opts)=>'<select name="'+name+'">'+opts+'</select>';
const val=k=>$('#form').elements.namedItem(k).value;
function confirmAction(title,explain,accept,callback){
  modal(title,'<p>'+esc(explain)+'</p>',commitButtons(accept),()=>{callback();closeDialog();});
}
function boardForm(edit=false){
  const b=edit?board():{id:id(),tag:'ЩР-'+String(model.boards.length+1).padStart(2,'0'),name:'Новый щит',location:'',rows:2,slots:12};
  modal(edit?'Свойства щита':'Добавить щит','<div class="fields">'+field('Название',textInput('name',b.name),true)+field('Обозначение',textInput('tag',b.tag,32))+field('Расположение',textInput('location',b.location,500,false))+areaField(b.area)+field('DIN-реек',numberInput('rows',b.rows,1,12))+field('Мест на рейке',numberInput('slots',b.slots,1,48))+'</div>',commitButtons(edit?'Применить':'Добавить щит',edit?'deleteBoard':''),()=>{
    const updated={...b,area:val('area'),name:val('name').trim(),tag:val('tag').trim(),location:val('location').trim(),rows:+val('rows'),slots:+val('slots')};
    change(m=>{if(edit)Object.assign(m.boards.find(x=>x.id===b.id),updated);else m.boards.push(updated);});
    boardId=b.id;nav('board');closeDialog();
  });
}
function nextTag(kind){const prefix=kinds[kind][1];let i=1;const tags=new Set(model.nodes.map(n=>n.tag));while(tags.has(prefix+i))i++;return prefix+i;}
function portRow(key='',p={label:'',medium:'AC',dir:'in'}) {
  return '<div class="portrow"><input aria-label="ID порта" placeholder="ID" required maxlength="31" value="'+esc(key)+'"><input aria-label="Название порта" placeholder="Название" required maxlength="60" value="'+esc(p.label)+'"><select aria-label="Среда порта">'+Object.keys(mediumName).map(k=>opt(k,k,p.medium)).join('')+'</select><select aria-label="Направление порта">'+[['in','Вход'],['out','Выход'],['both','Оба']].map(([k,t])=>opt(k,t,p.dir)).join('')+'</select>'+iconbtn('removePort','Убрать порт','x')+'</div>';
}
function nodeForm(edit=false,at=null){
  const n=edit?node():null, initialKind=n?.kind||(page==='board'?'breaker':'load');
  const initialBoard=n?(n.place?.board||''):(page==='board'?boardId:'');
  let p=at||n?.place||(initialBoard?vacancy(model,board(initialBoard),kinds[initialKind][2]):null);
  modal(edit?'Свойства устройства':'Добавить устройство','<div class="fields">'+
    field('Тип',select('kind',Object.entries(kinds).map(([code,k])=>opt(code,k[0],initialKind)).join('')),true)+field('Обозначение',textInput('tag',n?.tag||nextTag(initialKind),32))+field('Маркировка',textInput('rating',n?.rating||'',80,false))+
    field('Название',textInput('name',n?.name||kinds[initialKind][0]),true)+field('Размещение',select('board',opt('','Вне щита',initialBoard)+model.boards.map(b=>opt(b.id,b.tag+' · '+b.name,initialBoard)).join('')),true)+
    field('Ширина, модулей',numberInput('width',n?.width??kinds[initialKind][2],0,48))+field('DIN-рейка',numberInput('row',p?.row||1,1,12))+field('Первое место',numberInput('slot',p?.slot||1,1,48))+
    field('Место в доме',textInput('location',n?.location||'',500,false),true)+areaField(n?.area)+powerFields(n)+
    '<fieldset class="customports wide"><legend>Порты устройства</legend><div class="portlist">'+Object.entries(n?.kind==='custom'?n.ports:kinds.custom[4]).map(([k,p])=>portRow(k,p)).join('')+'</div>'+act('addPort','Порт','plus')+'</fieldset>'+
    field('Примечание', '<textarea name="note" maxlength="500" rows="2">'+esc(n?.note||'')+'</textarea>',true)+'</div>',commitButtons(edit?'Применить':'Добавить',edit?'deleteNode':''),()=>{
      const boardVal=val('board'), rec={id:n?.id||id(),kind:val('kind'),tag:val('tag').trim(),name:val('name').trim(),rating:val('rating').trim(),note:val('note').trim(),width:+val('width'),place:boardVal?{board:boardVal,row:+val('row'),slot:+val('slot')}:null};
      rec.location=val('location').trim();rec.area=val('area');rec.power=readPower();if(n?.xy)rec.xy=n.xy;
      if(rec.kind==='custom'){
        rec.ports=Object.create(null);
        for(const row of document.querySelectorAll('.portrow')){
          const [key,label,md,dir]=row.querySelectorAll('input,select'),k=key.value.trim();
          assert(!own(rec.ports,k),'ID порта должен быть уникальным.');
          rec.ports[k]={label:label.value.trim(),medium:md.value,dir:dir.value};
        }
      }
      change(m=>{if(edit)m.nodes[m.nodes.findIndex(x=>x.id===n.id)]=rec;else m.nodes.push(rec);});
      selected=rec.id;if(page==='board'){if(rec.place)boardId=rec.place.board;else page='inventory';}normalizeUI();render();closeDialog();
    });
  const f=$('#form').elements;
  function placement(auto){
    const custom=$('.customports');custom.hidden=f.kind.value!=='custom';custom.disabled=custom.hidden;
    const b=board(f.board.value);for(const key of ['row','slot'])f[key].disabled=!b;
    f.width.min=b?1:0;if(!b)return;
    f.row.max=b.rows;f.slot.max=b.slots;
    if(+f.width.value===0)f.width.value=1;
    if(auto){const place=vacancy(model,b,+f.width.value,n?.id);f.row.value=place?.row||1;f.slot.value=place?.slot||1;}
  }
  f.kind.onchange=()=>{const k=kinds[f.kind.value];if(!edit){f.tag.value=nextTag(f.kind.value);f.name.value=k[0];}f.width.value=k[2];if(!k[2])f.board.value='';placement(!at);};
  f.board.onchange=()=>placement(true);placement(false);
}
function linkForm(existing=null){
  if(model.nodes.length<2){message('Для связи нужны два устройства.');return;}
  const orig=existing, candidates=(dir,md=null,exclude='')=>model.nodes.flatMap(n=>Object.entries(nodePorts(n)).filter(([key,p])=>n.id!==exclude&&(p.dir===dir||p.dir==='both')&&(!md||p.medium===md)).map(([key,p])=>({node:n.id,port:key,medium:p.medium,title:n.tag+' · '+n.name+' / '+p.label+' ('+p.medium+')'})));
  const rep=e=>e.node+':'+e.port, origins=candidates('out');
  const prefer=orig?.from||origins.find(e=>e.node===selected)||origins.find(e=>candidates('in',e.medium,e.node).some(t=>t.node===selected))||origins[0];
  if(!prefer){message('У устройств пока нет выходных портов.');return;}
  modal(orig?'Свойства связи':'Соединить устройства',field('Откуда',select('from',origins.map(e=>opt(rep(e),e.title,rep(prefer))).join('')))+field('Куда',select('to',''))+field('Кабель / метка',textInput('label',orig?.label||'',500,false))+(orig?wiresList(orig):''),commitButtons(orig?'Применить':'Создать связь',orig?'deleteLink':''),()=>{
    const parse=s=>{const [node,port]=s.split(':');return {node,port};};
    assert(val('to'),'Нет совместимого входа. Добавьте подходящее устройство.');
    const l={id:orig?.id||id(),from:parse(val('from')),to:parse(val('to')),label:val('label').trim()};
    change(m=>{if(orig){
      const same=rep(orig.from)===rep(l.from)&&rep(orig.to)===rep(l.to);
      if(!same && orig.wires.length)throw Error('Сначала перенесите или удалите физические провода этой связи.');
      Object.assign(byId(m.links,orig.id),l);
    }else m.links.push({...l,wires:[]});});closeDialog();message('Связь сохранена.');
  });
  const f=$('#form').elements;
  function destinations(){const src=origins.find(e=>rep(e)===f.from.value),dest=candidates('in',src.medium,src.node);const target=orig?.to||dest.find(e=>e.node===selected)||dest[0];
    f.to.innerHTML=dest.length?dest.map(e=>opt(rep(e),e.title,rep(target))).join(''):'<option value="">Нет совместимого входа</option>';}
  f.from.onchange=destinations;destinations();
}
function projectName(create=false){
  modal(create?'Новый проект':'Название проекта',field('Название',textInput('title',create?'Новая электросистема':model.title))+(create?'<p>Текущая рабочая копия будет заменена. Изменение можно отменить.</p>':''),commitButtons(create?'Создать':'Применить'),()=>{
    const title=val('title').trim();assert(str(title),'Введите название проекта.');
    if(create){change(()=>{},newProject(title));nav('board');}
    else change(m=>{m.title=title;});closeDialog();
  });
}
function eraseNode(){
  const n=node(),lines=incident(n).length;
  confirmAction('Удалить '+n.tag+'?',n.name+'. Будут удалены устройство и его связи ('+lines+').','Удалить',()=>change(m=>{
    for(const s of [...m.cables,...physicalRows(m).map(r=>r.wire)])if(s.design?.members.includes(n.id))s.design.members=[];
    m.nodes=m.nodes.filter(x=>x.id!==n.id);m.links=m.links.filter(l=>l.from.node!==n.id&&l.to.node!==n.id);
  }));
}
function eraseBoard(){
  const b=board(),count=occupants(b).length;
  confirmAction('Удалить '+b.tag+'?','Устройства ('+count+') перейдут в раздел «Вне щитов». Все связи оборудования сохранятся.','Удалить щит',()=>change(m=>{
    for(const {wire} of physicalRows(m))if(wire.routes)delete wire.routes[b.id];
    m.boards=m.boards.filter(x=>x.id!==b.id);for(const n of m.nodes)if(n.place?.board===b.id){n.place=null;n.area=b.area||n.area||'';}
  }));
}
function saveMenu(){
  modal('Сохранить проект','<div class="menu-actions">'+act('downloadHTML','HTML · редактор и модель','download','pale')+act('downloadJSON','JSON · только модель','file')+'</div><p>HTML открывается с диска и содержит текущий снимок. JSON можно загрузить в другую копию AES Studio.</p>');
}
function fileMenu(){
  modal('Проект','<div class="menu-actions">'+act('newProject','Новый проект','plus')+act('projectTitle','Переименовать проект','edit')+act('import','Открыть JSON','upload')+act('save','Сохранить копию','download')+act('demo','Открыть демонстрационный проект','house')+'</div>');
}
function download(contents,type,name){
  const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function filename(){return(model.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,85)||'AES')+'.aes';}
async function exportHtml(){
  const current=clone(model),name=filename();
  assert(crypto.subtle,'Для экспорта HTML откройте редактор по HTTPS или локально. Модель доступна в JSON.');
  const db=AESDB.newStore(),tx=await AESDB.createDatabase(db,'AES',{entry:current});
  AESDB.commit(db,tx.store);
  const doc=new DOMParser().parseFromString(pristine,'text/html');
  doc.querySelector('#db-store').textContent=JSON.stringify(AESDB.snapshot(db));
  download('<!doctype html>\n'+doc.documentElement.outerHTML,'text/html;charset=utf-8',name+'.html');
  closeDialog();message('Автономный HTML подготовлен.');
}
async function readImport(file){
  if(!file)return;
  try{
    assert(file.size<8*1024*1024,'Файл превышает 8 МиБ.');
    const imported=upgradeProject(JSON.parse(await file.text()));
    confirmAction('Открыть JSON?',imported.title+' · Щитов: '+imported.boards.length+', устройств: '+imported.nodes.length+', связей: '+imported.links.length+'. Текущий проект можно вернуть кнопкой «Отменить».','Открыть',()=>{
      change(()=>{},imported);boardId='';selected='';nav('board');
    });
  }catch(e){message('Импорт отклонён. '+e.message);}
  finally{$('#importfile').value='';}
}
function showNode(target){
  const n=node(target);if(!n)return;routeEdit=null;selected=n.id;focusLink='';
  if(page==='inventory'){nodeForm(true);return;}
  if(page==='board' && !n.place){networkBoard='*';networkMedium='*';nav('network');return;}
  if(page==='board')boardId=n.place.board;
  render();
}
const actions={
  menu:()=>document.body.classList.toggle('menu'),close:closeDialog,nav:el=>nav(el.dataset.page),
  undo:()=>undo(),redo:()=>undo(true),addBoard:()=>boardForm(),editBoard:()=>boardForm(true),deleteBoard:eraseBoard,
  addNode:()=>nodeForm(),editNode:()=>nodeForm(true),deleteNode:eraseNode,addLink:()=>linkForm(),
  deleteLink:()=>{const l=model.links.find(x=>x.id===focusLink);if(l)confirmAction('Удалить связь?',node(l.from.node).tag+' → '+node(l.to.node).tag,'Удалить',()=>change(m=>{m.links=m.links.filter(x=>x.id!==l.id);}));},
  inspectRelated:el=>showNode(el.dataset.target),showNet:()=>{networkBoard='*';networkMedium='*';nav('network');},
  fit:()=>{const canvas=$('.netcanvas'),drawing=canvas?.querySelector('svg');if(drawing){zoom=Math.min(1.6,Math.max(.05,(canvas.clientWidth-2)/drawing.viewBox.baseVal.width));render();$('.netcanvas').scrollTo(0,0);}},
  zoomIn:()=>{zoom=Math.min(1.6,Math.round((zoom+.15)*100)/100);render();},zoomOut:()=>{zoom=Math.max(.05,Math.round((zoom-.15)*100)/100);render();},
  trace:()=>{trace=!trace;render();if(trace)message('Подсвечены достижимые узлы по направлениям связей. Положение контактов не учитывается.');},
  addPort:()=>$('.portlist').insertAdjacentHTML('beforeend',portRow()),
  removePort:el=>el.closest('.portrow').remove(),
  files:fileMenu,save:saveMenu,projectTitle:()=>projectName(),newProject:()=>projectName(true),
  demo:()=>confirmAction('Открыть пример?','Демонстрационная компоновка дома с солнечной станцией заменит рабочую копию. Изменение можно отменить.','Открыть пример',()=>{change(()=>{},makeDemo());boardId='main';nav('board');}),
  import:()=>{$('#importfile').click();},downloadHTML:exportHtml,downloadJSON:()=>{download(JSON.stringify(model,null,2)+'\n','application/json',filename()+'.json');closeDialog();message('JSON подготовлен.');},
  about:()=>modal('О модели','<p>AES Studio хранит щиты, размещение оборудования и типизированные связи в одном проекте AES/2. В режиме перестановки нажмите свободное место для добавления аппарата. Переносите аппараты мышью или укажите щит, рейку и место в свойствах.</p><p>Схемы показывают функциональные связи и физические провода. План группирует кабели по назначению. Предварительные расчёты выполняются по введённому режиму и условиям прокладки. Начальные размеры, расположение и нагрузки демонстрационные.</p><p>На сайте изменения сохраняются в этом браузере. В автономной HTML-копии используйте «Сохранить», чтобы скачать следующую редакцию. Каждая копия содержит один снимок HTML_DBMS/4.</p>')
};
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act],[data-board],[data-slot],[data-node],[data-link]');if(!el)return;
  try{
    if(el.dataset.act){await actions[el.dataset.act]?.(el);return;}
    if(el.dataset.board){routeEdit=null;boardId=el.dataset.board;selected='';nav('board');return;}
    if(el.dataset.slot){nodeForm(false,{board:boardId,row:+el.dataset.row,slot:+el.dataset.slot});return;}
    if(el.dataset.node){showNode(el.dataset.node);return;}
    if(el.dataset.link){focusLink=el.dataset.link;linkForm(model.links.find(l=>l.id===focusLink));}
  }catch(err){const target=$('#form .formerror');if($('#dialog').open && target)target.textContent=err.message;else message(err.message);}
});
document.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('g[data-node][role="button"]')){e.preventDefault();showNode(e.target.dataset.node);}
  if($('#dialog').open||e.target.closest('input,textarea,select'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}
  if(e.key==='Escape')document.body.classList.remove('menu');
});
document.addEventListener('change',e=>{
  if(e.target.id==='boardfilter'){networkBoard=e.target.value;selected='';trace=false;render();}
  if(e.target.id==='mediumfilter'){networkMedium=e.target.value;selected='';trace=false;render();}
});
$('#form').addEventListener('submit',e=>{e.preventDefault();try{onSubmit?.();}catch(err){$('#form .formerror').textContent=err.message;}});
$('#importfile').onchange=e=>readImport(e.target.files[0]);
let dragging='';
document.addEventListener('dragstart',e=>{const el=e.target.closest('.device');if(el){dragging=el.dataset.node;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragging);}});
document.addEventListener('dragover',e=>{if(dragging && e.target.closest('[data-slot]')){e.preventDefault();e.target.closest('[data-slot]').classList.add('over');}});
document.addEventListener('dragleave',e=>e.target.closest('[data-slot]')?.classList.remove('over'));
document.addEventListener('dragend',()=>{dragging='';document.querySelectorAll('.over').forEach(el=>el.classList.remove('over'));});
document.addEventListener('drop',e=>{
  const cell=e.target.closest('[data-slot]');if(!cell||!dragging)return;e.preventDefault();const n=node(dragging);dragging='';cell.classList.remove('over');
  try{change(m=>{m.nodes.find(x=>x.id===n.id).place={board:boardId,row:+cell.dataset.row,slot:+cell.dataset.slot};});selected=n.id;render();}catch(err){message(err.message);}
});
let portable=false;
async function start(){
  document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});$('.hamburger').innerHTML=icon('menu');
  const embedded=JSON.parse($('#db-store').textContent);
  if(Object.hasOwn(embedded,'format')){
    portable=true;const internal=AESDB.adoptStore(embedded);const dbHead=embedded.publicHeads?.AES;
    const {chain}=await AESDB.openDatabase(internal,dbHead);model=upgradeProject(chain.state.entry);persistState='Снимок HTML';
  }else{
    storageKey='aes-studio:v1:'+location.pathname;model=makeDemo();persistState='Демопроект';
    try{diskValue=localStorage.getItem(storageKey);if(diskValue){model=upgradeProject(JSON.parse(diskValue));persistState='Сохранено локально';}}
    catch(e){persistState='Только в памяти';message('Локальный черновик недоступен. Открыта демонстрационная модель.');}
  }
  normalizeUI();render();
}

