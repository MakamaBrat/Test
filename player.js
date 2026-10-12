/* Unity 2D Editor — Web Player. Самостоятельный рантайм для экспортированной игры (без зависимостей).
   Блоки отрисовки текста и градиента подставляются сборщиком (tools/build_player.py) из text.js и gradient.js редактора — вид идентичен. */
(()=>{
'use strict';
const TAU=Math.PI/180,PPU=100;
const rd=v=>Math.round(v*1000)/1000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const $=s=>document.querySelector(s);

/* ================= данные ================= */
let G=null,objs=[],omap=new Map(),kids=new Map(),roots=[];
const amap=new Map(),CL=new Map(),CT=new Map();
const ast=id=>amap.get(id),get=id=>omap.get(id);
const ppuOf=a=>((a&&a.parent?ast(a.parent):a)||{}).ppu||PPU;

/* ================= подставляемый код редактора ================= */
{
const DEF='"Segoe UI",Arial,sans-serif',PX=PPU;       // 1 юнит сцены = PPU пикселей текста
const mc=document.createElement('canvas').getContext('2d');

window.mkText=()=>({str:'New Text',font:null,size:32,style:'normal',lsp:1,ls:0,ha:'center',va:'middle',
  rich:true,wrap:true,trunc:true,fit:false,min:10,max:40,color:'#ffffff',alpha:1,ol:false,olc:'#000000',olw:2,w:3,h:1});

const famOf=t=>{const a=t.font!=null&&ast(t.font);return a&&a.font?`"${a.family}",${DEF}`:DEF};
const fontStr=(t,sz,b,i)=>`${i||/italic/.test(t.style)?'italic ':''}${b||/bold/.test(t.style)?'bold ':''}${sz}px ${famOf(t)}`;
const setLS=(c,t)=>{try{c.letterSpacing=(+t.ls||0)+'px'}catch(e){}};

/* ---------- Rich Text: <b> <i> <color=#rrggbb[aa] | red> <size=40 | 150%> (как в Unity) ---------- */
const NAMED={aqua:'#00ffff',black:'#000000',blue:'#0000ff',brown:'#a52a2a',cyan:'#00ffff',darkblue:'#0000a0',fuchsia:'#ff00ff',green:'#008000',grey:'#808080',gray:'#808080',
  lightblue:'#add8e6',lime:'#00ff00',magenta:'#ff00ff',maroon:'#800000',navy:'#000080',olive:'#808000',orange:'#ffa500',purple:'#800080',red:'#ff0000',silver:'#c0c0c0',teal:'#008080',white:'#ffffff',yellow:'#ffff00'};
function parseCol(v){
  v=String(v||'').trim().replace(/^["']|["']$/g,'').toLowerCase();
  if(NAMED[v])return NAMED[v];
  const m=/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);if(!m)return null;
  let h=m[1];if(h.length<=4)h=h.replace(/./g,c=>c+c);
  if(h.length==6)return'#'+h;
  return`rgba(${parseInt(h.substr(0,2),16)},${parseInt(h.substr(2,2),16)},${parseInt(h.substr(4,2),16)},${Math.round(parseInt(h.substr(6,2),16)/255*1000)/1000})`}
// строка -> [{s,st}], st = {b,i,sz,szp,col}; неизвестные/незакрытые теги остаются обычным текстом
function parseRich(src,rich){
  src=String(src==null?'':src);const base={b:false,i:false,sz:null,szp:null,col:null};
  if(!rich)return[{s:src,st:base}];
  const out=[],stack=[],re=/<(\/?)(b|i|color|size)(?:=([^<>]*))?>/iy;let cur=base,i=0,buf='';
  const flush=()=>{if(buf){out.push({s:buf,st:cur});buf=''}};
  const open=(tag,patch,len)=>{flush();stack.push({tag,prev:cur});cur={...cur,...patch};i+=len};
  while(i<src.length){
    if(src[i]=='<'){re.lastIndex=i;const m=re.exec(src);
      if(m){const tag=m[2].toLowerCase(),val=m[3],len=m[0].length;
        if(m[1]){if(val===undefined){const k=stack.map(x=>x.tag).lastIndexOf(tag);if(k>=0){flush();cur=stack[k].prev;stack.length=k;i+=len;continue}}}
        else if(tag=='b'||tag=='i'){if(val===undefined){open(tag,{[tag]:true},len);continue}}
        else if(tag=='color'){const c=val!==undefined&&parseCol(val);if(c){open(tag,{col:c},len);continue}}
        else if(val!==undefined){const n=parseFloat(val);if(n>0&&/^\s*[\d.]+\s*%?\s*$/.test(val)){open(tag,/%/.test(val)?{szp:n,sz:null}:{sz:n,szp:null},len);continue}}}}
    buf+=src[i++]}
  flush();return out}

/* ---------- раскладка (по сегментам с разным стилем) ---------- */
const LC=new WeakMap();
function layout(t){
  const key=[t.str,t.rich,t.wrap,t.fit,t.min,t.max,t.size,t.style,t.lsp,t.ls,t.w,t.h,famOf(t)].join('\u0001'),c=LC.get(t);if(c&&c.key===key)return c.r;
  const r=layout_(t);LC.set(t,{key,r});return r}
function layout_(t){
  const W=Math.max(1,t.w*PX),H=Math.max(1,t.h*PX),ls=t.lsp==null?1:+t.lsp,bs=Math.max(1,+t.size||1),runs=parseRich(t.str,t.rich!==false);
  const run=sz=>{
    const wrap=t.wrap||t.fit,k=t.fit?sz/bs:1,                       // при Best Fit размеры из <size=N> масштабируются вместе со шрифтом
      szOf=st=>st.szp!=null?sz*st.szp/100:st.sz!=null?Math.max(1,st.sz*k):sz,cache=new Map();
    const mw=(s,st)=>{const f=fontStr(t,szOf(st),st.b,st.i),key=f+'\u0001'+s;let w=cache.get(key);
      if(w===undefined){mc.font=f;setLS(mc,t);w=mc.measureText(s).width;cache.set(key,w)}return w};
    // слова (могут состоять из нескольких сегментов: Hel<b>lo</b>), пробелы и переводы строк
    const items=[];let word=null;const pushWord=()=>{if(word){items.push(word);word=null}};
    for(const r of runs){let seg='';
      const fs=()=>{if(seg){(word||(word={t:'w',segs:[]})).segs.push({s:seg,st:r.st});seg=''}};
      for(const ch of r.s){if(ch=='\r')continue;
        if(ch=='\n'){fs();pushWord();items.push({t:'nl'})}
        else if(ch==' '){fs();pushWord();items.push({t:'sp',st:r.st})}
        else seg+=ch}
      fs()}
    pushWord();
    const lines=[];let line={segs:[],w:0,wr:false};
    const add=(s,st,w)=>{const l=line.segs[line.segs.length-1];if(l&&l.st===st){l.s+=s;l.w+=w}else line.segs.push({s,st,w});line.w+=w};
    const trim=()=>{let l;while((l=line.segs[line.segs.length-1])&&!l.s.trim())line.segs.pop();if(l)l.s=l.s.replace(/ +$/,'');line.w=line.segs.reduce((a,x)=>a+mw(x.s,x.st),0)};
    const end=wr=>{trim();lines.push(line);line={segs:[],w:0,wr:!!wr}};
    for(const it of items){
      if(it.t=='nl'){end();continue}
      if(it.t=='sp'){if(!(line.wr&&!line.segs.length))add(' ',it.st,mw(' ',it.st));continue}
      const ww=it.segs.reduce((a,x)=>a+mw(x.s,x.st),0);
      if(!wrap||line.w+ww<=W+1e-6){it.segs.forEach(x=>add(x.s,x.st,mw(x.s,x.st)));continue}
      trim();if(line.segs.length)end(true);
      if(ww<=W){it.segs.forEach(x=>add(x.s,x.st,mw(x.s,x.st)));continue}
      for(const x of it.segs)for(const ch of x.s){const cw=mw(ch,x.st);if(line.segs.length&&line.w+cw>W)end(true);add(ch,x.st,cw)}}   // слишком длинное слово — по символам
    end();
    let total=0;
    lines.forEach(l=>{l.w=0;l.sz=sz;let mx=0;
      l.segs.forEach(q=>{q.w=mw(q.s,q.st);l.w+=q.w;mx=Math.max(mx,szOf(q.st))});
      if(mx)l.sz=mx;l.lh=l.sz*1.2*ls;total+=l.lh});
    return{size:sz,L:lines,total,szOf}};
  if(!t.fit)return run(bs);
  let a=Math.max(1,Math.floor(Math.min(t.min,t.max))),b=Math.max(a,Math.floor(Math.max(t.min,t.max))),best=a;
  while(a<=b){const m=(a+b)>>1,q=run(m);if(q.total<=H){best=m;a=m+1}else b=m-1}
  return run(best)}

/* ---------- рисование (вызывается из render() в локальных осях объекта, y вниз, единицы сцены) ---------- */
window.drawText=(g,t,v)=>{
  g.scale(1/PX,1/PX);                                // дальше — пиксели текста
  const W=t.w*PX,H=t.h*PX,r=layout(t);let L=r.L;
  if(!t.fit&&t.trunc){let acc=0,n=0;for(const l of L){if(acc+l.lh>H+1e-3*l.lh)break;acc+=l.lh;n++}L=L.slice(0,n)}
  if(!L.length)return;
  const block=L.reduce((a,l)=>a+l.lh,0),top=t.va=='top'?-H/2:t.va=='bottom'?H/2-block:-block/2;
  g.textAlign='left';g.textBaseline='middle';g.lineJoin='round';
  const alpha=v.alpha==null?1:v.alpha,out=t.ol&&t.olw>0;let y=top;
  for(const l of L){
    const baseY=y+l.lh/2+.35*l.sz;                   // общая базовая линия: куски разного размера выравниваются по ней
    let x=t.ha=='left'?-W/2:t.ha=='right'?W/2-l.w:-l.w/2;
    for(const q of l.segs){
      const sz=r.szOf(q.st),yy=baseY-.35*sz;
      g.font=fontStr(t,sz,q.st.b,q.st.i);setLS(g,t);g.globalAlpha=alpha;
      if(out){g.strokeStyle=t.olc;g.lineWidth=t.olw*2;g.strokeText(q.s,x,yy)}
      g.fillStyle=q.st.col||v.color||'#fff';g.fillText(q.s,x,yy);x+=q.w}
    y+=l.lh}
  g.globalAlpha=1};


}
{
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hex=h=>{h=/^#[0-9a-f]{6}$/i.test(h||'')?h:'#ffffff';return[1,3,5].map(i=>parseInt(h.substr(i,2),16))};
const rgba=(c,a)=>{const[r,g,b]=hex(c);return`rgba(${r},${g},${b},${rd(clamp(a==null?1:a,0,1))})`};

window.mkGrad=()=>({type:'linear',angle:90,w:2,h:2,alpha:1,
  stops:[{p:0,c:'#ff4081',a:.85},{p:1,c:'#3d5afe',a:.25}],
  pattern:'none',pmode:'cut',pscale:.25,pangle:0,pthick:.5,pstr:1,pcol:'#ffffff',pinv:false});

const PATTERNS=[['none','None'],['stripes','Stripes (полосы)'],['dots','Dots (точки)'],['checker','Checker (шахматка)'],['grid','Grid (сетка)'],
  ['waves','Waves (волны)'],['diamonds','Diamonds (ромбы)'],['triangles','Triangles (треугольники)'],['plus','Plus (кресты)']];

/* ---------- узоры: Path2D из НЕперекрывающихся фигур (чтобы работали Invert и even-odd) ---------- */
const pcache=new Map();
function buildPath(kind,w,h,s,ang,th){
  const R=Math.hypot(w,h)/2+s,P=new Path2D(),n=Math.ceil(R/s)+1,t=clamp(th,.05,.95);
  const rect=(x,y,a,b)=>P.rect(x,y,a,b);
  const poly=pts=>{P.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)P.lineTo(pts[i][0],pts[i][1]);P.closePath()};
  if(kind=='stripes'){for(let i=-n;i<=n;i++)rect(-R,i*s,2*R,s*t)}
  else if(kind=='dots'){const r=s*t/2;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;P.moveTo(x+r,y);P.arc(x,y,r,0,Math.PI*2)}}
  else if(kind=='checker'){for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++)if(((i+j)&1)==0)rect(i*s,j*s,s,s)}
  else if(kind=='grid'){const lw=Math.max(s*t*.5,s*.02),gap=s-lw;                     // горизонтали на всю ширину, вертикали — только между ними (без наложения)
    for(let j=-n;j<=n;j++){rect(-R,j*s,2*R,lw);for(let i=-n;i<=n;i++)rect(i*s,j*s+lw,lw,gap)}}
  else if(kind=='waves'){const amp=s*.25,step=Math.max(s/8,.004),len=Math.ceil(2*R/step);
    for(let j=-n;j<=n;j++){const y0=j*s,f=x=>y0+Math.sin(x/s*Math.PI*2)*amp,top=[],bot=[];
      for(let k=0;k<=len;k++){const x=-R+k*step;top.push([x,f(x)]);bot.push([x,f(x)+s*t])}
      poly(top.concat(bot.reverse()))}}
  else if(kind=='diamonds'){const r=s*t/2;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;poly([[x,y-r],[x+r,y],[x,y+r],[x-r,y]])}}
  else if(kind=='triangles'){const b=s*t;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;poly([[x,y-b/2],[x+b/2,y+b/2],[x-b/2,y+b/2]])}}
  else if(kind=='plus'){const a=s*t/2,c=a/3;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;
    poly([[x-c,y-a],[x+c,y-a],[x+c,y-c],[x+a,y-c],[x+a,y+c],[x+c,y+c],[x+c,y+a],[x-c,y+a],[x-c,y+c],[x-a,y+c],[x-a,y-c],[x-c,y-c]])}}
  const out=new Path2D();out.addPath(P,new DOMMatrix().rotate(ang));return out}
