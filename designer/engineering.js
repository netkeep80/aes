
// Explicit steady-state circuit basis. No inference of switch states or parallel sources.
const sectionsB2 = [
  // Cu/PVC, multicore cable in conduit, 30 °C air. Columns: mm², 2 and 3 loaded cores.
  [1.5,16.5,15],[2.5,23,20],[4,30,27],[6,38,34],[10,52,46],[16,69,62],
  [25,90,80],[35,111,99],[50,133,118],[70,168,149],[95,201,179],[120,232,206]
];
const sectionsB1=[[1.5,17.5,15.5],[2.5,24,21],[4,32,28],[6,41,36],[10,57,50],[16,76,68],[25,101,89],[35,125,110],[50,151,134],[70,192,171],[95,232,207],[120,269,239]];
const breakerSeries=[1,2,3,4,6,10,13,16,20,25,32,40,50,63,80,100,125,160,200,250];
const coreColors={
  brown:['Коричневый','#824a26'],blue:['Голубой','#1879c1'],black:['Чёрный','#262b30'],
  grey:['Серый','#727d83'],pe:['Жёлто-зелёный','#418045'],red:['Красный','#c24639'],
  violet:['Фиолетовый','#8753a1'],orange:['Оранжевый','#b96713'],white:['Белый','#e8e8df']
};
const serviceModes={DC:'DC',AC1:'AC · 1 фаза',AC3:'AC · 3 фазы, симметрично'};
const signalRoles={L:'Фаза L',L1:'Фаза L1',L2:'Фаза L2',L3:'Фаза L3',N:'Нейтраль N',PE:'Защитный PE',plus:'DC +',minus:'DC −',signal:'Сигнал',other:'Другое'};
function rolesFor(md,neutral=false){
  if(md==='PE')return ['PE'];
  if(neutral)return ['N'];
  if(md==='DC')return ['plus','minus','other'];
  if(md==='CTRL')return ['signal','other'];
  return ['L','L1','L2','L3','N','other'];
}
const defaultColor={L:'brown',L1:'brown',L2:'black',L3:'grey',N:'blue',PE:'pe',plus:'red',minus:'black',signal:'violet',other:'grey'};
const finiteRange=(x,lo,hi)=>Number.isFinite(x)&&x>=lo&&x<=hi;
const positive=x=>Number.isFinite(x)&&x>0;
const pointOK=p=>p && finiteRange(p.x,0,50000) && finiteRange(p.y,0,50000);
function validWireColor(role,color){
  if(role==='PE')return color==='pe';
  if(role==='N')return color==='blue';
  return own(coreColors,color)&&color!=='pe';
}
function checkPhysical(m,identity){
  assert(Array.isArray(m.areas)&&m.areas.length<=1000&&Array.isArray(m.cables)&&m.cables.length<=10000,'Повреждён каталог мест или кабелей.');
  const areas=new Map(m.areas.map(a=>[a.id,a])), nodes=new Map(m.nodes.map(n=>[n.id,n])), boards=new Set(m.boards.map(b=>b.id));
  for(const a of m.areas){
    identity(a);assert(str(a.name)&&((a.type==='building'&&!a.parent)||(a.type==='room'&&areas.get(a.parent)?.type==='building')),'Проверьте здание и помещение.');
  }
  for(const item of [...m.areas,...m.boards,...m.nodes]){
    assert(!item.area||areas.has(item.area),'Область размещения отсутствует.');
    assert(!item.xy||pointOK(item.xy),'Некорректные координаты на плане.');
  }
  for(const n of m.nodes)if(n.power){
    const p=n.power;assert(['source','load'].includes(p.role)&&own(serviceModes,p.mode)&&positive(p.watts)&&positive(p.volts)&&finiteRange(p.pf,0.01,1),'Проверьте электрические данные устройства.');
  }
  const cables=new Map(),usage=new Map();
  function stock(s){
    assert(['Cu','Al'].includes(s.material)&& (s.length===null||positive(s.length)) && (s.section===null||positive(s.section))&&optionalText(s.mark,120),'Проверьте марку, материал, длину и сечение.');
    if(s.design){
      const d=s.design;assert(Array.isArray(d.members)&&new Set(d.members).size===d.members.length&&d.members.every(i=>nodes.has(i))&&finiteRange(d.factor,.01,1)&&finiteRange(d.drop,.01,20)&&['B1','B2',''].includes(d.method),'Проверьте условия расчёта.');
    }
  }
  for(const c of m.cables){identity(c);stock(c);assert(str(c.name,100)&&integer(c.cores,1,128),'Проверьте кабель.');cables.set(c.id,c);}
  for(const l of m.links){
    assert(Array.isArray(l.wires)&&l.wires.length<=256,'Проверьте список проводов связи.');
    for(const w of l.wires){
      identity(w);assert(str(w.name,100)&&own(coreColors,w.color)&&own(signalRoles,w.role)&&optionalText(w.a,60)&&optionalText(w.b,60),'Проверьте обозначения провода.');
      assert(validWireColor(w.role,w.color),'Проверьте цвет PE и N.');
      const f=nodes.get(l.from.node),t=nodes.get(l.to.node),md=nodePorts(f)[l.from.port].medium;
      assert(rolesFor(md,f.kind==='neutralBus'||t.kind==='neutralBus').includes(w.role),'Функция жилы не соответствует портам.');
      if(w.cable){const c=cables.get(w.cable);assert(c&&integer(w.core,1,c.cores),'Номер жилы вне кабеля.');const key=c.id+':'+w.core;assert(!usage.has(key),'Эта жила кабеля уже занята.');usage.set(key,w.id);}
      else stock(w);
      assert(w.routes==null || (typeof w.routes==='object'&&!Array.isArray(w.routes)),'Некорректная запись трасс.');
      for(const [owner,points] of Object.entries(w.routes||{}))assert(boards.has(owner)&&Array.isArray(points)&&points.length<=64&&points.every(pointOK),'Некорректная ручная трасса.');
    }
  }
}
function loadCurrent(p){
  const phases=p.mode==='AC3'?Math.sqrt(3):1, pf=p.mode==='DC'?1:p.pf;
  return p.watts/(p.volts*phases*pf);
}
function calculateCircuit(project,item,media=[]){
  const d=item.design||{},profiles=(d.members||[]).map(id=>project.nodes.find(n=>n.id===id)?.power);
  const fail=reason=>({reason});
  if(!profiles.length||profiles.some(p=>!p))return fail('Укажите мощность устройств и состав питаемой группы.');
  const p=profiles[0],dc=p.mode==='DC',three=p.mode==='AC3';
  if(profiles.some(q=>q.mode!==p.mode||q.volts!==p.volts))return fail('Разные напряжения или фазность. Разделите расчётные группы.');
  if(profiles.length>1&&profiles.some(q=>q.role==='source'))return fail('Для источника задайте отдельный расчётный режим.');
  if(media.some(md=>md!==(dc?'DC':'AC')))return fail('Среда портов и выбранной группы различается.');
  let real=0,reactive=0;
  for(const q of profiles){const i=loadCurrent(q),pf=dc?1:q.pf;real+=i*pf;reactive+=i*Math.sqrt(1-pf*pf);}
  const current=Math.hypot(real,reactive),result={current};
  if(!positive(current))return fail('Ток вне диапазона расчёта.');
  const method=item.cores?'B2':'B1';
  if(item.material!=='Cu'||d.method!==method)return {...result,reason:'Для подбора требуется медь, ПВХ и метод '+method+'.'};
  if(!finiteRange(d.factor,.01,1)||!finiteRange(d.drop,.01,20))return {...result,reason:'Проверьте коэффициент условий и бюджет падения.'};
  if(!item.cores && ['PE','N','signal'].includes(item.role))return {...result,reason:'Этой жиле требуется отдельная методика расчёта.'};
  if(!positive(item.length))return {...result,reason:'Укажите длину трассы в одну сторону.'};
  if(item.cores && item.cores<(three?3:2))return {...result,reason:'Недостаточно жил для выбранного режима.'};
  const nominal=breakerSeries.find(x=>x>=current-1e-10);
  // Upper estimate of Cu resistance at working temperature, Ω·mm²/km;
  // X = 0.08 Ω/km for AC. Length is one way in metres.
  const evaluate=([section,i2,i3])=>{
    const iz=(three?i3:i2)*d.factor;
    const volts=(three?Math.sqrt(3):2)*item.length/1000*(23.7*real/section+(dc?0:.08*reactive));
    return {section,iz,percent:100*volts/p.volts,volts};
  };
  const rows=(method==='B2'?sectionsB2:sectionsB1).map(evaluate);
  const candidate=rows.find(x=>nominal && x.iz>=nominal && x.percent<=d.drop);
  const actual=rows.find(x=>x.section===item.section);
  return {...result,nominal:candidate?nominal:null,candidate,actual,reason:candidate?'':'Нет пары сечение / номинал в диапазоне таблицы.'};
}
function boardRoute(w,bid){return w?.routes&&own(w.routes,bid)?w.routes[bid]:[];}
function stockBase(){return {mark:'',material:'Cu',section:null,length:null};}
function newWire(md,number){
  const role=md==='PE'?'PE':md==='DC'?'plus':md==='CTRL'?'signal':'L';
  return {...stockBase(),id:id(),name:'W'+number,role,color:defaultColor[role],a:'',b:'',cable:'',core:null,routes:{}};
}
function physicalRows(m){return m.links.flatMap(link=>link.wires.map(wire=>({wire,link})));}
function areaTitle(m,aid){const a=m.areas.find(x=>x.id===aid);if(!a)return '';return a.type==='room'?areaTitle(m,a.parent)+' / '+a.name:a.name;}
function placeGroup(m,n){
  if(n.place){const b=m.boards.find(b=>b.id===n.place.board);return {id:b.id,title:b.tag+' · '+b.name,area:b.area||'',type:'Щит'};}
  if(n.area)return {id:n.area,title:areaTitle(m,n.area),area:n.area,type:'Место'};
  return {id:n.id,title:n.location?n.location+' · '+n.tag:n.tag+' · '+n.name,area:'',type:'Устройство'};
}
function demoPhysical(m){
  m.areas=[{id:'house',name:'Жилой дом',type:'building'},{id:'plant',name:'Техпостройка',type:'building'},{id:'hall',name:'Прихожая',type:'room',parent:'house'},{id:'living',name:'Жилые комнаты',type:'room',parent:'house'},{id:'utility',name:'Техническая',type:'room',parent:'plant'}];
  m.boards.forEach((b,i)=>b.area=['hall','utility','utility'][i]);
  m.nodes.filter(n=>!n.place).forEach(n=>n.area=['load','loadDC'].includes(n.kind)?'living':'utility');
  for(const [nid,role,mode,watts,volts] of [['room','load','AC1',460,230],['socket','load','AC1',1840,230],['appliance','load','AC1',2300,230],['lights','load','DC',36,12],['grid','source','AC1',4600,230],['gen','source','AC1',2300,230]]){
    m.nodes.find(n=>n.id===nid).power={role,mode,watts,volts,pf:1};
  }
  const nBus={id:'xn',kind:'neutralBus',tag:'XN1',name:'Нейтраль группы',rating:'N',note:'',width:1,place:{board:'main',row:2,slot:8}};
  const peBus={...nBus,id:'xpe',kind:'earthBus',tag:'XPE1',name:'Защитная шина',rating:'PE',place:{board:'main',row:2,slot:10}};
  m.nodes.push(nBus,peBus);
  m.nodes.filter(n=>['socket','appliance'].includes(n.id)).forEach(n=>n.kind='groundedLoad');
  m.links.forEach((l,i)=>{
    const md=nodePorts(m.nodes.find(n=>n.id===l.from.node))[l.from.port].medium;
    const w=newWire(md,i+1);w.id='w'+(i+1);w.mark='Учебный провод';w.length=.5;w.section=1.5;l.wires=[w];
    if(['room','socket','appliance','lights'].includes(l.to.node)){
      const c={...stockBase(),id:'c'+i,name:'КБ-'+(i+1),mark:'Учебная линия',cores:3,section:2.5,length:15,
        design:{method:'B2',members:[l.to.node],factor:1,drop:3}};
      m.cables.push(c);w.cable=c.id;w.core=1;
    }
  });
  for(const dest of ['socket','appliance']){
    const feeder=m.links.find(l=>l.to.node===dest),cid=feeder.wires[0].cable;
    for(const [origin,port,toPort,role,core] of [['xn','n','in','N',2],['xpe','pe','pe','PE',3]]){
      const w={...newWire(role==='N'?'AC':'PE',0),id:'wire-'+dest+role,name:dest+'-'+role,role,color:defaultColor[role],cable:cid,core,a:role,b:role};
      m.links.push({id:'link-'+dest+role,from:{node:origin,port},to:{node:dest,port:toPort},label:'',wires:[w]});
    }
  }

}
