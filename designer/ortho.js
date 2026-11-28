// Geometry in drawing coordinates. Rectangles are closed for placement and open for transit:
// a lead may touch its terminal, but no segment may pass through a card interior.
const samePoint=(a,b)=>a.x===b.x&&a.y===b.y;
const parallel=(a,b)=>a.x===b.x||a.y===b.y;
function cleanPath(points){
  const result=[];
  for(const {x,y} of points){
    const last=result.at(-1);
    if(last&&samePoint(last,{x,y}))continue;
    const prev=result.at(-2);
    if(prev&&((prev.x===last.x&&x===last.x)||(prev.y===last.y&&y===last.y)))result.pop();
    result.push({x,y});
  }
  return result;
}
function segmentClear(a,b,boxes){
  if(!parallel(a,b))return false;
  const vertical=a.x===b.x;
  return !boxes.some(r=>vertical?
    a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h:
    a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w);
}
function clearPath(p,boxes){return p.length>=2&&p.every((q,i)=>!i||segmentClear(p[i-1],q,boxes));}
function overlapCard(a,b,gap=0){
  return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
}
function elbow(a,b,boxes){
  if(samePoint(a,b))return [a];
  if(parallel(a,b)&&segmentClear(a,b,boxes))return [a,b];
  for(const turn of [{x:b.x,y:a.y},{x:a.x,y:b.y}]){
    if(segmentClear(a,turn,boxes)&&segmentClear(turn,b,boxes))return [a,turn,b];
  }
  return null;
}
// A* on the horizontal and vertical corridors through padded rectangle edges.
// Direction is part of the state so bend penalties do not discard a better continuation.
function corridorPath(a,b,boxes){
  const quick=elbow(a,b,boxes);if(quick)return quick;
  const sorted=values=>Array.from(new Set(values)).sort((p,q)=>p-q);
  const xs=sorted([a.x,b.x,...boxes.flatMap(r=>[r.x,r.x+r.w])]);
  const ys=sorted([a.y,b.y,...boxes.flatMap(r=>[r.y,r.y+r.h])]);
  const heap=[],best=new Map(),parent=new Map();
  function push(v){
    let i=heap.length;heap.push(v);
    while(i){const j=(i-1)>>1;if(heap[j].f<=v.f)break;heap[i]=heap[j];i=j;}heap[i]=v;
  }
  function pop(){
    const first=heap[0],tail=heap.pop();
    if(heap.length){
      let i=0;
      while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;
        if(heap[j].f>=tail.f)break;heap[i]=heap[j];i=j;}heap[i]=tail;
    }
    return first;
  }
  function visit(i,j,dir,cost,prev){
    const key=(j*xs.length+i)*3+dir;
    if(cost>=(best.get(key)??Infinity))return;
    best.set(key,cost);parent.set(key,prev);
    push({i,j,dir,key,cost,f:cost+Math.abs(xs[i]-b.x)+Math.abs(ys[j]-b.y)});
  }
  visit(xs.indexOf(a.x),ys.indexOf(a.y),0,0,null);
  while(heap.length){
    const v=pop();if(v.cost!==best.get(v.key))continue;
    const p={x:xs[v.i],y:ys[v.j]};
    if(samePoint(p,b)){
      const path=[];
      for(let k=v.key;k!==null;k=parent.get(k)){
        const cell=Math.floor(k/3);path.push({x:xs[cell%xs.length],y:ys[Math.floor(cell/xs.length)]});
      }
      return cleanPath(path.reverse());
    }
    for(const [di,dj,dir] of [[1,0,1],[-1,0,1],[0,1,2],[0,-1,2]]){
      const i=v.i+di,j=v.j+dj;if(i<0||j<0||i>=xs.length||j>=ys.length)continue;
      const q={x:xs[i],y:ys[j]};if(!segmentClear(p,q,boxes))continue;
      visit(i,j,dir,v.cost+Math.abs(p.x-q.x)+Math.abs(p.y-q.y)+(v.dir&&v.dir!==dir?16:0),v.key);
    }
  }
  return null;
}
function orthogonalRoute(a,b,boxes,saved,lane=0){
  if(saved?.length&&samePoint(a,saved[0])&&samePoint(b,saved.at(-1))&&clearPath(saved,boxes))return saved;
  const lead=(p,d)=>({x:p.x+p.dx*d,y:p.y+p.dy*d});
  for(const margin of [9+lane%5*3,4,1]){
    const u=lead(a,margin),v=lead(b,margin);
    if(!segmentClear(a,u,boxes)||!segmentClear(b,v,boxes))continue;
    const obstacles=boxes.map(r=>({x:r.x-margin,y:r.y-margin,w:r.w+2*margin,h:r.h+2*margin}));
    const pins=(saved||[]).slice(1,-1).filter(p=>!obstacles.some(r=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h));
    const run=[a,u];let current=u,valid=true;
    for(const next of [...pins,v]){
      const part=corridorPath(current,next,obstacles);
      if(!part){valid=false;break;}run.push(...part.slice(1));current=next;
    }
    if(valid){const route=cleanPath([...run,b]);if(clearPath(route,boxes))return route;}
  }
  return saved?.length?orthogonalRoute(a,b,boxes,null,lane):[];
}
// Slide the segment perpendicular to itself. Keep both terminals fixed, inserting
// outward doglegs when the first, last, or only segment is moved.
function slideSegment(path,index,delta,boxes){
  if(!delta||index<0||index>=path.length-1)return path;
  const a=path[index],b=path[index+1],horizontal=a.y===b.y;
  const length=Math.abs(horizontal?b.x-a.x:b.y-a.y),lead=Math.min(10,length/3);
  const inset=(p,q)=>({x:p.x+Math.sign(q.x-p.x)*lead,y:p.y+Math.sign(q.y-p.y)*lead});
  const shift=p=>horizontal?{x:p.x,y:p.y+delta}:{x:p.x+delta,y:p.y};
  const first=index===0,last=index===path.length-2;
  const u=first?inset(a,b):a,v=last?inset(b,a):b;
  const points=cleanPath([...path.slice(0,index),...(first?[a,u]:[]),shift(u),shift(v),...(last?[v,b]:[]),...path.slice(index+2)]);
  return points.length<=256&&points.every(p=>p.x>=0&&p.y>=0&&p.x<=51000&&p.y<=51000)&&clearPath(points,boxes)?points:null;
}