function patPath(G,w,h){
  // не даём создать слишком много фигур
  const R=Math.hypot(w,h)/2,s=Math.max(+G.pscale||.25,R/45),key=[G.pattern,rd(w),rd(h),rd(s),rd(+G.pangle||0),rd(G.pthick)].join('|');
  let p=pcache.get(key);
  if(!p){if(pcache.size>40)pcache.clear();p=buildPath(G.pattern,w,h,s,+G.pangle||0,G.pthick==null?.5:G.pthick);pcache.set(key,p)}
  return p}

/* ---------- заливка ---------- */
function paint(g,G,w,h){
  const st=(G.stops&&G.stops.length?G.stops.slice():[{p:0,c:'#ffffff',a:1},{p:1,c:'#ffffff',a:0}]).sort((a,b)=>a.p-b.p);
  const a=(+G.angle||0)*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a);let gr;
  if(G.type=='radial')gr=g.createRadialGradient(0,0,0,0,0,Math.max(Math.hypot(w,h)/2,1e-6));
  else if(G.type=='conic'&&g.createConicGradient)gr=g.createConicGradient(a,0,0);
  else{const L=(Math.abs(w*dx)+Math.abs(h*dy))/2;gr=g.createLinearGradient(-dx*L,-dy*L,dx*L,dy*L)}
  st.forEach(s=>gr.addColorStop(clamp(s.p,0,1),rgba(s.c,s.a)));return gr}

