
let boardMode='wiring', inventoryMode='devices', overviewMode='panels', chosenBundle='', routeEdit=null;
let overviewSelection='', popupReturn=null;
const numberText=n=>n==null?'—':Number(n.toFixed(2)).toLocaleString('ru-RU');
const readNumber=k=>val(k)===''?null:Number(val(k));
const numeric=(k,v,min=.001,max=1e9)=>'<input type="number" step="any" min="'+min+'" max="'+max+'" name="'+k+'" value="'+esc(v??'')+'">';
const byId=(xs,id)=>xs.find(x=>x.id===id);
function areaField(a){return field('Здание / помещение',select('area',opt('','Не назначено',a)+model.areas.map(x=>opt(x.id,areaTitle(model,x.id),a)).join('')),true);}
function dropdown(trigger,items){
  const existing=$('#actionmenu');if(existing){existing.remove();if(existing.dataset.trigger===trigger.dataset.act)return;}
  const menu=document.createElement('div');menu.id='actionmenu';menu.className='actionmenu';menu.dataset.trigger=trigger.dataset.act;menu.setAttribute('aria-label','Команды');
  menu.innerHTML=items.map(([key,label,k])=>act(key,label,k)).join('');document.body.append(menu);
  const box=trigger.getBoundingClientRect();menu.style.top=Math.max(4,Math.min(box.bottom+4,innerHeight-menu.offsetHeight-6))+'px';menu.style.left=Math.max(6,Math.min(box.left,innerWidth-menu.offsetWidth-8))+'px';
  popupReturn=trigger;menu.querySelector('button')?.focus();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#actionmenu,[data-act="files"],[data-act="tools"]'))$('#actionmenu')?.remove();});
document.addEventListener('click',e=>{if(e.target.closest('#actionmenu button'))queueMicrotask(()=>$('#actionmenu')?.remove());});
document.addEventListener('keydown',e=>{
  const menu=$('#actionmenu');if(!menu)return;
  if(e.key==='Escape'){menu.remove();popupReturn?.focus();e.preventDefault();return;}
  const bs=[...menu.querySelectorAll('button')],i=bs.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();bs[(i+(e.key==='ArrowDown'?1:bs.length-1))%bs.length].focus();}
  if(e.key==='Tab')setTimeout(()=>{if(!menu.contains(document.activeElement))menu.remove();});
});
function tabs(entries,current,action){return '<div class="segmented">'+entries.map(([key,label])=>act(action,label,'',current===key?'active':'',extraAttr('key',key)+' aria-pressed="'+(current===key)+'"')).join('')+'</div>';}
function areaForm(a=null){
  const areas=model.areas.filter(x=>x.type==='building'&&x.id!==a?.id);
  modal(a?'Свойства места':'Добавить место','<div class="fields">'+field('Название',textInput('title',a?.name||''),true)+
    field('Тип места',select('areaType',opt('building','Здание',a?.type)+opt('room','Помещение',a?.type)))+
    field('Родительское здание',select('parent',opt('','Выберите здание',a?.parent)+areas.map(b=>opt(b.id,b.name,a?.parent)).join('')))+'</div>',
    commitButtons('Сохранить место',a?'removeArea':''),()=>{
      const item={...a,id:a?.id||id(),name:val('title').trim(),type:val('areaType'),parent:val('areaType')==='room'?val('parent'):''};
      change(m=>{if(a)Object.assign(byId(m.areas,a.id),item);else m.areas.push(item);});closeDialog();
    });
  const f=$('#form').elements;f.areaType.onchange=()=>f.parent.disabled=f.areaType.value==='building';f.areaType.onchange();
  if(a)$('#form').dataset.area=a.id;
}
function powerFields(n){
  const p=n?.power;
  return '<details class="wide settingsfold" '+(p?'open':'')+'><summary>Источник / нагрузка и расчёт тока</summary><div class="fields">'+
    field('Назначение',select('powerRole',opt('','Без расчёта',p?.role)+opt('source','Источник',p?.role)+opt('load','Нагрузка',p?.role)))+
    field('Режим',select('powerMode',Object.entries(serviceModes).map(([k,t])=>opt(k,t,p?.mode||'AC1')).join('')))+
    field('Активная мощность, Вт',numeric('watts',p?.watts))+field('Напряжение, В',numeric('volts',p?.volts))+
    field('cos φ (AC)',numeric('pf',p?.pf??1,.01,1))+'</div><p>Для трёх фаз укажите суммарную мощность и линейное напряжение. Для источника — электрическую выходную мощность.</p></details>';
}
function readPower(){return val('powerRole')?{role:val('powerRole'),mode:val('powerMode'),volts:readNumber('volts'),watts:readNumber('watts'),pf:val('powerMode')==='DC'?1:readNumber('pf')}:null;}
function stockFields(s){
  return field('Марка',textInput('mark',s.mark,120,false))+field('Материал',select('material',opt('Cu','Медь',s.material)+opt('Al','Алюминий',s.material)))+
    field('Фактическое сечение, мм²',numeric('section',s.section))+field('Длина в одну сторону, м',numeric('length',s.length));
}
function readStock(){return {mark:val('mark').trim(),material:val('material'),section:readNumber('section'),length:readNumber('length')};}
function cableForm(c=null){
  const item=c||stockBase();
  modal(c?'Свойства кабеля':'Добавить кабель','<div class="fields">'+field('Обозначение кабеля',textInput('name',c?.name||'КБ-'+(model.cables.length+1),100))+field('Количество жил',numberInput('cores',c?.cores||3,1,128))+stockFields(item)+'</div>',commitButtons('Сохранить кабель',c?'removeCable':''),()=>{
    const rec={...item,...readStock(),id:c?.id||id(),name:val('name').trim(),cores:+val('cores')};
    change(m=>{if(c)Object.assign(byId(m.cables,c.id),rec);else m.cables.push(rec);});closeDialog();
  });
  if(c)$('#form').dataset.cable=c.id;
}
function wireForm(link,wire=null,seed=null){
  const source=seed?.from||link.from,target=seed?.to||link.to;
  const md=nodePorts(node(source.node))[source.port].medium;
  const w=wire||newWire(md,physicalRows(model).length+1);
  const roles=rolesFor(md,[node(source.node).kind,node(target.node).kind].includes('neutralBus'));
  if(!wire&&!roles.includes(w.role)){w.role=roles[0];w.color=defaultColor[w.role];}
  const endpoint=e=>esc(node(e.node).tag+' · '+nodePorts(node(e.node))[e.port].label);
  modal(wire?'Свойства провода':'Проложить провод','<p>'+endpoint(source)+' → '+endpoint(target)+'</p><div class="fields">'+
   field('Обозначение провода',textInput('wireName',w.name,100))+field('Назначение жилы',select('role',roles.map(k=>opt(k,signalRoles[k],w.role)).join('')))+
   field('Цвет провода',select('color',Object.entries(coreColors).map(([k,[t]])=>opt(k,t,w.color)).join('')))+
   field('Кабель',select('cable',opt('','Отдельный провод',w.cable)+model.cables.map(c=>opt(c.id,c.name,w.cable)).join('')))+
   field('Номер жилы',numberInput('core',w.core||1,1,128))+field('Клемма начала',textInput('startTerminal',w.a,60,false))+field('Клемма конца',textInput('endTerminal',w.b,60,false))+
   '<fieldset class="stockfields wide fields"><legend>Отдельный провод</legend>'+stockFields(w)+'</fieldset></div>',
   commitButtons('Сохранить провод',wire?'removeWire':''),()=>{
     const cable=val('cable');
     const rec={...w,...(!cable?readStock():{}),name:val('wireName').trim(),role:val('role'),color:val('color'),cable,core:cable?+val('core'):null,a:val('startTerminal').trim(),b:val('endTerminal').trim()};
     if(cable){for(const k of ['mark','section','material','length','design'])delete rec[k];}
     change(m=>{
       let row=link&&byId(m.links,link.id);
       if(!row){row={id:id(),from:source,to:target,label:'',wires:[]};m.links.push(row);}
       if(wire)row.wires[row.wires.findIndex(x=>x.id===wire.id)]=rec;else row.wires.push(rec);
     });closeDialog();message('Провод сохранён.');
   });
  const f=$('#form').elements;
  const updateCable=(choose=false)=>{
    f.core.disabled=!f.cable.value;$('.stockfields').disabled=!!f.cable.value;$('.stockfields').hidden=!!f.cable.value;
    if(!f.cable.value)return;
    const c=byId(model.cables,f.cable.value);f.core.max=c.cores;
    if(choose){const used=new Set(physicalRows(model).map(x=>x.wire).filter(x=>x.cable===c.id&&x.id!==w.id).map(x=>x.core));let i=1;while(i<=c.cores&&used.has(i))i++;f.core.value=i;}
  };
  function roleColor(reset){if(reset)f.color.value=defaultColor[f.role.value];f.color.disabled=['N','PE'].includes(f.role.value);}
  f.cable.onchange=()=>updateCable(true);f.role.onchange=()=>roleColor(true);roleColor(false);updateCable();
  if(wire)$('#form').dataset.wire=wire.id;
}
function rawWire(id){return physicalRows(model).find(x=>x.wire.id===id);}
function bundleRows(ls){
  const rows=physicalRows(model).filter(x=>ls.has(x.link.id));
  return '<div class="bundlelist">'+rows.map(({wire:w,link:l})=>act('editWire',w.name+' · '+(byId(model.cables,w.cable)?.name||'Отдельный провод')+' · '+node(l.from.node).tag+' → '+node(l.to.node).tag,'link','',extraAttr('id',w.id))).join('')+
  [...ls].map(k=>byId(model.links,k)).filter(l=>!l.wires.length).map(l=>act('addWireTo','Указать провод · '+node(l.from.node).tag+' → '+node(l.to.node).tag,'plus','',extraAttr('id',l.id))).join('')+'</div>';
}
function wiresList(l){
  return '<div class="bundlelist">'+l.wires.map(w=>act('editWire',w.name+' · '+coreColors[w.color][0],'edit','',extraAttr('id',w.id))).join('')+act('addWireTo','Добавить провод','plus','',extraAttr('id',l.id))+'</div>';
}
function cableInventory(){
  const all=physicalRows(model),filter=n=>networkBoard==='*'||(node(n).place?.board||'!outside')===networkBoard;
  const rows=all.filter(({link:l})=>filter(l.from.node)||filter(l.to.node));
  const visibleIDs=new Set(rows.map(r=>r.wire.cable));
  const cables=model.cables.filter(c=>networkBoard==='*'||visibleIDs.has(c.id));
  const standalone=rows.filter(r=>!r.wire.cable).map(r=>r.wire),stock=[...cables,...standalone];
  const qty=stock.reduce((n,s)=>n+(s.length||0),0),unknown=stock.filter(s=>!s.length).length;
  const spec=s=>(s.mark||'—')+' · '+s.material+' · '+numberText(s.section)+' мм²';
  return '<section class="panel"><div class="panelhead"><h2>Кабели и отдельные провода</h2>'+act('addCable','Кабель','plus')+'</div><div class="matstats"><b>'+numberText(qty)+' м</b> учтённой длины · позиций без длины: '+unknown+'</div><div class="scroll"><table class="data"><thead><tr><th>Позиция</th><th>Исполнение</th><th>Занято жил</th><th>Длина</th><th>Расчёт</th></tr></thead><tbody>'+stock.map(s=>{
   const cable=!!s.cores;
   return '<tr><td>'+act(cable?'editCable':'editWire',s.name,'','tablebtn tag',extraAttr('id',s.id))+'</td><td>'+esc(spec(s))+'</td><td>'+(cable?all.filter(r=>r.wire.cable===s.id).length+' / '+s.cores:'1')+'</td><td>'+numberText(s.length)+' м</td><td>'+act('designCircuit','Рассчитать','','fit',extraAttr('id',s.id))+'</td></tr>';
  }).join('')+'</tbody></table></div></section><section class="panel tablepanel"><div class="panelhead"><h2>Журнал соединений проводов</h2></div><div class="scroll"><table class="data"><thead><tr><th>Провод</th><th>Цвет / функция</th><th>Откуда → куда</th><th>Кабель / жила</th></tr></thead><tbody>'+rows.map(({wire:w,link:l})=>'<tr><td>'+act('editWire',w.name,'','tablebtn tag',extraAttr('id',w.id))+'</td><td><i class="wirekey" style="background:'+coreColors[w.color][1]+'"></i>'+esc(coreColors[w.color][0]+' · '+signalRoles[w.role])+'</td><td>'+esc(node(l.from.node).tag+' / '+(w.a||portName(l.from))+' → '+node(l.to.node).tag+' / '+(w.b||portName(l.to)))+'</td><td>'+esc(w.cable?byId(model.cables,w.cable).name+' / '+w.core:'Отдельный')+'</td></tr>').join('')+'</tbody></table></div></section>';
}
function findStock(m,id){return byId(m.cables,id)||physicalRows(m).find(r=>r.wire.id===id&&!r.wire.cable)?.wire;}
function circuitForm(item){
  const d=item.design||{members:[],method:'',factor:1,drop:3}, eligible=model.nodes.filter(n=>n.power);
  const members=eligible.map(n=>'<label class="member"><input type="checkbox" name="members" value="'+esc(n.id)+'" '+(d.members.includes(n.id)?'checked':'')+'>'+esc(n.tag+' · '+n.name+' · '+numberText(loadCurrent(n.power))+' А')+'</label>').join('');
  const media=physicalRows(model).filter(r=>r.wire.cable===item.id||r.wire.id===item.id).filter(r=>!['PE','N'].includes(r.wire.role)).map(r=>medium(r.link));
  modal('Расчёт · '+item.name,'<div class="fields">'+field('Метод прокладки',select('method',opt('','Условия не заданы',d.method)+(item.cores?opt('B2','B2 · многожильный кабель в трубе',d.method):opt('B1','B1 · отдельные проводники в трубе',d.method))),true)+
    field('Общий поправочный коэффициент',numeric('factor',d.factor,.01,1))+field('Допустимое падение участка, %',numeric('drop',d.drop,.01,20))+'</div><p>Cu, ПВХ 70 °C, базовая температура воздуха 30 °C. Укажите общий коэффициент условий и группировки. Длина '+numberText(item.length)+' м.</p><fieldset class="members"><legend>Одновременные нагрузки или один источник</legend>'+(members||'Задайте электрические данные в свойствах устройства.')+'</fieldset><div id="calcresult" aria-live="polite"></div><p>Предварительный номинал по перегрузке. Ток КЗ, время отключения, пусковые токи и паспорт аппарата проверяются отдельно. Для DC требуется аппарат с подходящим DC-рейтингом.</p>',
    commitButtons('Сохранить условия'),()=>{const design=read();change(m=>findStock(m,item.id).design=design);closeDialog();});
  function read(){return {method:val('method'),factor:readNumber('factor'),drop:readNumber('drop'),members:[...document.querySelectorAll('input[name=members]:checked')].map(el=>el.value)};}
  function update(){
    const d=read(),r=calculateCircuit(model,{...item,design:d},media);
    const list=[['Расчётный ток Ib',r.current==null?'—':numberText(r.current)+' А']];
    if(r.candidate)list.push(['Расчётное сечение',r.candidate.section+' мм²'],['Допустимый ток Iz',numberText(r.candidate.iz)+' А'],['Автомат In · по перегрузке',r.nominal+' А'],['Падение на участке',numberText(r.candidate.volts)+' В · '+numberText(r.candidate.percent)+' %']);
    if(r.actual)list.push(['Фактическое сечение',r.actual.section+' мм² · Iz '+numberText(r.actual.iz)+' А · ΔU '+numberText(r.actual.percent)+' %'],['Проверка сечения',r.nominal&&r.actual.iz>=r.nominal&&r.actual.percent<=d.drop?'Проходит по Iz и ΔU':'Не проходит или номинал не определён']);
    $('#calcresult').innerHTML='<dl class="props resultprops">'+list.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+(r.reason?'<p>'+esc(r.reason)+'</p>':'');
  }
  $('#form').addEventListener('input',update,{signal:dialogLifetime.signal});update();
}
function calculationPage(){
  const ns=model.nodes.filter(n=>n.power),items=[...model.cables,...physicalRows(model).map(r=>r.wire).filter(w=>!w.cable)];
  return crumb('Расчёты')+heading('Установившийся режим','Расчёты','Источники, нагрузки и питающие линии',act('powerPick','Данные устройства','plus','primary'))+'<section class="panel"><div class="panelhead"><h2>Источники и нагрузки</h2></div><div class="scroll"><table class="data"><thead><tr><th>Устройство</th><th>Роль</th><th>Режим</th><th>P</th><th>U</th><th>I</th></tr></thead><tbody>'+ns.map(n=>'<tr><td>'+act('nodeProperties',n.tag+' · '+n.name,'','tablebtn',extraAttr('id',n.id))+'</td><td>'+(n.power.role==='source'?'Источник':'Нагрузка')+'</td><td>'+serviceModes[n.power.mode]+'</td><td>'+numberText(n.power.watts)+' Вт</td><td>'+numberText(n.power.volts)+' В</td><td>'+numberText(loadCurrent(n.power))+' А</td></tr>').join('')+'</tbody></table></div></section><section class="panel tablepanel"><div class="panelhead"><h2>Линии для подбора сечения и автомата</h2></div><div class="chooseitems">'+items.map(i=>act('designCircuit',i.name,'bolt','',extraAttr('id',i.id))).join('')+'</div></section>';
}
