// A port names one functional circuit, not an individual wire or terminal.
const ports = (...items) => Object.fromEntries(items.map(([id, label, medium, dir]) => [id, {label, medium, dir}]));
const pair = medium => ports(['in','Вход',medium,'in'], ['out','Выход',medium,'out']);
const output = medium => ports(['out','Выход',medium,'out']);
const input = medium => ports(['in','Вход',medium,'in']);
const ac = pair('AC'), dc = pair('DC');
const kinds = {
  breaker: ['Автомат', 'QF', 1, 'blue', ac],
  main: ['Вводной автомат','QF',2,'blue',ac],
  rcd: ['УЗО','QD',2,'green',ac],
  rcbo: ['Дифавтомат','QFD',2,'green',ac],
  ats: ['АВР','SA',3,'orange',ports(['a','Вход A','AC','in'],['b','Вход B','AC','in'],['out','Выход','AC','out'])],
  relay: ['Реле контроля','KV',2,'violet',ports(['in','Измерение','DC','in'],['out','Контакт','CTRL','out'])],
  contactor: ['Контактор','KM',2,'violet',ports(['in','Силовой вход','AC','in'],['out','Силовой выход','AC','out'],['coil','Управление','CTRL','in'])],
  timer: ['Реле времени','KT',2,'violet',ac],
  fuse: ['Предохранитель DC','FU',1,'orange',dc],
  bus: ['Шина DC','X',2,'orange',ports(['io','Общий узел','DC','both'])],
  grid: ['Районная сеть','GS',0,'blue',output('AC')],
  generator: ['Генератор','G',0,'blue',output('AC')],
  pv: ['Солнечные панели','PV',0,'orange',output('DC')],
  battery: ['Аккумулятор','GB',0,'orange',ports(['io','Сторона DC','DC','both'])],
  mppt: ['Контроллер MPPT','MP',0,'orange',dc],
  ups: ['ИБП / инвертор','UPS',0,'green',ports(['ac','Вход AC','AC','in'],['dc','Сторона АКБ','DC','both'],['out','Выход AC','AC','out'])],
  charger: ['Зарядное устройство','UZ',0,'violet',ports(['in','Вход AC','AC','in'],['out','Выход DC','DC','out'])],
  load: ['Нагрузка AC','EL',0,'blue',input('AC')],
  loadDC: ['Нагрузка DC','HL',0,'orange',input('DC')],
  disconnector: ['Выключатель нагрузки','QS',2,'blue',ac],
  dcBreaker: ['Автомат DC','QF',2,'orange',dc],
  dcSwitch: ['Разъединитель DC','QS',2,'orange',dc],
  meter: ['Счётчик энергии','PI',2,'violet',ac],
  voltageRelay: ['Реле напряжения AC','KV',2,'violet',ac],
  impulse: ['Импульсное реле','KI',1,'violet',ports(['in','Ввод','AC','in'],['out','Нагрузка','AC','out'],['coil','Катушка','CTRL','in'])],
  changeover: ['Перекидной рубильник','QS',3,'orange',ports(['a','Ввод I','AC','in'],['b','Ввод II','AC','in'],['out','Общий','AC','out'])],
  phaseRelay: ['Реле контроля фаз','KF',2,'violet',ports(['in','Контроль фаз','AC','in'],['out','Контакт','CTRL','out'])],
  transformer: ['Блок питания AC/DC','PS',3,'orange',ports(['in','Вход AC','AC','in'],['out','Выход DC','DC','out'])],
  dcConverter: ['Преобразователь DC/DC','DC',2,'orange',dc],
  distribution: ['Распределительный блок AC','X',2,'blue',ports(['io','Распределение','AC','both'])],
  neutralBus: ['Шина N','XN',1,'blue',ports(['n','N','AC','both'])],
  earthBus: ['Шина PE','XPE',1,'green',ports(['pe','PE','PE','both'])],
  terminalAC: ['Проходная клемма AC','XT',1,'blue',ac],
  terminalDC: ['Проходная клемма DC','XT',1,'orange',dc],
  terminalPE: ['Клемма PE','XT',1,'green',ports(['pe','PE','PE','both'])],
  socketDIN: ['Розетка на рейку','XS',3,'blue',ports(['in','Питание','AC','in'],['pe','PE','PE','both'])],
  indicator: ['Индикатор напряжения','HL',1,'green',input('AC')],
  thermostat: ['Термостат','ST',2,'violet',ports(['in','Питание','AC','in'],['out','Команда','CTRL','out'])],
  button: ['Кнопка управления','SB',1,'violet',pair('CTRL')],
  surge: ['УЗИП','FV',2,'green',ports(['in','Ввод','AC','in'],['pe','PE','PE','both'])],
  groundedLoad: ['Нагрузка AC с клеммой PE','EL',0,'blue',ports(['in','Питание','AC','in'],['pe','PE','PE','both'])],
  custom: ['Пользовательское устройство','U',1,'violet',ac]
};
const mediumName = {AC:'Переменный ток', DC:'Постоянный ток', CTRL:'Управление',PE:'Защитный проводник'};
const id = () => crypto.randomUUID();
const clone = x => JSON.parse(JSON.stringify(x));
const own = (o,k) => Object.hasOwn(o,k);
function assert(ok, message) { if (!ok) throw Error(message); }
function str(s,max=160) { return typeof s==='string' && s.trim().length>0 && s.length<=max; }
function optionalText(s,max=500) { return typeof s==='string' && s.length<=max; }
function integer(n,min,max) { return Number.isInteger(n) && n>=min && n<=max; }
function fits(model, board, row, slot, width, except='') {
  return integer(row,1,board.rows) && integer(slot,1,board.slots) && integer(width,1,board.slots-slot+1) &&
    !model.nodes.some(n=>n.id!==except && n.place?.board===board.id && n.place.row===row &&
      n.place.slot < slot+width && slot < n.place.slot+n.width);
}
function vacancy(model,board,width,except='') {
  for(let row=1;row<=board.rows;row++) for(let slot=1;slot<=board.slots;slot++)
    if(fits(model,board,row,slot,width,except)) return {board:board.id,row,slot};
  return null;
}
function nodePorts(n) { return n.kind==='custom' ? n.ports : kinds[n.kind][4]; }
function validatePorts(n) {
  const ps=n.ports;
  assert(ps && typeof ps==='object' && !Array.isArray(ps) && Object.keys(ps).length<=32,'Допустимо до 32 пользовательских портов.');
  for(const [key,p] of Object.entries(ps)){
    assert(/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/.test(key) && p && str(p.label,60) &&
      ['AC','DC','CTRL','PE'].includes(p.medium) && ['in','out','both'].includes(p.dir),'Проверьте имя, тип и направление порта.');
  }
}
function checkModel(m) {
  assert(m?.format==='AES/2','Эта версия студии открывает проекты AES/2.');
  assert(str(m.title) && Array.isArray(m.boards) && Array.isArray(m.nodes) && Array.isArray(m.links),'Повреждена структура проекта.');
  assert(m.boards.length<=120 && m.nodes.length<=3000 && m.links.length<=10000,'Превышен размер проекта.');
  const ids=new Set(), cells=new Set(), boardMap=new Map(), nodeMap=new Map(), edges=new Set();
  const identity = x => { assert(x && typeof x.id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x.id) && !ids.has(x.id),'Некорректный или повторяющийся ID.'); ids.add(x.id); };
  for (const b of m.boards) {
    identity(b); assert(str(b.name) && str(b.tag,32) && optionalText(b.location) && integer(b.rows,1,12) && integer(b.slots,1,48),'Проверьте название и размеры щита.'); boardMap.set(b.id,b);
  }
  for (const n of m.nodes) {
    identity(n); assert(typeof n.kind==='string' && own(kinds,n.kind) && str(n.tag,32) && str(n.name) && optionalText(n.rating,80) && optionalText(n.note) && integer(n.width,0,48),'Проверьте свойства устройства.');
    if(n.kind==='custom')validatePorts(n);
    if(n.location!==undefined)assert(optionalText(n.location),'Проверьте место установки.');
    if(n.place!==null) {
      const p=n.place, b=boardMap.get(p?.board);
      assert(b && integer(p.row,1,b.rows) && integer(p.slot,1,b.slots) && integer(n.width,1,b.slots-p.slot+1),'Аппарат выходит за границы DIN-рейки.');
      for(let s=p.slot;s<p.slot+n.width;s++){let k=JSON.stringify([b.id,p.row,s]);assert(!cells.has(k),'Это место на рейке уже занято.');cells.add(k);}
    }
    nodeMap.set(n.id,n);
  }
  for(const l of m.links) {
    identity(l); const f=nodeMap.get(l.from?.node), t=nodeMap.get(l.to?.node);
    assert(f && t && f!==t,'Линия должна соединять два разных устройства.');
    assert(typeof l.from.port==='string' && typeof l.to.port==='string' && own(nodePorts(f),l.from.port) && own(nodePorts(t),l.to.port),'Не найден порт устройства.');
    const a=nodePorts(f)[l.from.port], b=nodePorts(t)[l.to.port];
    assert(a.dir!=='in' && b.dir!=='out' && a.medium===b.medium && optionalText(l.label),'Порты линии несовместимы.');
    const key=JSON.stringify([f.id,l.from.port,t.id,l.to.port]);assert(!edges.has(key),'Такая связь уже есть.');edges.add(key);
  }
  checkPhysical(m,identity);
  return m;
}
function newProject(title) {return {format:'AES/2', title, boards:[], nodes:[], links:[], areas:[], cables:[]};}
function makeDemo() {
  const m=newProject('Дом и солнечная станция');
  m.boards=[
    {id:'main',tag:'ЩР-01',name:'Главный щит',location:'Первый этаж',rows:2,slots:12},
    {id:'reserve',tag:'ЩР-02',name:'Щит резерва',location:'Техническое помещение',rows:2,slots:12},
    {id:'solar',tag:'ЩП-01',name:'Солнечная станция',location:'Подпол',rows:1,slots:12}
  ];
  function add(id,kind,tag,name,rating,board=null,row=1,slot=1,width=kinds[kind][2]){
    m.nodes.push({id,kind,tag,name,rating,note:'',width,place:board?{board,row,slot}:null});
  }
  add('q1','main','QF1','Вводной автомат','2P','main',1,1);
  add('sa1','ats','SA1','Выбор источника','АВР','main',1,3);
  add('kt1','timer','KT1','Тарифное реле','24 h','main',1,6);
  add('km1','contactor','KM1','Контактор резерва','2P','main',1,8);
  add('qd1','rcd','QD1','Группа дома','2P','main',2,1);
  add('q2','breaker','QF2','Освещение','1P','main',2,3);
  add('q3','breaker','QF3','Розетки','1P','main',2,4);
  add('q4','breaker','QF4','Техника','1P','main',2,5);
  add('sa2','ats','SA2','Выбор ветви','АВР','reserve',1,1);
  add('q5','main','QF5','Вход ИБП','2P','reserve',1,4);
  add('kv1','relay','KV1','Контроль АКБ','12 V','reserve',2,1);
  add('bus','bus','X1','Узел DC','DC','solar',1,1);
  add('fu','fuse','FU1','Линия освещения','DC','solar',1,3);
  add('grid','grid','GS1','Районная сеть','AC');
  add('gen','generator','G1','Бензогенератор','AC');
  add('pv','pv','PV1','Солнечный массив','DC');
  add('mp','mppt','MP1','Контроллер MPPT','DC');
  add('bat','battery','GB1','Банк VRC 12-200','12 V');
  add('ups','ups','UPS1','ИБПС-12-3500','AC / DC');
  add('lights','loadDC','HL1','Освещение 12 В','12 V');
  add('room','load','EL1','Освещение дома','AC');
  add('socket','load','EL2','Розеточная группа','AC');
  add('appliance','load','EL3','Бытовая техника','AC');
  function wire(a,ap,b,bp) {m.links.push({id:'line'+(m.links.length+1),from:{node:a,port:ap},to:{node:b,port:bp},label:''});}
  wire('grid','out','q1','in');wire('q1','out','sa1','a');wire('gen','out','sa1','b');
  wire('sa1','out','kt1','in');wire('sa1','out','km1','in');wire('kt1','out','sa2','a');
  wire('km1','out','sa2','b');wire('kv1','out','km1','coil');wire('sa2','out','q5','in');wire('q5','out','ups','ac');
  wire('pv','out','mp','in');wire('mp','out','bus','io');wire('bat','io','bus','io');wire('bus','io','kv1','in');
  wire('bus','io','ups','dc');wire('bus','io','fu','in');wire('fu','out','lights','in');
  wire('ups','out','qd1','in');for(const [q,load] of [['q2','room'],['q3','socket'],['q4','appliance']]){wire('qd1','out',q,'in');wire(q,'out',load,'in');}
  demoPhysical(m);
  return checkModel(m);
}