// вызывается из render() в локальных осях объекта (y вниз, единицы сцены)
window.drawGrad=(g,G,w,h)=>{
  const A=clamp(G.alpha==null?1:G.alpha,0,1);if(A<=0)return;
  const x=-w/2,y=-h/2,fill=paint(g,G,w,h),pat=G.pattern&&G.pattern!='none'?patPath(G,w,h):null,str=clamp(G.pstr==null?1:G.pstr,0,1);
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.fillStyle=fill;
  if(!pat){g.globalAlpha=A;g.fillRect(x,y,w,h)}
  else{
    const inv=new Path2D();inv.rect(x-1e3,y-1e3,w+2e3,h+2e3);inv.addPath(pat);        // «всё, кроме узора» (even-odd)
    const inside=G.pinv?inv:pat,outside=G.pinv?pat:inv;
    if(G.pmode=='over'){                                                                // узор поверх градиента
      g.globalAlpha=A;g.fillRect(x,y,w,h);
      g.globalAlpha=A*str;g.fillStyle=G.pcol||'#ffffff';g.fill(inside,G.pinv?'evenodd':'nonzero')}
    else{                                                                               // градиент проступает сквозь узор
      g.save();g.clip(inside,G.pinv?'evenodd':'nonzero');g.globalAlpha=A;g.fillRect(x,y,w,h);g.restore();
      if(str<1){g.save();g.clip(outside,G.pinv?'nonzero':'evenodd');g.globalAlpha=A*(1-str);g.fillRect(x,y,w,h);g.restore()}}}
  g.restore();g.globalAlpha=1};


}

/* ================= матрицы (как в редакторе) ================= */
const locM=o=>{const c=Math.cos(o.r*TAU),s=Math.sin(o.r*TAU),rx=(o.rx||0)*TAU,ry=(o.ry||0)*TAU,cx=Math.cos(rx),cy=Math.cos(ry),k=Math.sin(rx)*Math.sin(ry);
  return[c*cy*o.sx-s*k*o.sx,s*cy*o.sx+c*k*o.sx,-s*cx*o.sy,c*cx*o.sy,o.x,o.y]};
const mulM=(P,L)=>[P[0]*L[0]+P[2]*L[1],P[1]*L[0]+P[3]*L[1],P[0]*L[2]+P[2]*L[3],P[1]*L[2]+P[3]*L[3],P[0]*L[4]+P[2]*L[5]+P[4],P[1]*L[4]+P[3]*L[5]+P[5]];
const invM=M=>{const det=M[0]*M[3]-M[1]*M[2];if(Math.abs(det)<1e-12)return null;const a=M[3]/det,b=-M[1]/det,c=-M[2]/det,d=M[0]/det;return[a,b,c,d,-(a*M[4]+c*M[5]),-(b*M[4]+d*M[5])]};
const apM=(M,x,y)=>({x:M[0]*x+M[2]*y+M[4],y:M[1]*x+M[3]*y+M[5]});
function wmat(o,dep){dep=dep||0;const p=o.parent!=null&&dep<64?get(o.parent):null;return p?mulM(wmat(p,dep+1),locM(o)):locM(o)}
const worldPos=o=>{const M=wmat(o);return{x:M[4],y:M[5]}};
function toLocal(o,wx,wy){const p=o.parent!=null?get(o.parent):null;if(!p)return{x:wx,y:wy};const I=invM(wmat(p));return I?apM(I,wx,wy):{x:wx,y:wy}}
function order(){const out=[],seen=new Set();
  const walk=(o,act,PM)=>{if(seen.has(o.id))return;seen.add(o.id);const on=act&&o.active!==false,M=PM?mulM(PM,locM(o)):locM(o);out.push({o,on,M});const k=kids.get(o.id);if(k)for(const c of k)walk(c,on,M)};
  for(const o of roots)walk(o,true,null);return out}
function subtree(id){const r=[],st=[id],seen=new Set();while(st.length){const i=st.pop();if(seen.has(i))continue;seen.add(i);const o=get(i);if(!o)continue;r.push(o);const k=kids.get(i);if(k)for(const c of k)st.push(c.id)}return r}
function size(o,im){im=im||o.img;
  if(!o.img&&!o.text&&o.grad)return[Math.max(.01,o.grad.w),Math.max(.01,o.grad.h)];
  if(!o.img&&o.text)return[Math.max(.01,o.text.w),Math.max(.01,o.text.h)];
  const a=im&&im.sprite&&ast(im.sprite);return a&&a.img?[a.img.width/ppuOf(a),a.img.height/ppuOf(a)]:im?[1,1]:[.3,.3]}

/* ================= свойства (анимация пишет сюда) ================= */
const gim=o=>o.img||o.text||o.grad;
const pget=(o,k)=>k=='sprite'?(o.img?o.img.sprite:undefined):k=='color'||k=='alpha'?(gim(o)?gim(o)[k]:undefined):(k=='rx'||k=='ry')?(o[k]||0):o[k];
const pset=(o,k,v)=>{if(k=='sprite'){if(o.img)o.img.sprite=v}else if(k=='color'||k=='alpha'){if(gim(o))gim(o)[k]=v}else o[k]=v};

/* ================= тонированные спрайты (кэш ограничен) ================= */
const tc=new Map();
function tint(a,col){if(col=='#ffffff')return a.img;const k=a.id+col;let c=tc.get(k);if(c)return c;
  if(tc.size>96)tc.clear();
  c=document.createElement('canvas');c.width=a.img.width;c.height=a.img.height;const x=c.getContext('2d');x.drawImage(a.img,0,0);
  x.globalCompositeOperation='multiply';x.fillStyle=col;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='destination-in';x.drawImage(a.img,0,0);tc.set(k,c);return c}

/* ================= Animator (порт логики редактора) ================= */
const EPS=5e-4;let C=null,RMAP=null;
const base=new Map();
const colHex=h=>/^#[0-9a-f]{6}$/i.test(h||'')?h:'#ffffff';
const rgb=h=>{h=colHex(h);return[1,3,5].map(i=>parseInt(h.substr(i,2),16))};
const lerpCol=(a,b,u)=>{const A=rgb(a),B=rgb(b);return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*u).toString(16).padStart(2,'0')).join('')};
const clipOf=s=>s&&s.clip!=null?CL.get(s.clip):null;
const def=()=>{const t=C.tr.find(t=>t.f=='entry');return t&&t.t};
const nd=id=>C.st.find(n=>n.id==id);
function evalTrack(tr,t){
  const K=tr.keys;if(!K.length)return undefined;
  if(t<=K[0].t)return K[0].v;
  const L=K[K.length-1];if(t>=L.t)return L.v;
  let i=0;while(K[i+1].t<=t)i++;
  const a=K[i],b=K[i+1];
  if(tr.k=='sprite'||a.i=='c')return a.v;
  let u=(t-a.t)/(b.t-a.t);if(a.i=='s')u=u*u*(3-2*u);
  return tr.k=='color'?lerpCol(a.v,b.v,u):a.v+(b.v-a.v)*u}
const splitK=key=>{const i=key.indexOf('.');return{o:get(+key.slice(0,i)),k:key.slice(i+1)}};
function put(o,k,v){const cu=pget(o,k);if(cu===undefined||v===undefined||(typeof v=='number'&&isNaN(v)))return;
  const key=o.id+'.'+k;if(!base.has(key))base.set(key,cu);pset(o,k,k=='alpha'?clamp(v,0,1):v)}
function poseOfClip(c,t){const m=new Map();c.tracks.forEach(tr=>{let oid=tr.o;if(RMAP){const r=RMAP.get(tr.o);if(r!==undefined)oid=r;if(oid<0)return}
  const v=evalTrack(tr,t);if(v!==undefined)m.set(oid+'.'+tr.k,v)});return m}
const clipT=(c,el)=>c.loop?(c.len>0?((el%c.len)+c.len)%c.len:0):clamp(el,0,c.len);
const poseOf=(s,el)=>{const c=clipOf(s);return c?poseOfClip(c,clipT(c,el)):new Map()};
const mix=(k,a,b,w)=>k=='sprite'?(w<.5?a:b):k=='color'?lerpCol(a,b,w):a+(b-a)*w;
function applyPose(A,B,w,own){
  const keys=new Set(A.keys());if(B)B.forEach((_,k)=>keys.add(k));
  keys.forEach(key=>{const{o,k}=splitK(key);if(!o)return;let v=A.get(key);
    if(B){let b=B.get(key);const d=()=>base.has(key)?base.get(key):pget(o,k);
      if(v===undefined)v=d();if(b===undefined)b=d();if(v===undefined||b===undefined)return;v=mix(k,v,b,w)}
    put(o,k,v)});
  own.forEach(key=>{if(keys.has(key))return;own.delete(key);const{o,k}=splitK(key);if(o&&base.has(key))pset(o,k,base.get(key))});
  keys.forEach(key=>own.add(key))}
const chk=c=>{const p=C.pa.find(p=>p.name==c.p);if(!p)return false;if(p.type=='Trigger')return !!p.val;const a=p.type=='Bool'?+!!p.val:+p.val,b=+c.v;return c.op=='>'?a>b:c.op=='<'?a<b:c.op=='=='?a==b:a!=b};
const spd=s=>s.sp==null?1:s.sp;
const stEl=(s,t0,now)=>(now-t0)/1000*spd(s);
const stLen=s=>{const c=clipOf(s);return c?Math.max(c.len,.001):1};
function tickP(p,now){
  let s=nd(p.cur);if(!s)return false;
  if(p.x){const x=p.x,d=nd(x.to);
    if(!d)p.x=null;
    else{const w=x.du>0?(now-x.t0)/1000/x.du:1;
      if(w<1){applyPose(poseOf(s,stEl(s,p.t0,now)),poseOf(d,stEl(d,x.t0,now)),w,p.own);
        const nt=stEl(s,p.t0,now)/stLen(s),c=clipOf(s);p.p=c&&c.loop?((nt%1)+1)%1:clamp(nt,0,1);p.w=w;return true}
      p.cur=x.to;p.t0=x.t0;p.x=null;s=d}}
  p.w=0;
  const el=stEl(s,p.t0,now),nt=el/stLen(s),c=clipOf(s);
  p.p=c&&c.loop?((nt%1)+1)%1:clamp(nt,0,1);
  const ok=t=>{const hasEx=t.hx||!t.cd.length;return(!hasEx||nt>=(t.ex==null?1:t.ex))&&(!t.cd.length||t.cd.every(chk))};
  const t=C.tr.find(t=>t.f!='entry'&&(t.f==p.cur||t.f=='any')&&t.t!=p.cur&&ok(t));
  applyPose(poseOf(s,el),null,0,p.own);
  if(t){t.cd.forEach(c=>{const q=C.pa.find(q=>q.name==c.p);if(q&&q.type=='Trigger')q.val=false});
    const dest=t.t=='exit'?def():t.t;
    if(dest){if(t.du>0)p.x={to:dest,t0:now,du:t.du};else{p.cur=dest;p.t0=now}}}
  return true}
// контроллер может быть вложен под объектом-владельцем: клипы переназначаются на детей владельца по пути в иерархии
const childrenOf=o=>kids.get(o.id)||[];
function rootOf(t,ctlId){for(let o=get(t),g=0;o&&g<64;g++,o=o.parent!=null?get(o.parent):null)if(o.animator&&o.animator.ctl==ctlId)return o;return null}
function pathUnder(root,t){const p=[];let o=get(t),g=0;
  while(o&&o!==root&&g++<64){const par=o.parent!=null?get(o.parent):null;if(!par)return null;p.unshift(childrenOf(par).indexOf(o));o=par}
  return o===root?p:null}
function walkPath(root,p){let o=root;for(const i of p){o=childrenOf(o)[i];if(!o)return null}return o}
function buildRemap(ctl,ownerId){
  const owner=get(ownerId);if(!owner)return null;
  const ids=new Set();ctl.st.forEach(s=>{const c=clipOf(s);if(c)c.tracks.forEach(tr=>{if(get(tr.o))ids.add(tr.o)})});
  if(!ids.size)return null;
  const mine=new Set(subtree(ownerId).map(o=>o.id));
  for(const t of ids)if(mine.has(t))return null;
  const m=new Map();
  ids.forEach(t=>{const r=rootOf(t,ctl.id);if(!r||r===owner)return;
    const path=pathUnder(r,t),x=path&&walkPath(owner,path);m.set(t,x?x.id:-1)});
  return m.size?m:null}
function rtMake(ctl,owner){
  const view={st:ctl.st,tr:ctl.tr,pa:ctl.pa.map(q=>({name:q.name,type:q.type,val:q.type=='Trigger'?false:q.val}))};
  const prev=C;C=view;let d;try{d=def()}finally{C=prev}
  if(!d&&ctl.st.length)d=(ctl.st.find(s=>clipOf(s))||ctl.st[0]).id;
  return{ctl,view,cur:d||null,t0:performance.now(),p:0,x:null,w:0,own:new Set(),map:owner!=null?buildRemap(ctl,owner):null}}
function rtTick(p,now){if(!p.cur)return true;const prev=C,pm=RMAP;C=p.view;RMAP=p.map||null;try{return tickP(p,now)}finally{C=prev;RMAP=pm}}
function rtPlay(p,name){
  const s=p.view.st.find(s=>s.name==name)||p.view.st.find(s=>{const c=clipOf(s);return c&&c.name==name});
  if(!s)return false;p.cur=s.id;p.t0=performance.now();p.x=null;p.w=0;return true}
function rtSet(p,name,val){const q=p.view.pa.find(q=>q.name==name);if(!q)return false;
  q.val=q.type=='Trigger'?true:q.type=='Bool'?!!val:q.type=='Int'?Math.round(+val||0):(+val||0);return true}

/* ================= состояние выполнения ================= */
const run={pl:new Map(),hover:null,down:null};
const ctlOf=t=>t&&t.animator?CT.get(t.animator.ctl):null;
function player(o){
  if(o.active===false||!o.animator)return null;const ctl=ctlOf(o);if(!ctl)return null;
  let p=run.pl.get(o.id);if(!p||p.ctl!==ctl){p=rtMake(ctl,o.id);run.pl.set(o.id,p)}return p}
const setWorld=(o,wx,wy)=>{const L=toLocal(o,wx,wy);o.x=rd(L.x);o.y=rd(L.y)};
const MTH={
 'go.active':(o,a)=>{o.active=!!a[0]},
 'go.toggle':o=>{o.active=o.active===false},
 'tf.setpos':(o,a)=>setWorld(o,+a[0]||0,+a[1]||0),
 'tf.move':(o,a)=>{const w=worldPos(o);setWorld(o,w.x+(+a[0]||0),w.y+(+a[1]||0))},
 'tf.setrot':(o,a)=>{o.r=+a[0]||0},
 'tf.setrot3':(o,a)=>{o.rx=+a[0]||0;o.ry=+a[1]||0;o.r=+a[2]||0},
 'tf.rot3':(o,a)=>{o.rx=rd((o.rx||0)+(+a[0]||0));o.ry=rd((o.ry||0)+(+a[1]||0));o.r=rd(o.r+(+a[2]||0))},
 'tf.rot':(o,a)=>{o.r=rd(o.r+(+a[0]||0))},
 'tf.setscale':(o,a)=>{o.sx=+a[0]||0;o.sy=+a[1]||0},
 'img.color':(o,a)=>{if(o.img)o.img.color=a[0]||'#ffffff'},
 'img.alpha':(o,a)=>{if(o.img)o.img.alpha=Math.max(0,Math.min(1,+a[0]||0))},
 'img.sprite':(o,a)=>{if(o.img)o.img.sprite=a[0]==null?null:a[0]},
 'an.play':(o,a)=>{const p=player(o);if(p&&a[0])rtPlay(p,a[0])},
 'an.trig':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],true)},
 'an.bool':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],!!a[1])},
 'an.float':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],a[1])},
 'an.int':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],a[1])},
 'mc.open':(o,a)=>mcOpen(o,+a[0]||0),
 'mc.close':o=>mcClose(o),
 'btn.inter':(o,a)=>{if(o.btn)o.btn.interactable=!!a[0]}};
function exec(E){const t=get(E.t),m=MTH[E.m];if(!t||!m)return;try{m(t,E.a||[])}catch(err){console.warn('OnClick:',err)}}
/* ================= MenuController: массив окон + массив кнопок (как в редакторе, menu.js) ================= */
const mcNorm=M=>{if(!Array.isArray(M.wins))M.wins=[];if(!Array.isArray(M.btns))M.btns=[];return M};
const mcIds=M=>{const s=new Set();M.wins.forEach(id=>{if(get(id))subtree(id).forEach(x=>s.add(x.id))});return s};
function mcReset(ids){   // исходные позы + остановка Animator'ов: анимации окон играются заново, как в первый раз
  base.forEach((bv,key)=>{const i=key.indexOf('.'),oid=+key.slice(0,i);if(!ids.has(oid))return;const x=get(oid);if(x)pset(x,key.slice(i+1),bv);base.delete(key)});
  ids.forEach(id=>run.pl.delete(id))}
function mcOpen(o,idx){const M=o&&o.menu;if(!M)return;mcNorm(M);idx=Math.round(+idx);
  const t=get(M.wins[idx]);if(!t){console.warn('MenuController: нет окна с индексом',idx);return}
  mcReset(mcIds(M));M.wins.forEach(id=>{const w=get(id);if(w)w.active=false});t.active=true}
function mcClose(o){const M=o&&o.menu;if(!M)return;mcNorm(M);mcReset(mcIds(M));M.wins.forEach(id=>{const w=get(id);if(w)w.active=false})}
const mcClick=b=>{for(const m of objs){const M=m.menu;if(!M)continue;mcNorm(M);M.btns.forEach((id,i)=>{if(id===b.id)mcOpen(m,i)})}};
const fire=o=>{if(!o.btn||o.btn.interactable===false)return;(o.btn.onClick||[]).slice().forEach(exec);mcClick(o)};

/* ================= Button: вид и попадание ================= */
const mulCol=(a,b)=>{const p=h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16)),A=p(a),B=p(b);return'#'+A.map((v,i)=>Math.round(v*B[i]/255).toString(16).padStart(2,'0')).join('')};
function btnView(o){
  const im=o.img||o.text,b=o.btn;if(!im||!b||b.trans=='none')return im;
  const s=b.interactable===false?'dis':(run.down==o.id&&run.hover==o.id)?'pr':run.hover==o.id?'hi':'nm';
  if(s=='nm')return im;
  if(!o.img)return b.trans=='tint'?Object.assign({},im,{color:mulCol(im.color,b.tint[s]),alpha:s=='dis'?im.alpha*.5:im.alpha}):im;
  if(b.trans=='sprite')return ast(b[s])?Object.assign({},im,{sprite:b[s]}):im;
  return Object.assign({},im,{color:mulCol(im.color,b.tint[s]),alpha:s=='dis'?im.alpha*.5:im.alpha})}
function rayHit(w){const L=order();
  for(let i=L.length-1;i>=0;i--){const{o,on,M}=L[i];if(!on||!(o.img||o.text||o.grad))continue;
    const I=invM(M);if(!I)continue;const p=apM(I,w.x,w.y),[sw,sh]=size(o,o.img?btnView(o):null);
    if(Math.abs(p.x)<=sw/2&&Math.abs(p.y)<=sh/2)return o}
  return null}
const handler=o=>{for(let q=o,n=0;q&&n<64;q=q.parent!=null?get(q.parent):null,n++)if(q.btn)return q;return null};
const live=o=>o&&o.btn&&o.btn.interactable!==false;

/* ================= вид и отрисовка ================= */
const cvs=$('#c'),g=cvs.getContext('2d');
let view={x:0,y:0,w:8,h:4.5,mode:'height',bg:'#222222'},cam={x:0,y:0,z:100},CW=0,CH=0,DPR=1,clipRect=null;
function layoutView(){
  CW=innerWidth;CH=innerHeight;DPR=Math.min(devicePixelRatio||1,view.dpr>0?view.dpr:2);
  const pw=Math.round(CW*DPR),ph=Math.round(CH*DPR);if(cvs.width!=pw||cvs.height!=ph){cvs.width=pw;cvs.height=ph}
  /* режимы JS Screen: fit / pixel (целый зум) — с полями; expand — без полей, видно всё; cover — заполняет экран; width / height — по стороне */
  let z;const m=view.mode;
  if(m=='fit'||m=='pixel'||m=='expand')z=Math.min(CW/view.w,CH/view.h);else if(m=='cover')z=Math.max(CW/view.w,CH/view.h);else if(m=='width')z=CW/view.w;else z=CH/view.h;
  if(view.maxScale>0)z=Math.min(z,view.maxScale*PPU);
  if(m=='pixel'){const f=z/PPU;z=(f>=1?Math.floor(f):f)*PPU}
  cam={x:view.x,y:view.y,z};
  clipRect=m=='fit'||m=='pixel'?{x:CW/2-view.w*z/2,y:CH/2-view.h*z/2,w:view.w*z,h:view.h*z}:null;
  orientCheck()}
/* подсказка «Поверните устройство», если JS Screen требует другую ориентацию */
let rotEl=null;
function orientCheck(){const o=view.orient;
  if(o!='landscape'&&o!='portrait'){if(rotEl)rotEl.style.display='none';return}
  if(!rotEl){rotEl=document.createElement('div');
    rotEl.style.cssText='position:fixed;inset:0;z-index:5;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:'+(view.bgOuter||'#000')+';color:#ddd;font:16px system-ui,sans-serif;text-align:center;padding:24px';
    rotEl.innerHTML='<div style="font-size:48px">\u27F3</div><div>Поверните устройство</div>';document.body.appendChild(rotEl)}
  rotEl.style.display=(o=='landscape'&&CH>CW)||(o=='portrait'&&CW>CH)?'flex':'none'}
const toWorld=e=>{const r=cvs.getBoundingClientRect();return{x:(e.clientX-r.left-CW/2)/cam.z+cam.x,y:-(e.clientY-r.top-CH/2)/cam.z+cam.y}};
function render(){
  g.setTransform(DPR,0,0,DPR,0,0);g.imageSmoothingEnabled=view.smooth!==false;if(view.smooth!==false)g.imageSmoothingQuality='high';
  g.fillStyle=view.bgOuter||'#000';g.fillRect(0,0,CW,CH);
  g.save();if(clipRect){g.beginPath();g.rect(clipRect.x,clipRect.y,clipRect.w,clipRect.h);g.clip()}
  g.fillStyle=view.bg;g.fillRect(0,0,CW,CH);
  const sx=x=>(x-cam.x)*cam.z+CW/2,sy=y=>CH/2-(y-cam.y)*cam.z;
  for(const{o,on,M}of order()){if(!on)continue;
    const im=btnView(o),[w,h]=size(o,o.img?im:null);
    const hw=w/2,hh=h/2,ax=Math.abs(M[0])*hw+Math.abs(M[2])*hh,ay=Math.abs(M[1])*hw+Math.abs(M[3])*hh,px=sx(M[4]),py=sy(M[5]);
    if(px+ax*cam.z<-8||px-ax*cam.z>CW+8||py+ay*cam.z<-8||py-ay*cam.z>CH+8)continue;
    g.save();g.transform(M[0]*cam.z,-M[1]*cam.z,M[2]*cam.z,-M[3]*cam.z,px,py);g.scale(1,-1);
    if(o.img&&im){g.globalAlpha=im.alpha;const a=im.sprite&&ast(im.sprite);if(a&&a.img)g.drawImage(tint(a,im.color),-w/2,-h/2,w,h);else{g.fillStyle=im.color;g.fillRect(-w/2,-h/2,w,h)}g.globalAlpha=1}
    else if(o.text&&im)window.drawText(g,o.text,im);
    else if(o.grad)window.drawGrad(g,o.grad,w,h);
    g.restore()}
  g.restore()}
function frame(){
  const now=performance.now();
  for(const{o,on}of order()){if(!on){run.pl.delete(o.id);continue}if(!o.animator)continue;const p=player(o);if(!p){run.pl.delete(o.id);continue}if(!rtTick(p,now))run.pl.delete(o.id)}
  render();requestAnimationFrame(frame)}

/* ================= ввод (мышь и касания) ================= */
function bindInput(){
  cvs.addEventListener('pointerdown',e=>{if(e.button)return;cvs.setPointerCapture&&cvs.setPointerCapture(e.pointerId);
    const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;run.down=live(o)?o.id:null;e.preventDefault()});
  cvs.addEventListener('pointermove',e=>{if(e.pointerType!='mouse'&&run.down==null)return;const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;cvs.style.cursor=live(o)?'pointer':''});
  const up=e=>{const id=run.down;run.down=null;
    if(id!=null){const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;if(o&&o.id==id)fire(o)}
    if(e.pointerType!='mouse')run.hover=null};
  cvs.addEventListener('pointerup',up);
  cvs.addEventListener('pointercancel',()=>{run.down=null;run.hover=null});
  cvs.addEventListener('pointerleave',e=>{if(e.pointerType=='mouse')run.hover=null});
  cvs.addEventListener('contextmenu',e=>e.preventDefault());
  // вкладка была скрыта — сдвигаем таймеры анимации, чтобы они не «перескакивали»
  let hid=0;document.addEventListener('visibilitychange',()=>{if(document.hidden)hid=performance.now();else if(hid){const d=performance.now()-hid;hid=0;run.pl.forEach(p=>{p.t0+=d;if(p.x)p.x.t0+=d})}});
  addEventListener('resize',layoutView)}

/* ================= загрузка ================= */
const loadImg=url=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=url});
async function boot(){
  const bar=$('#bar'),msg=$('#msg');
  let r;try{r=await fetch('game.json',{cache:'no-cache'});G=await r.json()}catch(e){msg.textContent='Не удалось загрузить game.json';return}
  document.title=G.title||'Game';view=Object.assign(view,G.view||{});
  document.body.style.background=view.bgOuter||'#000';
  objs=G.objects||[];objs.forEach(o=>omap.set(o.id,o));
  objs.forEach(o=>{if(o.parent!=null&&omap.has(o.parent)){let a=kids.get(o.parent);if(!a)kids.set(o.parent,a=[]);a.push(o)}else roots.push(o)});
  (G.clips||[]).forEach(c=>CL.set(c.id,c));(G.ctls||[]).forEach(k=>CT.set(k.id,k));
  const files=(G.assets||[]).filter(a=>a.file),total=files.length||1;let done=0;const tick=()=>{bar.style.width=Math.round(++done/total*100)+'%'};
  await Promise.all(files.map(async a=>{
    if(a.font){try{const ff=new FontFace('U2DFont'+a.id,'url('+a.file+')');await ff.load();document.fonts.add(ff);amap.set(a.id,{id:a.id,name:a.name,font:true,family:'U2DFont'+a.id})}catch(e){console.warn('font',a.name,e)}}
    else{const img=await loadImg(a.file);if(img)amap.set(a.id,{id:a.id,name:a.name,img,ppu:a.ppu||PPU,mode:a.mode||'single',sprites:a.sprites||[]});else console.warn('image',a.name)}
    tick()}));
  (G.assets||[]).filter(a=>a.parent).forEach(m=>{const p=amap.get(m.parent);if(!p)return;const rc=m.rect,c=document.createElement('canvas');c.width=rc.w;c.height=rc.h;
    c.getContext('2d').drawImage(p.img,rc.x,rc.y,rc.w,rc.h,0,0,rc.w,rc.h);amap.set(m.id,{id:m.id,parent:m.parent,rect:rc,img:c})});
  layoutView();bindInput();$('#load').style.display='none';
  const fs=$('#fs');if(fs&&view.fs!==false&&document.documentElement.requestFullscreen){fs.style.display='block';
    fs.onclick=()=>{if(document.fullscreenElement){document.exitFullscreen();return}
      document.documentElement.requestFullscreen().then(()=>{const o=view.orient;if((o=='landscape'||o=='portrait')&&screen.orientation&&screen.orientation.lock)screen.orientation.lock(o).catch(()=>{})}).catch(()=>{})}}
  window.__game={objs,run,order,get,fire,rayHit,handler,cam:()=>cam};
  requestAnimationFrame(frame)}
boot();
})();
