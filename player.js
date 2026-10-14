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
const pureMask=o=>!!(!o.img&&!o.text&&!o.grad&&!o.screen&&!o.scrollv&&(o.mask||o.layout));
const locM=o=>{const nsc=pureMask(o),X=nsc?1:o.sx,Y=nsc?1:o.sy,c=Math.cos(o.r*TAU),s=Math.sin(o.r*TAU),rx=(o.rx||0)*TAU,ry=(o.ry||0)*TAU,cx=Math.cos(rx),cy=Math.cos(ry),k=Math.sin(rx)*Math.sin(ry);
  return[c*cy*X-s*k*X,s*cy*X+c*k*X,-s*cx*Y,c*cx*Y,o.x,o.y]};
const mulM=(P,L)=>[P[0]*L[0]+P[2]*L[1],P[1]*L[0]+P[3]*L[1],P[0]*L[2]+P[2]*L[3],P[1]*L[2]+P[3]*L[3],P[0]*L[4]+P[2]*L[5]+P[4],P[1]*L[4]+P[3]*L[5]+P[5]];
const invM=M=>{const det=M[0]*M[3]-M[1]*M[2];if(Math.abs(det)<1e-12)return null;const a=M[3]/det,b=-M[1]/det,c=-M[2]/det,d=M[0]/det;return[a,b,c,d,-(a*M[4]+c*M[5]),-(b*M[4]+d*M[5])]};
const apM=(M,x,y)=>({x:M[0]*x+M[2]*y+M[4],y:M[1]*x+M[3]*y+M[5]});
function wmat(o,dep){dep=dep||0;const p=o.parent!=null&&dep<64?get(o.parent):null;return p?mulM(wmat(p,dep+1),locM(o)):locM(o)}
const worldPos=o=>{const M=wmat(o);return{x:M[4],y:M[5]}};
function toLocal(o,wx,wy){const p=o.parent!=null?get(o.parent):null;if(!p)return{x:wx,y:wy};const I=invM(wmat(p));return I?apM(I,wx,wy):{x:wx,y:wy}}
function order(){const out=[],seen=new Set();
  const walk=(o,d,act,PM)=>{if(seen.has(o.id))return;seen.add(o.id);const on=act&&o.active!==false,M=PM?mulM(PM,locM(o)):locM(o);out.push({o,d,on,M});const k=kids.get(o.id);if(k)for(const c of k)walk(c,d+1,on,M)};
  for(const o of roots)walk(o,0,true,null);return out}
function subtree(id){const r=[],st=[id],seen=new Set();while(st.length){const i=st.pop();if(seen.has(i))continue;seen.add(i);const o=get(i);if(!o)continue;r.push(o);const k=kids.get(i);if(k)for(const c of k)st.push(c.id)}return r}
function size(o,im){im=im||o.img;if(o.scrollv&&!o.img&&!o.text&&!o.grad)return[Math.max(.1,+o.scrollv.vw||3),Math.max(.1,+o.scrollv.vh||4)];{const r=!o.img&&!o.text&&!o.grad&&(o.mask||o.layout);if(r)return[Math.max(.1,+r.w||3),Math.max(.1,+r.h||3)]}
  if(!o.img&&!o.text&&o.grad)return[Math.max(.01,o.grad.w),Math.max(.01,o.grad.h)];
  if(!o.img&&o.text)return[Math.max(.01,o.text.w),Math.max(.01,o.text.h)];
  const a=im&&im.sprite&&ast(im.sprite);return a&&a.img?[a.img.width/ppuOf(a),a.img.height/ppuOf(a)]:im?[1,1]:[.3,.3]}

/* ================= свойства (анимация пишет сюда) ================= */
const gim=o=>o.img||o.text||o.grad;
const pget=(o,k)=>k=='sprite'?(o.img?o.img.sprite:undefined):k=='fill'?(o.img?(o.img.fa==null?1:o.img.fa):undefined):k=='color'||k=='alpha'?(gim(o)?gim(o)[k]:undefined):(k=='rx'||k=='ry')?(o[k]||0):o[k];
const pset=(o,k,v)=>{if(k=='fill'){if(o.img)o.img.fa=v}else if(k=='sprite'){if(o.img)o.img.sprite=v}else if(k=='color'||k=='alpha'){if(gim(o))gim(o)[k]=v}else o[k]=v};

/* ================= тонированные спрайты (кэш ограничен) ================= */
const tc=new Map();
function tint(a,col){if(col=='#ffffff')return a.img;const k=a.id+col;let c=tc.get(k);if(c)return c;
  if(tc.size>96)tc.clear();
  c=document.createElement('canvas');c.width=a.img.width;c.height=a.img.height;const x=c.getContext('2d');x.drawImage(a.img,0,0);
  x.globalCompositeOperation='multiply';x.fillStyle=col;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='destination-in';x.drawImage(a.img,0,0);tc.set(k,c);return c}

/* ================= Image: Simple / Filled (общий код с редактором: imgfill.js) ================= */
/*IMGFILL-BEGIN*/
const FILL_OR={h:['Left','Right'],v:['Bottom','Top'],r90:['Bottom Left','Top Left','Top Right','Bottom Right'],r180:['Bottom','Left','Top','Right'],r360:['Bottom','Right','Top','Left']};
/* Область заливки в локальных координатах объекта (ось Y вниз, прямоугольник −w/2…w/2 × −h/2…h/2) → clip.
   false — заливать нечего (Fill Amount = 0). Радиальные: «клин» от точки-источника, обрезается самой картинкой. */
function fillClip(gx,w,h,im){
  const a=Math.max(0,Math.min(1,im.fa==null?1:im.fa)),m=FILL_OR[im.fm]?im.fm:'h',n=FILL_OR[m].length,o=(im.fo|0)>=0&&(im.fo|0)<n?(im.fo|0):0,cw=im.fc!==false,hw=w/2,hh=h/2;
  if(a<=0)return false;
  gx.beginPath();
  if(a>=1){gx.rect(-hw,-hh,w,h);gx.clip();return true}
  if(m=='h'){const q=w*a;o?gx.rect(hw-q,-hh,q,h):gx.rect(-hw,-hh,q,h)}
  else if(m=='v'){const q=h*a;o?gx.rect(-hw,-hh,w,q):gx.rect(-hw,hh-q,w,q)}
  else{
    // углы на экране: 0° — вправо, 90° — вниз, угол растёт по часовой стрелке
    let ox,oy,t0,rg;
    if(m=='r90'){[ox,oy]=[[-hw,hh],[-hw,-hh],[hw,-hh],[hw,hh]][o];t0=[-90,0,90,180][o];rg=90}
    else if(m=='r180'){[ox,oy]=[[0,hh],[-hw,0],[0,-hh],[hw,0]][o];t0=[180,-90,0,90][o];rg=180}
    else{ox=oy=0;t0=[90,0,-90,180][o];rg=360}
    if(!cw&&m!='r360')t0+=rg;                      // против часовой: начинаем с другого ребра сектора
    const D=Math.PI/180,R=Math.hypot(w,h)*2,s0=t0*D,s1=s0+(cw?1:-1)*a*rg*D;
    gx.moveTo(ox,oy);gx.lineTo(ox+Math.cos(s0)*R,oy+Math.sin(s0)*R);gx.arc(ox,oy,R,s0,s1,!cw);gx.closePath()}
  gx.clip();return true}
/* Нарисовать Image (Simple или Filled) в локальных координатах объекта */
function drawImg(gx,im,w,h){
  const a=im.sprite&&ast(im.sprite),fl=im.type=='filled';
  if(fl){gx.save();if(!fillClip(gx,w,h,im)){gx.restore();return}}
  gx.globalAlpha=im.alpha;
  if(a&&a.img)gx.drawImage(tint(a,im.color),-w/2,-h/2,w,h);else{gx.fillStyle=im.color;gx.fillRect(-w/2,-h/2,w,h)}
  gx.globalAlpha=1;if(fl)gx.restore()}
/*IMGFILL-END*/

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
 'img.fill':(o,a)=>{if(o.img)o.img.fa=Math.max(0,Math.min(1,+a[0]||0))},
 'img.sprite':(o,a)=>{if(o.img)o.img.sprite=a[0]==null?null:a[0]},
 'an.play':(o,a)=>{const p=player(o);if(p&&a[0])rtPlay(p,a[0])},
 'an.trig':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],true)},
 'an.bool':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],!!a[1])},
 'an.float':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],a[1])},
 'an.int':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],a[1])},
 'mc.open':(o,a)=>mcOpen(o,+a[0]||0),
 'mc.close':o=>mcClose(o),
 'btn.inter':(o,a)=>{if(o.btn)o.btn.interactable=!!a[0]},
 'sv.to':(o,a)=>SV.to(o,+a[0]||0,+a[1]||0,+a[2]||0),
 'sv.start':(o,a)=>SV.start(o,+a[0]||0),
 'sv.end':(o,a)=>SV.end(o,+a[0]||0),
 'sv.item':(o,a)=>SV.item(o,+a[0]||0,+a[1]||0),
 'sv.on':(o,a)=>SV.setOn(o,!!a[0]),
 'ps.play':o=>PFX.play(o),
 'ps.stop':o=>PFX.stop(o),
 'ps.burst':(o,a)=>PFX.burst(o,+a[0]||0),
 'ps.clear':o=>PFX.clear(o)};
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
    if(Math.abs(p.x)<=sw/2&&Math.abs(p.y)<=sh/2&&SV.clipOK(o,w))return o}
  return null}
const handler=o=>{for(let q=o,n=0;q&&n<64;q=q.parent!=null?get(q.parent):null,n++)if(q.btn)return q;return null};
const live=o=>o&&o.btn&&o.btn.interactable!==false;

/* ================= Scroll View (общее ядро с редактором: scrollview.js) ================= */
/*SVCORE-BEGIN*/
function makeScroll(E){
const D={en:true,hor:false,ver:true,move:'elastic',elast:.1,inertia:true,decel:.135,wheel:.6,smoothWheel:true,smooth:.12,thresh:6,
  snap:'none',snapSize:1,snapDur:.45,snapEase:'out',bars:'auto',barW:.07,barDelay:1,barFade:.35,barCol:'#ffffff',barAlpha:.6,
  pad:0,startX:0,startY:0,vw:3,vh:4,content:null};
const mk=()=>Object.assign({},D),norm=s=>{for(const k in D)if(s[k]===undefined)s[k]=D[k];return s};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,EPS=1e-4;
const EASE={out:u=>1-Math.pow(1-u,3),inout:u=>u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2,back:u=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(u-1,3)+c1*Math.pow(u-1,2)}};
// пружина без перерегулирования (как Mathf.SmoothDamp в Unity): smooth — время выхода к цели
function smoothDamp(cur,target,vel,smooth,dt){
  smooth=Math.max(1e-4,smooth);const om=2/smooth,x=om*dt,e=1/(1+x+.48*x*x+.235*x*x*x),ch=cur-target,tmp=(vel+om*ch)*dt;
  let nv=(vel-om*tmp)*e,out=target+(ch+tmp)*e;
  if((target-cur>0)===(out>target)){out=target;nv=dt>0?(out-target)/dt:0}
  return[out,nv]}
// «резинка» на краях: чем дальше за край, тем тяжелее тянуть (формула iOS / Unity)
const rubber=(o,v)=>Math.sign(o)*(1-1/(Math.abs(o)*.55/v+1))*v;

/* ---------- состояние (живёт только в Play / в игре) ---------- */
const S=new Map();
const st=o=>{let s=S.get(o.id);if(!s)S.set(o.id,s={v:[0,0],tw:[null,null],wt:[null,null],sp:[null,null],acc:[0,0],lock:0,drag:null,lp:[0,0],lm:0,ba:1,idle:0,init:false,snapOK:[false,false]});return s};
let P=null,last=0,any=true,SVM=new Map(),selSet=new Set(),cleanF=false;

/* ---------- геометрия ---------- */
const kidsOf=q=>E.kids(q.id)||[];
const isDesc=(c,o)=>{for(let p=c,n=0;p&&n<64;p=p.parent!=null?E.get(p.parent):null,n++)if(p.parent===o.id)return true;return false};
function contentOf(o){const c=o.scrollv.content!=null?E.get(o.scrollv.content):null;return(c&&c.id!==o.id&&isDesc(c,o))?c:(kidsOf(o)[0]||null)}
// матрица родителя Content относительно Scroll View (null — Content прямой ребёнок)
function parentM(o,c){let M=null;const ch=[];for(let p=c.parent!=null?E.get(c.parent):null,n=0;p&&p!==o&&n<64;p=p.parent!=null?E.get(p.parent):null,n++)ch.push(p);
  for(let i=ch.length-1;i>=0;i--){const L=E.locM(ch[i]);M=M?E.mulM(M,L):L}return M}
// прямоугольник объединения видимых объектов поддерева q в локальных осях SV (PM — матрица родителя q относительно SV, null если q — прямой ребёнок)
function bounds(q0,PM0){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,got=false;
  const walk=(q,PM)=>{if(q.active===false)return;const M=PM?E.mulM(PM,E.locM(q)):E.locM(q);
    if(q.img||q.text||q.grad){const sz=E.size(q),hw=sz[0]/2,hh=sz[1]/2;
      for(const c of[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]){const px=M[0]*c[0]+M[2]*c[1]+M[4],py=M[1]*c[0]+M[3]*c[1]+M[5];
        if(px<x0)x0=px;if(px>x1)x1=px;if(py<y0)y0=py;if(py>y1)y1=py}got=true}
    for(const k of kidsOf(q))walk(k,M)};
  walk(q0,PM0);return got?{x0,y0,x1,y1}:null}
// метрики осей: a[i] — на сколько уже прокручено (0 = начало: слева / сверху), L[i] — длина прокрутки
function axes(o){const sc=o.scrollv,c=contentOf(o);if(!c)return null;const pm=parentM(o,c),b=bounds(c,pm);if(!b)return null;
  const sz=E.size(o),vw=sz[0],vh=sz[1],hw=vw/2,hh=vh/2,p=+sc.pad||0;
  return{c,pm,b,vw,vh,hw,hh,p,a:[-hw-(b.x0-p),(b.y1+p)-hh],L:[Math.max(0,b.x1-b.x0+2*p-vw),Math.max(0,b.y1-b.y0+2*p-vh)]}}
const put=(A,i,na)=>{const d=na-A.a[i];if(i==0)A.c.x-=d;else A.c.y+=d;A.a[i]=na};
const inView=(p,w)=>{const I=E.invM(E.wmat(p));if(!I)return false;const q=E.apM(I,w.x,w.y),sz=E.size(p);return Math.abs(q.x)<=sz[0]/2&&Math.abs(q.y)<=sz[1]/2};
const depth=o=>{let n=0;for(let p=o;p&&p.parent!=null&&n<64;p=E.get(p.parent))n++;return n};
const unclipped=p=>{if(E.playing()||cleanF)return false;if(selSet.has(p.id))return true;const q=p.parent!=null?E.get(p.parent):null;return!!(q&&q.scrollv&&selSet.has(q.id))};
const maskSpr=p=>p.mask&&p.mask.sprite!=null&&E.spr?E.spr(p.mask.sprite):null;   // спрайт-форма маски (или null — прямоугольник)   // в редакторе у выделенного Scroll View (и его содержимого) обрезка выключена — удобно раскладывать
const active=()=>E.order().filter(e=>e.on&&e.o.scrollv&&e.o.scrollv.en!==false);

/* ---------- привязка (Snap) ---------- */
const snapStep=(sc,A,i)=>sc.snap=='pages'?Math.max(.01,i?A.vh:A.vw):Math.max(.01,+sc.snapSize||1);
function snapTo(sc,s,A,i,p,v){
  const L=A.L[i],step=snapStep(sc,A,i);let t;
  if(sc.snap=='pages'){const pg=clamp(p,0,L)/step;t=Math.abs(v)>step*.6?(v>0?Math.ceil(pg-.05):Math.floor(pg+.05)):Math.round(pg);t*=step}
  else t=Math.round(clamp(p+v*.2,0,L)/step)*step;
  const q=clamp(p+v*.2,0,L);if(Math.abs(L-q)<Math.abs(q-t))t=L;t=clamp(t,0,L);
  const d=Math.abs(t-p);s.snapOK[i]=true;if(d<.0005){s.v[i]=0;return}
  if(sc.snapEase=='spring'){s.sp[i]=t;s.v[i]=v}
  else{s.v[i]=0;s.tw[i]={from:p,to:t,t:0,dur:Math.max(.08,(+sc.snapDur||.4)*Math.min(1,.4+d/step)),ease:sc.snapEase}}}

/* ---------- кадр физики ---------- */
function stepSV(o,s,dt){
  const sc=norm(o.scrollv),A=axes(o);if(!A)return;const on=[sc.hor,sc.ver];let busy=false;
  if(!s.init){s.init=true;[[0,sc.startX],[1,sc.startY]].forEach(([i,n])=>{if(on[i]&&A.L[i]>EPS){put(A,i,clamp(+n||0,0,1)*A.L[i]);s.snapOK[i]=true}})}   // стартовая позиция (только если есть что прокручивать)
  for(let i=0;i<2;i++){
    const L=A.L[i];if(!on[i]||L<=EPS){s.v[i]=0;s.tw[i]=s.wt[i]=s.sp[i]=null;continue}
    let p=A.a[i],v=s.v[i];
    if(s.drag){const nv=(p-s.lp[i])/dt;v=lerp(v,nv,Math.min(1,dt*10));s.lp[i]=p;s.v[i]=v;busy=true;continue}
    const tw=s.tw[i];
    if(tw){tw.t+=dt;const u=tw.dur>0?Math.min(1,tw.t/tw.dur):1,np=tw.from+(tw.to-tw.from)*(EASE[tw.ease]||EASE.out)(u);v=(np-p)/dt;p=np;if(u>=1){p=tw.to;v=0;s.tw[i]=null}busy=true}
    else if(s.sp[i]!=null){const tg=s.sp[i],r=smoothDamp(p,tg,v,Math.max(.05,(+sc.snapDur||.4)*.5),dt);p=r[0];v=r[1];busy=true;if(Math.abs(p-tg)<.0005&&Math.abs(v)<.01){p=tg;v=0;s.sp[i]=null}}
    else if(s.wt[i]!=null){const tg=s.wt[i],np=p+(tg-p)*(1-Math.exp(-dt/Math.max(.01,+sc.smooth||.1)));v=(np-p)/dt;p=np;busy=true;if(Math.abs(tg-p)<.0015){p=tg;v=0;s.wt[i]=null}}
    else{
      const out=p<0?p:p>L?p-L:0;
      if(out!==0&&sc.move=='elastic'){const tg=p<0?0:L,r=smoothDamp(p,tg,v,Math.max(.01,+sc.elast||.1),dt);p=r[0];v=r[1];busy=true;if(Math.abs(p-tg)<.0005&&Math.abs(v)<.01){p=tg;v=0}}
      else if(sc.inertia&&Math.abs(v)>.01){p+=v*dt;v*=Math.pow(clamp(+sc.decel||.135,.0001,.9999),dt);busy=true;if(sc.move=='clamped'&&(p<0||p>L)){p=clamp(p,0,L);v=0}}
      else{v=0;if(sc.move=='clamped'&&out!==0)p=clamp(p,0,L)}
      // остановились и нужна привязка → доводим до ближайшей точки
      if(sc.snap!='none'&&!s.snapOK[i]&&Math.abs(v)<.3&&p>=-EPS&&p<=L+EPS){snapTo(sc,s,A,i,p,v);v=s.v[i];busy=true}}
    s.v[i]=v;if(p!==A.a[i])put(A,i,p)}
  if(busy||s.drag||s.hover)s.idle=0;else s.idle+=dt;
  const tgt=sc.bars=='always'?1:sc.bars=='hidden'?0:(s.idle<(+sc.barDelay||0)?1:0);
  s.ba=tgt>s.ba?Math.min(1,s.ba+dt/.08):Math.max(0,s.ba-dt/Math.max(.02,+sc.barFade||.3))}
function step(L){
  const play=E.playing(),now=E.now();
  if(!play){if(S.size)S.clear();P=null;last=now;return}
  let dt=(now-last)/1000;last=now;if(E.paused()||!(dt>0))return;dt=Math.min(dt,.05);
  for(const e of(L||E.order())){const o=e.o;if(!e.on||!o.scrollv||o.scrollv.en===false){if(o.scrollv)S.delete(o.id);continue}stepSV(o,st(o),dt)}}

/* ---------- ввод: перетаскивание, колесо ---------- */
function cands(w){return active().map(e=>e.o).filter(o=>inView(o,w)&&clipOK(o,w)).sort((a,b)=>depth(b)-depth(a))}
function down(w,px,py){E.frame&&E.frame();const list=cands(w);P=list.length?{px,py,list,cur:null}:null}
// true — идёт перетаскивание Scroll View (вызывающий отменяет клик по кнопке под пальцем)
function move(w,px,py){
  if(!P)return false;
  if(!P.cur){
    const dx=px-P.px,dy=py-P.py;if(Math.hypot(dx,dy)<Math.max(0,+P.list[0].scrollv.thresh||0))return false;
    const hz=Math.abs(dx)>Math.abs(dy),o=P.list.find(q=>{const sc=norm(q.scrollv),A=axes(q);return A&&(hz?(sc.hor&&A.L[0]>EPS):(sc.ver&&A.L[1]>EPS))});
    if(!o){P=null;return false}
    const A=axes(o),s=st(o);s.drag=true;s.tw=[null,null];s.wt=[null,null];s.sp=[null,null];s.v=[0,0];s.snapOK=[false,false];s.lp=A.a.slice();s.lm=E.now();
    P.cur={o,s,a0:A.a.slice(),w0:{x:w.x,y:w.y}};return true}
  const{o,s,a0,w0}=P.cur,A=axes(o),I=E.invM(E.wmat(o));if(!A||!I)return true;
  const p0=E.apM(I,w0.x,w0.y),p1=E.apM(I,w.x,w.y),d=[p1.x-p0.x,p1.y-p0.y],sc=o.scrollv,on=[sc.hor,sc.ver];
  for(let i=0;i<2;i++){if(!on[i]||A.L[i]<=EPS)continue;
    const raw=a0[i]+(i?d[1]:-d[0]),L=A.L[i],vs=i?A.vh:A.vw;let p;
    if(sc.move=='free')p=raw;else if(sc.move=='clamped')p=clamp(raw,0,L);else{const c=clamp(raw,0,L),ov=raw-c;p=c+(ov?rubber(ov,vs):0)}
    put(A,i,p)}
  s.lm=E.now();s.idle=0;return true}
function up(){
  const q=P;P=null;if(!q||!q.cur)return;const{o,s}=q.cur;s.drag=null;
  const sc=norm(o.scrollv),A=axes(o);if(!A)return;const stale=E.now()-s.lm>90;
  [sc.hor,sc.ver].forEach((on,i)=>{if(!on||A.L[i]<=EPS)return;const v=stale?0:s.v[i];
    if(sc.snap!='none')snapTo(sc,s,A,i,A.a[i],v);else s.v[i]=sc.inertia?v:0})}
// колесо: nx / ny — «щелчки» (вниз / вправо — вперёд). true — прокрутка обработана
function wheel(w,nx,ny,shift){
  E.frame&&E.frame();let used=false;
  for(const o of cands(w)){
    const sc=norm(o.scrollv),A=axes(o);if(!A)continue;const s=st(o);
    let n=[sc.hor?nx:0,sc.ver?ny:0];if(sc.hor&&(shift||!sc.ver)&&!nx)n=[ny,0];
    for(let i=0;i<2;i++){
      if(!n[i]||A.L[i]<=EPS)continue;used=true;
      const L=A.L[i],base=s.wt[i]!=null?s.wt[i]:A.a[i];let t;
      if(sc.snap!='none'){   // один щелчок — один шаг / одна страница
        const step=snapStep(sc,A,i);s.acc[i]+=n[i];if(Math.abs(s.acc[i])<.5||E.now()<s.lock)continue;
        const k=Math.sign(s.acc[i]);s.acc[i]=0;s.lock=E.now()+130;t=clamp(Math.round(base/step)*step+k*step,0,L)}
      else t=clamp(base+n[i]*(+sc.wheel||.6),0,L);
      s.v[i]=0;s.tw[i]=null;s.sp[i]=null;s.snapOK[i]=sc.snap!='none';
      if(sc.smoothWheel)s.wt[i]=t;else{s.wt[i]=null;put(A,i,t)}
      s.idle=0}
    if(used)break}
  return used}

/* ---------- методы (On Click): плавная прокрутка в нужное место ---------- */
function goTo(o,i,tgt,dur){
  const sc=norm(o.scrollv),A=axes(o);if(!A||!(i?sc.ver:sc.hor)||A.L[i]<=EPS)return;
  const s=st(o),t=clamp(tgt,0,A.L[i]);s.wt[i]=null;s.sp[i]=null;s.v[i]=0;s.snapOK[i]=true;
  if(!(dur>0)){s.tw[i]=null;put(A,i,t)}else s.tw[i]={from:A.a[i],to:t,t:0,dur,ease:'inout'}}
function to(o,nx,ny,dur){const A=o&&o.scrollv&&axes(o);if(!A)return;[nx,ny].forEach((n,i)=>{if(n!=null&&!isNaN(n))goTo(o,i,clamp(+n,0,1)*A.L[i],+dur)})}
function item(o,idx,dur){
  const sc=o&&o.scrollv;if(!sc)return;const A=axes(o);if(!A)return;
  const ks=kidsOf(A.c).filter(k=>k.active!==false),k=ks[clamp(Math.round(+idx||0),0,ks.length-1)];if(!k)return;
  const b=bounds(k,A.pm?E.mulM(A.pm,E.locM(A.c)):E.locM(A.c));if(!b)return;
  if(sc.ver)goTo(o,1,A.a[1]+(A.hh-A.p)-b.y1,+dur);
  if(sc.hor)goTo(o,0,A.a[0]+b.x0-(-A.hw+A.p),+dur)}
const setOn=(o,v)=>{if(o&&o.scrollv)o.scrollv.en=!!v};

/* ---------- отрисовка: обрезка по рамке и скроллбары ---------- */
function begin(L,clean){cleanF=!!clean;E.frame&&E.frame();selSet=E.selSet();SVM.clear();any=false;
  const play=E.playing();
  for(const e of L){const o=e.o;
    // миграция: раньше обрезка была опцией Scroll View (scrollv.mask) — теперь это отдельный компонент Mask
    if(!play&&o.scrollv&&o.scrollv.mask!==undefined){if(o.scrollv.mask===true&&!o.mask)o.mask={w:3,h:3};delete o.scrollv.mask}
    if(o.scrollv||o.mask){any=true;SVM.set(o.id,e)}}
  if(any)step(L)}
// включает обрезку для объекта o (если он внутри объекта с компонентом Mask); возвращает true → после рисования вызвать g.restore()
let LAY=null;
const layerOf=g=>{const c=g.canvas;if(!LAY||LAY.width!=c.width||LAY.height!=c.height){LAY=document.createElement('canvas');LAY.width=c.width;LAY.height=c.height}return LAY};
// Возвращает false (обрезки нет), true (прямоугольная: после рисования g.restore()) или {ctx,…} (форма из спрайта: рисуем в ctx, затем endClip)
function clip(g,o,sx,sy){
  if(!any||o.parent==null)return false;const ch=[];
  for(let p=E.get(o.parent),n=0;p&&n<64;p=p.parent!=null?E.get(p.parent):null,n++){
    if(p.mask&&!unclipped(p)){const e=SVM.get(p.id);if(e&&e.on)ch.push(e)}}
  if(!ch.length)return false;
  const quad=e=>{const M=e.M,sz=E.size(e.o),hw=sz[0]/2,hh=sz[1]/2;return[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(c=>[sx(M[0]*c[0]+M[2]*c[1]+M[4]),sy(M[1]*c[0]+M[3]*c[1]+M[5])])};
  const path=(ctx,e)=>{ctx.beginPath();quad(e).forEach((q,j)=>j?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath()};
  const sp=ch.filter(e=>maskSpr(e.o));
  if(!sp.length){g.save();for(let k=ch.length-1;k>=0;k--){path(g,ch[k]);g.clip()}return true}
  const T=g.getTransform(),L=layerOf(g),l=L.getContext('2d'),Q=quad(ch[0]);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[x,y]of Q){const X=T.a*x+T.c*y+T.e,Y=T.b*x+T.d*y+T.f;x0=Math.min(x0,X);x1=Math.max(x1,X);y0=Math.min(y0,Y);y1=Math.max(y1,Y)}
  const bx=Math.max(0,Math.floor(x0)-2),by=Math.max(0,Math.floor(y0)-2),bw=Math.max(0,Math.min(L.width,Math.ceil(x1)+2)-bx),bh=Math.max(0,Math.min(L.height,Math.ceil(y1)+2)-by);
  l.setTransform(1,0,0,1,0,0);l.globalAlpha=1;l.globalCompositeOperation='source-over';l.clearRect(bx,by,bw,bh);
  l.save();l.setTransform(T);for(let k=ch.length-1;k>=0;k--){path(l,ch[k]);l.clip()}
  return{ctx:l,sp,T,bx,by,bw,bh,sx,sy}}
// после рисования объекта: вырезаем форму спрайтом и накладываем слой на сцену
function endClip(g,h){
  if(h===true){g.restore();return}
  const l=h.ctx;l.restore();
  l.save();l.globalCompositeOperation='destination-in';
  for(const e of h.sp){const img=maskSpr(e.o);if(!img)continue;
    const M=e.M,sz=E.size(e.o),hw=sz[0]/2,hh=sz[1]/2,ap=(x,y)=>[h.sx(M[0]*x+M[2]*y+M[4]),h.sy(M[1]*x+M[3]*y+M[5])],p0=ap(0,0),p1=ap(1,0),p2=ap(0,1);
    l.save();l.setTransform(h.T);l.transform(p1[0]-p0[0],p1[1]-p0[1],p2[0]-p0[0],p2[1]-p0[1],p0[0],p0[1]);l.scale(1,-1);
    l.drawImage(img,-hw,-hh,sz[0],sz[1]);l.restore()}
  l.restore();
  if(h.bw>0&&h.bh>0){g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.drawImage(l.canvas,h.bx,h.by,h.bw,h.bh,h.bx,h.by,h.bw,h.bh);g.restore()}}
// можно ли «попасть» в o в точке w (скрытое обрезкой содержимое не кликается и не выделяется)
function clipOK(o,w){
  if(!any)return true;
  for(let p=o.parent!=null?E.get(o.parent):null,n=0;p&&n<64;p=p.parent!=null?E.get(p.parent):null,n++){
    if(p.mask&&!unclipped(p)&&!inView(p,w))return false}
  return true}
// после рисования всего содержимого: рамка Scroll View / Mask (в редакторе) и скроллбары
function bars(g,o,M,sx,sy,cam,clean){
  const sc=o.scrollv;if(!sc&&!o.mask)return;if(sc)norm(sc);const play=E.playing(),A=sc?axes(o):null,sz=E.size(o),vw=sz[0],vh=sz[1],hw=vw/2,hh=vh/2;
  g.save();g.transform(M[0]*cam.z,-M[1]*cam.z,M[2]*cam.z,-M[3]*cam.z,sx(M[4]),sy(M[5]));g.scale(1,-1);
  const px=1/(cam.z*Math.max(.001,Math.hypot(M[0],M[1])));
  const showM=!o.mask||o.mask.show!==false;   // Mask ▸ Show In Editor
  if(!play&&!clean&&!E.expMode()&&(sc||showM)){g.setLineDash([6*px,4*px]);g.lineWidth=1.2*px;g.strokeStyle=sc?'rgba(120,200,255,.6)':'rgba(255,190,90,.75)';g.strokeRect(-hw,-hh,vw,vh);g.setLineDash([]);
    const ms=o.mask&&showM&&maskSpr(o);if(ms&&unclipped(o)){g.globalAlpha=.3;g.drawImage(ms,-hw,-hh,vw,vh);g.globalAlpha=1}}
  if(A&&sc.bars!='hidden'){
    const s=play?S.get(o.id):null,al=play?(s?s.ba:1):1;
    if(al>.01){
      const th=Math.max(.01,+sc.barW||.07),ins=th*.6,both=sc.hor&&sc.ver&&A.L[0]>EPS&&A.L[1]>EPS;
      const rr=(x,y,w,h,a)=>{g.globalAlpha=a*al;g.fillStyle=sc.barCol||'#fff';g.beginPath();if(g.roundRect)g.roundRect(x,y,w,h,Math.min(w,h)/2);else g.rect(x,y,w,h);g.fill()};
      for(let i=0;i<2;i++){
        if(!(i?sc.ver:sc.hor)||A.L[i]<=EPS)continue;
        const vs=i?vh:vw,cs=vs+A.L[i],tl=Math.max(th,vs-2*ins-(both?th+ins:0)),p=A.a[i],ov=p<0?-p:p>A.L[i]?p-A.L[i]:0;
        let hl=clamp(tl*vs/cs,Math.min(tl,th*2),tl);hl*=clamp(1-ov/vs*1.5,.35,1);       // за краем ручка «сплющивается»
        const pos=ov?(p<0?0:tl-hl):clamp(p/A.L[i],0,1)*(tl-hl);
        if(i==1){const x=hw-ins-th,y0=-hh+ins;rr(x,y0,th,tl,.14);rr(x,y0+pos,th,hl,+sc.barAlpha||.6)}
        else{const y=hh-ins-th,x0=-hw+ins;rr(x0,y,tl,th,.14);rr(x0+pos,y,hl,th,+sc.barAlpha||.6)}}}}
  g.restore()}
return{mk,norm,D,step,begin,clip,endClip,clipOK,bars,down,move,up,wheel,to,item,setOn,axes,state:st,
  start:(o,d)=>to(o,0,0,d),end:(o,d)=>to(o,1,1,d)}}
/*SVCORE-END*/

/* ================= Particle System (общее ядро с редактором: particles.js) ================= */
/*PFXCORE-BEGIN*/
function makeParticles(E){
const TAU=Math.PI*2,DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const D={sprites:[],shape:'soft',flip:false,
  mode:'stream',rate:30,count:40,rep:false,every:1.5,loop:true,dur:5,awake:true,
  em:'point',ew:1,eh:1,out:false,
  dir:90,spread:40,smin:1,smax:3,lmin:.6,lmax:1.2,
  zmin:.3,zmax:.6,zend:.2,
  grav:0,drag:0,turb:0,tsc:1,spmin:0,spmax:0,rmin:0,rmax:0,stretch:0,face:false,
  stops:[{c:'#ffffff',a:1},{c:'#ffffff',a:.8},{c:'#ffffff',a:0}],mid:true,fade:.05,
  wind:0,wdir:0,gust:0,gsp:.5,swa:0,swf:.4,twk:0,twf:3,pop:false,hue:0,pre:0,
  glow:false,space:'world',max:400,seed:0,preview:true};
const st3=(a,b,c)=>[{c:a[0],a:a[1]},{c:b[0],a:b[1]},{c:c[0],a:c[1]}];
/* Пресеты: только то, что отличается от D. dir: 90 = вверх, 0 = вправо, 270 = вниз */
const PRESETS=[
 {k:'explosion',n:'Explosion',ico:'💥',d:{mode:'burst',count:110,rep:true,every:2,em:'circle',ew:.12,dir:90,spread:360,smin:2.5,smax:8,lmin:.3,lmax:.85,zmin:.5,zmax:1.1,zend:.2,drag:3.4,grav:-.5,turb:.8,tsc:1.2,fade:0,glow:true,shape:'soft',stops:st3(['#fff6c4',1],['#ff8a24',.9],['#3a2420',0])}},
 {k:'fire',n:'Fire',ico:'🔥',d:{mode:'stream',rate:60,em:'circle',ew:.28,dir:90,spread:18,smin:.7,smax:1.5,lmin:.6,lmax:1.3,zmin:.34,zmax:.62,zend:.12,grav:-2.2,turb:1.6,tsc:1.4,fade:.08,glow:true,shape:'soft',stops:st3(['#ffd86a',.75],['#ff6a12',.7],['#4a1208',0])}},
 {k:'smoke',n:'Smoke',ico:'💨',d:{mode:'stream',rate:14,em:'circle',ew:.2,dir:90,spread:30,smin:.35,smax:.85,lmin:2.2,lmax:3.6,zmin:.4,zmax:.7,zend:2.6,grav:-.25,drag:.3,turb:.7,tsc:.8,spmin:-25,spmax:25,rmin:0,rmax:360,fade:.2,glow:false,shape:'smoke',stops:st3(['#c4c4c4',.5],['#8a8a8a',.35],['#4a4a4a',0])}},
 {k:'water',n:'Water',ico:'💧',d:{mode:'stream',rate:100,em:'point',dir:90,spread:16,smin:4.2,smax:6.5,lmin:1.1,lmax:1.6,zmin:.14,zmax:.24,zend:.7,grav:9,turb:0,fade:.02,face:true,glow:false,shape:'drop',stops:st3(['#d6f1ff',.95],['#5db4ff',.85],['#2a6fd6',0])}},
 {k:'noise',n:'Noise',ico:'📺',d:{mode:'stream',rate:260,em:'rect',ew:6,eh:4,dir:0,spread:360,smin:0,smax:.3,lmin:.15,lmax:.5,zmin:.04,zmax:.1,zend:1,grav:0,turb:2.5,tsc:4,fade:.25,glow:true,shape:'square',max:900,stops:st3(['#ffffff',.9],['#cfd8ff',.6],['#ffffff',0])}},
 {k:'sparks',n:'Sparks',ico:'⚡',d:{mode:'burst',count:34,rep:true,every:1.2,em:'point',dir:90,spread:80,smin:3,smax:7.5,lmin:.35,lmax:.9,zmin:.3,zmax:.55,zend:.35,grav:8,drag:.5,stretch:1.1,face:true,fade:0,glow:true,shape:'streak',stops:st3(['#fff7b0',1],['#ffb43a',.95],['#ff3d00',0])}},
 {k:'snow',n:'Snow',ico:'❄️',d:{mode:'stream',rate:36,em:'rect',ew:8,eh:.2,dir:270,spread:20,smin:.3,smax:.8,lmin:6,lmax:9,zmin:.07,zmax:.16,zend:1,grav:0,turb:.9,tsc:.6,fade:.1,glow:false,shape:'soft',max:600,stops:st3(['#ffffff',.95],['#eaf4ff',.9],['#ffffff',0])}},
 {k:'rain',n:'Rain',ico:'🌧️',d:{mode:'stream',rate:170,em:'rect',ew:8,eh:.2,dir:256,spread:4,smin:9,smax:12,lmin:.55,lmax:.85,zmin:.28,zmax:.42,zend:1,grav:0,turb:0,fade:0,face:true,glow:false,shape:'streak',max:700,stops:st3(['#b8d4ff',.55],['#a8c8ff',.55],['#a8c8ff',0])}},
 {k:'abstract',n:'Abstract',ico:'🌌',d:{mode:'stream',rate:5,em:'rect',ew:19,eh:11,dir:90,spread:360,smin:.05,smax:.25,lmin:9,lmax:15,zmin:2.4,zmax:5.5,zend:1.25,drag:.1,turb:.35,tsc:.35,swa:.35,swf:.07,spmin:-4,spmax:4,rmin:0,rmax:360,fade:.3,glow:true,shape:'blob',hue:90,pre:14,max:120,stops:st3(['#7b5cff',0],['#ff5ca8',.42],['#2fc7ff',0])}},
 {k:'bokeh',n:'Bokeh',ico:'🔮',d:{mode:'stream',rate:7,em:'rect',ew:17,eh:10,dir:90,spread:360,smin:.1,smax:.45,lmin:5,lmax:9,zmin:.4,zmax:1.3,zend:1.1,grav:-.1,turb:.2,tsc:.5,swa:.25,swf:.12,twk:.35,twf:.6,fade:.25,glow:true,shape:'bokeh',hue:150,pre:9,max:160,stops:st3(['#ffd27a',0],['#ff7ac8',.55],['#7ab8ff',0])}},
 {k:'shapes',n:'Shapes',ico:'🔷',d:{mode:'stream',rate:4.5,em:'rect',ew:18,eh:2,dir:90,spread:50,smin:.3,smax:.8,lmin:10,lmax:16,zmin:.5,zmax:1.5,zend:1,drag:.05,turb:.15,tsc:.3,swa:.15,swf:.1,spmin:-30,spmax:30,rmin:0,rmax:360,fade:.15,glow:false,shape:'mix',hue:90,pre:12,max:140,stops:st3(['#5b7cff',0],['#9b6bff',.6],['#ff6bd5',0])}},
 {k:'wind',n:'Wind',ico:'🍃',d:{mode:'stream',rate:22,em:'rect',ew:.4,eh:10,dir:0,spread:14,smin:5,smax:9,lmin:2,lmax:3.4,zmin:1.6,zmax:3.2,zend:1,drag:.2,turb:1.6,tsc:.45,wind:4,wdir:0,gust:.8,gsp:.3,face:true,stretch:.7,fade:.3,glow:true,shape:'wisp',max:200,pre:2,stops:st3(['#ffffff',0],['#dff0ff',.8],['#ffffff',0])}},
 {k:'sparkle',n:'Sparkle',ico:'✨',d:{mode:'stream',rate:22,em:'circle',ew:3,dir:90,spread:360,smin:0,smax:.35,lmin:.8,lmax:1.7,zmin:.3,zmax:.85,zend:.6,grav:-.4,drag:.4,turb:.5,tsc:1.4,spmin:-90,spmax:90,rmin:0,rmax:90,pop:true,twk:.55,twf:6,fade:0,glow:true,shape:'star',max:200,stops:st3(['#ffffff',1],['#fff2b0',.95],['#ffd34a',0])}},
 {k:'shine',n:'Shine',ico:'💫',d:{mode:'burst',count:1,rep:true,every:1.5,em:'point',dir:90,spread:0,smin:0,smax:0,lmin:.9,lmax:.9,zmin:2.2,zmax:2.2,zend:1,spmin:25,spmax:25,pop:true,fade:0,glow:true,shape:'flare',max:8,stops:st3(['#ffffff',1],['#fff6d0',1],['#ffe08a',0])}},
 {k:'rays',n:'Light Rays',ico:'🌤️',d:{mode:'stream',rate:2.2,em:'point',dir:0,spread:0,smin:0,smax:0,lmin:5,lmax:9,zmin:7,zmax:12,zend:1.05,spmin:-2.5,spmax:2.5,rmin:235,rmax:305,pop:true,twk:.25,twf:.5,fade:0,glow:true,shape:'ray',max:30,pre:8,stops:st3(['#fff3c4',.6],['#ffe9a8',.5],['#fff3c4',0])}},
 {k:'light',n:'Light',ico:'💡',d:{mode:'stream',rate:3.5,em:'point',dir:90,spread:0,smin:0,smax:0,lmin:2.6,lmax:3.4,zmin:3,zmax:3.6,zend:1.15,pop:true,twk:.18,twf:1.1,fade:0,glow:true,shape:'soft',max:30,pre:3,stops:st3(['#ffe2a8',.5],['#ffc874',.5],['#ff9a3c',0])}}];
const SHAPES=[['soft','Soft Glow'],['circle','Circle'],['square','Square'],['star','Sparkle'],['flare','Lens Flare'],['ring','Ring'],['smoke','Smoke Puff'],['drop','Water Drop'],['streak','Streak'],
  ['blob','Soft Blob'],['bokeh','Bokeh'],['triangle','Triangle'],['hex','Hexagon'],['diamond','Diamond'],['mix','Geometric Mix'],['ray','Light Ray'],['wisp','Wind Wisp']];
const MIX=['triangle','hex','diamond','ring','square'],HB=7;   // Geometric Mix: набор форм; HB — число «корзин» оттенка (Hue Variation)
const clone=v=>JSON.parse(JSON.stringify(v));
const mk=k=>{const p=PRESETS.find(x=>x.k==k);return clone(Object.assign({},D,p?p.d:{}))};
function norm(c){for(const k in D)if(c[k]===undefined)c[k]=clone(D[k]);if(!Array.isArray(c.sprites))c.sprites=[];
  while(c.stops.length<3)c.stops.push({c:'#ffffff',a:c.stops.length?0:1});return c}
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

/* ---------- цвет по жизни: Start → (Middle) → End ---------- */
const hcache=new Map(),hex=h=>{let r=hcache.get(h);if(!r){h=/^#[0-9a-f]{6}$/i.test(h||'')?h:'#ffffff';r=[1,3,5].map(i=>parseInt(h.substr(i,2),16));if(hcache.size>256)hcache.clear();hcache.set(h,r)}return r};
const segOf=(c,t)=>{const a=c.mid?[c.stops[0],c.stops[1],c.stops[2]]:[c.stops[0],c.stops[2]],n=a.length-1,f=clamp(t,0,1)*n,i=Math.min(n-1,Math.floor(f));return[a[i],a[i+1],f-i]};
const alphaAt=(c,t)=>{const[A,B,u]=segOf(c,t);return lerp(A.a,B.a,u)};
const colAt=(c,t)=>{const[A,B,u]=segOf(c,t),x=hex(A.c),y=hex(B.c);return[0,1,2].map(i=>Math.round(lerp(x[i],y[i],u)))};
const tinted=c=>{const s=c.mid?c.stops:[c.stops[0],c.stops[2]];return s.some(q=>String(q.c).toLowerCase()!='#ffffff')};

/* ---------- встроенные формы (белые, красятся цветом эффекта) ---------- */
const BI={},cvs=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
function builtin(k){if(k=='mix')k='diamond';if(BI[k])return BI[k];let c,x;
  if(k=='circle'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.arc(32,32,30,0,TAU);x.fill()}
  else if(k=='square'){c=cvs(32,32);x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(2,2,28,28)}
  else if(k=='star'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(32,2);x.quadraticCurveTo(32,32,62,32);x.quadraticCurveTo(32,32,32,62);x.quadraticCurveTo(32,32,2,32);x.quadraticCurveTo(32,32,32,2);x.fill();
    const r=x.createRadialGradient(32,32,0,32,32,12);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=r;x.fillRect(16,16,32,32)}
  else if(k=='ring'){c=cvs(64,64);x=c.getContext('2d');x.strokeStyle='#fff';x.lineWidth=7;x.beginPath();x.arc(32,32,26,0,TAU);x.stroke()}
  else if(k=='smoke'){c=cvs(96,96);x=c.getContext('2d');for(let i=0;i<9;i++){const a=i*2.4,d=i?20*(.5+.5*Math.sin(i*1.7)):0,px=48+Math.cos(a)*d,py=48+Math.sin(a)*d,r0=22+6*Math.sin(i*2.3);
      const g=x.createRadialGradient(px,py,0,px,py,r0);g.addColorStop(0,'rgba(255,255,255,.42)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,96,96)}}
  else if(k=='drop'){c=cvs(64,40);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(62,20);x.quadraticCurveTo(36,6,22,4);x.arc(22,20,16,-Math.PI/2,Math.PI/2,true);x.quadraticCurveTo(36,34,62,20);x.fill()}
  else if(k=='streak'){c=cvs(64,12);x=c.getContext('2d');const g=x.createLinearGradient(0,0,64,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.8,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,1)');x.fillStyle=g;x.fillRect(0,2,62,8);x.fillStyle='#fff';x.beginPath();x.arc(58,6,4,0,TAU);x.fill()}
  else if(k=='blob'){c=cvs(128,128);x=c.getContext('2d');[[64,64,60,.55],[46,54,34,.4],[82,72,38,.4],[70,42,28,.3]].forEach(([px,py,r,a])=>{const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128)})}
  else if(k=='bokeh'){c=cvs(96,96);x=c.getContext('2d');const g=x.createRadialGradient(48,48,0,48,48,46);g.addColorStop(0,'rgba(255,255,255,.35)');g.addColorStop(.78,'rgba(255,255,255,.45)');g.addColorStop(.9,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.arc(48,48,46,0,TAU);x.fill()}
  else if(k=='triangle'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(32,5);x.lineTo(60,56);x.lineTo(4,56);x.closePath();x.fill()}
  else if(k=='hex'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;i?x.lineTo(32+Math.cos(a)*29,32+Math.sin(a)*29):x.moveTo(32+Math.cos(a)*29,32+Math.sin(a)*29)}x.closePath();x.fill()}
  else if(k=='diamond'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(32,3);x.lineTo(58,32);x.lineTo(32,61);x.lineTo(6,32);x.closePath();x.fill()}
  else if(k=='flare'){c=cvs(128,128);x=c.getContext('2d');x.translate(64,64);
    const sp=(len,w,ang,a)=>{x.save();x.rotate(ang);const g=x.createLinearGradient(-len,0,len,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,`rgba(255,255,255,${a})`);g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.moveTo(-len,0);x.quadraticCurveTo(0,-w,len,0);x.quadraticCurveTo(0,w,-len,0);x.fill();x.restore()};
    sp(62,5,0,1);sp(62,5,Math.PI/2,1);sp(34,3,Math.PI/4,.7);sp(34,3,-Math.PI/4,.7);
    const r=x.createRadialGradient(0,0,0,0,0,26);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(255,255,255,.6)');r.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=r;x.fillRect(-64,-64,128,128)}
  else if(k=='ray'){c=cvs(256,64);x=c.getContext('2d');const g=x.createLinearGradient(0,0,256,0);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.35,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.moveTo(0,29);x.lineTo(256,2);x.lineTo(256,62);x.lineTo(0,35);x.closePath();x.fill();
    x.globalCompositeOperation='destination-in';const v=x.createLinearGradient(0,0,0,64);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(.5,'rgba(0,0,0,1)');v.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=v;x.fillRect(0,0,256,64)}
  else if(k=='wisp'){c=cvs(128,24);x=c.getContext('2d');const g=x.createLinearGradient(0,0,128,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.25,'rgba(255,255,255,.9)');g.addColorStop(.7,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,0)');x.strokeStyle=g;x.lineCap='round';x.lineWidth=3.4;x.beginPath();x.moveTo(2,15);x.bezierCurveTo(30,3,48,21,72,12);x.bezierCurveTo(92,5,108,9,126,7);x.stroke()}
  else{c=cvs(64,64);x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64)}
  return BI[k]=c}

/* ---------- текстуры частиц: спрайт (или форма) → уменьшенная копия → «рампа» окрашенных копий по жизни ---------- */
const MAXTEX=128,STEPS=16,TC=new Map();
const sigOf=c=>c.sprites.join(',')+'|'+c.shape+'|'+(tinted(c)?c.stops[0].c+c.stops[1].c+c.stops[2].c+(c.mid?'m':'-')+'|'+(c.hue||0):'w');
/* поворот оттенка (как feColorMatrix hueRotate) */
const hueRot=(c,deg)=>{if(!deg)return c;const a=deg*DEG,co=Math.cos(a),si=Math.sin(a),[r,g,b]=c,q=v=>clamp(Math.round(v),0,255);
  return[q((.213+co*.787-si*.213)*r+(.715-co*.715-si*.715)*g+(.072-co*.072+si*.928)*b),q((.213-co*.213+si*.143)*r+(.715+co*.285+si*.14)*g+(.072-co*.072-si*.283)*b),q((.213-co*.213-si*.787)*r+(.715-co*.715+si*.715)*g+(.072+co*.928+si*.072)*b)]};
const hbOf=p=>{const f=p.sd*13.37/TAU;return Math.floor((f-Math.floor(f))*HB)%HB};   // «корзина» оттенка частицы — из её же случайного числа (последовательность random не меняется)
function entry(c){const k=sigOf(c);let e=TC.get(k);if(!e){if(TC.size>=24)TC.delete(TC.keys().next().value);e={b:[],r:new Map(),tint:tinted(c),steps:c.sprites.length>8?8:STEPS};TC.set(k,e)}return e}
function baseTex(c,e,idx){
  if(e.b[idx]!==undefined)return e.b[idx];
  let res=null,waiting=false;
  if(c.sprites.length){const a=E.ast(c.sprites[idx%c.sprites.length]),im=a&&a.img;
    if(im&&im.width>0){const sc=Math.min(1,MAXTEX/Math.max(im.width,im.height)),w=Math.max(1,Math.round(im.width*sc)),h=Math.max(1,Math.round(im.height*sc)),cv=cvs(w,h);cv.getContext('2d').drawImage(im,0,0,w,h);res=cv}
    else if(a)waiting=true}                      // ассет есть, но картинка ещё грузится — пока рисуем форму, не кэшируем
  if(!res)res=builtin(c.shape=='mix'?MIX[idx%MIX.length]:c.shape);
  if(!waiting)e.b[idx]=res;return res}
function tex(c,e,idx,step,bk){
  const b=baseTex(c,e,idx);if(!e.tint)return b;
  const key=((bk||0)*1024+idx)*64+step;let t=e.r.get(key);if(t)return t;
  const col=hueRot(colAt(c,(step+.5)/e.steps),c.hue>0?((bk||0)/(HB-1)-.5)*c.hue:0);t=cvs(b.width,b.height);const x=t.getContext('2d');
  x.drawImage(b,0,0);x.globalCompositeOperation='multiply';x.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;x.fillRect(0,0,t.width,t.height);
  x.globalCompositeOperation='destination-in';x.drawImage(b,0,0);
  if(e.b[idx]!==undefined)e.r.set(key,t);return t}

/* ---------- состояние эмиттеров (живёт только в Play / в игре / в предпросмотре) ---------- */
const ST=new Map();
function fresh(o){const c=o.particles||D;return{ps:[],t:0,acc:0,bd:false,bt:0,pend:0,idle:0,last:E.now()/1000,pl:!!E.playing(),prev:null,
  on:!E.playing()||c.awake!==false,rnd:rng(c.seed>0?c.seed:(Math.random()*1e9|0)+1)}}
const stOf=o=>{let s=ST.get(o.id);if(!s){s=fresh(o);ST.set(o.id,s)}return s};

function spawn(st,c,tf,k){
  const R=st.rnd,local=c.space=='local',P=st.ps,lo=Math.min,hi=Math.max,cth=Math.cos(tf.th),sth=Math.sin(tf.th);
  for(let n=0;n<k&&P.length<c.max;n++){
    let ox=0,oy=0;
    if(c.em=='circle'){const a=R()*TAU,r=c.ew*Math.sqrt(R());ox=Math.cos(a)*r;oy=Math.sin(a)*r}
    else if(c.em=='line'){ox=(R()-.5)*c.ew}
    else if(c.em=='rect'){ox=(R()-.5)*c.ew;oy=(R()-.5)*c.eh}
    const base=c.out&&(ox||oy)?Math.atan2(oy,ox)/DEG:c.dir,ang=(base+(R()-.5)*c.spread)*DEG,sp=lerp(lo(c.smin,c.smax),hi(c.smin,c.smax),R()),
      life=lerp(lo(c.lmin,c.lmax),hi(c.lmin,c.lmax),R()),s0=lerp(lo(c.zmin,c.zmax),hi(c.zmin,c.zmax),R()),
      p={age:0,life:Math.max(.02,life),s:s0,rot:lerp(lo(c.rmin,c.rmax),hi(c.rmin,c.rmax),R()),sp:lerp(lo(c.spmin,c.spmax),hi(c.spmin,c.spmax),R()),
         sd:R()*TAU,si:Math.floor(R()*Math.max(1,c.sprites.length)),k:tf.sc,x:0,y:0,vx:0,vy:0};
    if(local){p.x=ox;p.y=oy;p.vx=Math.cos(ang)*sp;p.vy=Math.sin(ang)*sp}
    else{const sc=tf.sc,wa=ang+tf.th;p.x=tf.x+sc*(cth*ox-sth*oy);p.y=tf.y+sc*(sth*ox+cth*oy);p.vx=Math.cos(wa)*sp*sc;p.vy=Math.sin(wa)*sp*sc}
    P.push(p)}}

function advance(c,st,tf,dt){
  const local=c.space=='local',sth=Math.sin(tf.th),cth=Math.cos(tf.th),gx=-c.grav*sth,gy=-c.grav*cth,
    n=Math.max(1,Math.ceil(dt*60)),h=dt/n,P=st.ps,far=st.prev&&Math.hypot(tf.x-st.prev[0],tf.y-st.prev[1])>20;
  const wd=c.wdir*DEG,wx0=Math.cos(wd),wy0=Math.sin(wd),wx=local?wx0*cth+wy0*sth:wx0,wy=local?-wx0*sth+wy0*cth:wy0;   // направление ветра в системе частиц
  for(let j=0;j<n;j++){
    const f=(j+1)/n,e={x:st.prev&&!far?lerp(st.prev[0],tf.x,f):tf.x,y:st.prev&&!far?lerp(st.prev[1],tf.y,f):tf.y,th:tf.th,sc:tf.sc};
    st.t+=h;
    if(st.on){
      if(c.mode=='burst'){
        if(!st.bd){spawn(st,c,e,c.count);st.bd=true;st.bt=0}
        else if(c.rep){st.bt+=h;if(st.bt>=Math.max(.05,c.every)){spawn(st,c,e,c.count);st.bt=0}}}
      else if(c.loop||st.t<=c.dur){st.acc+=c.rate*h;const k=st.acc|0;if(k){st.acc-=k;spawn(st,c,e,k)}}}
    if(st.pend>0){spawn(st,c,e,st.pend);st.pend=0}
    let w=0;
    for(let i=0;i<P.length;i++){const p=P[i];p.age+=h;if(p.age>=p.life)continue;
      let ax=0,ay=0;if(local){ax=gx;ay=gy}else ay=-c.grav*p.k;
      if(c.turb){const X=p.x*c.tsc,Y=p.y*c.tsc,T=st.t,q=p.sd,kk=local?1:p.k;
        ax+=(Math.sin(X*1.3+T*1.1+q)+.5*Math.sin(Y*2.1-T*.7+q*1.7))*c.turb*kk;ay+=(Math.cos(Y*1.2-T*.9+q*2.3)+.5*Math.sin(X*1.9+T*1.3+q*.4))*c.turb*kk}
      if(c.wind){const gm=1+c.gust*Math.sin(st.t*c.gsp*TAU-(p.x*wx+p.y*wy)*.45+p.sd*.15),fw=c.wind*gm*(local?1:p.k);ax+=wx*fw;ay+=wy*fw}   // порывы бегут по направлению ветра
      if(c.drag>0){const d=Math.exp(-c.drag*h);p.vx*=d;p.vy*=d}
      p.vx+=ax*h;p.vy+=ay*h;
      let ux=p.vx,uy=p.vy;if(c.swa){const q=c.swa*(local?1:p.k),ph=st.t*c.swf*TAU+p.sd;ux+=Math.sin(ph)*q;uy+=Math.cos(ph*.83+p.sd*.7)*q}   // Sway: плавное покачивание поверх движения
      p.x+=ux*h;p.y+=uy*h;p.rot+=p.sp*h;P[w++]=p}
    P.length=w;
    if(!st.pl){   // предпросмотр в редакторе: когда эффект доиграл — через паузу запускается снова
      const can=c.mode=='burst'?(!st.bd||c.rep):(c.loop||st.t<=c.dur);
      if(!can&&!P.length){st.idle+=h;if(st.idle>.7){st.t=0;st.bd=false;st.acc=0;st.bt=0;st.idle=0;st.on=true}}else st.idle=0}}
  st.prev=[tf.x,tf.y]}

/* ---------- рисование: вызывается из render() на месте объекта в иерархии ---------- */
function draw(g,o,M,sx,sy,cam,W,H){
  const c=o.particles;if(!c)return;norm(c);
  const pl=!!E.playing();if(!pl&&c.preview===false)return;
  const sc=Math.hypot(M[0],M[1]);if(!(sc>1e-4))return;
  const tf={x:M[4],y:M[5],th:Math.atan2(M[1],M[0]),sc},now=E.now()/1000,paused=pl&&E.paused&&E.paused();
  let st=stOf(o);
  if(st.pl!==pl||(now-st.last>.5&&!paused)){st=fresh(o);ST.set(o.id,st)}   // Play начался / объект был выключен — эффект стартует заново
  let dt=now-st.last;st.last=now;
  if(c.pre>0&&!st.pw&&st.on&&!paused){st.pw=true;st.prev=[tf.x,tf.y];const k=Math.min(900,Math.ceil(c.pre*30));for(let i=0;i<k;i++)advance(c,st,tf,1/30)}   // Prewarm: эффект сразу «уже идёт» (фон, лучи)
  if(!paused&&dt>0)advance(c,st,tf,Math.min(dt,.1));else if(!st.prev)st.prev=[tf.x,tf.y];
  st.tf=tf;
  const P=st.ps;if(!P.length)return;
  W=W||1e9;H=H||1e9;
  const e=entry(c),anch=!c.sprites.length&&c.shape=='ray',local=c.space=='local',cth=Math.cos(tf.th),sth=Math.sin(tf.th),nsp=c.sprites.length,
    useM=typeof g.getTransform=='function',B=useM?g.getTransform():null,op=g.globalCompositeOperation;
  g.globalCompositeOperation=c.glow?'lighter':'source-over';
  for(let i=0;i<P.length;i++){const p=P[i],t=p.age/p.life;
    let al=alphaAt(c,t);if(c.fade>0&&t<c.fade)al*=t/c.fade;
    if(c.twk)al*=1-c.twk+c.twk*(.5+.5*Math.sin(p.age*c.twf*TAU+p.sd));   // Twinkle
    if(al<=.004)continue;
    const kk=local?sc:p.k;let s=p.s*Math.max(0,1+(c.zend-1)*t)*kk*cam.z;if(c.pop)s*=Math.sin(Math.PI*Math.min(1,t));if(s<.6)continue;
    let wx=p.x,wy=p.y;if(local){wx=tf.x+sc*(cth*p.x-sth*p.y);wy=tf.y+sc*(sth*p.x+cth*p.y)}
    const X=sx(wx),Y=sy(wy),m=s*(1+c.stretch*2);if(X<-m||X>W+m||Y<-m||Y>H+m)continue;
    let ang=p.rot*DEG,len=1;
    if(c.face||c.stretch){const vx=local?p.vx*cth-p.vy*sth:p.vx,vy=local?p.vx*sth+p.vy*cth:p.vy,sp=Math.hypot(vx,vy);
      if(c.face&&sp>1e-4)ang+=Math.atan2(vy,vx);else if(local)ang+=tf.th;if(c.stretch)len=1+c.stretch*sp*.12}
    else if(local)ang+=tf.th;
    const idx=nsp>1&&c.flip?Math.min(nsp-1,Math.floor(t*nsp)):(!nsp&&c.shape=='mix'?hbOf({sd:p.sd*3.7})%MIX.length:p.si),step=e.tint?Math.min(e.steps-1,Math.floor(t*e.steps)):0,
      im=tex(c,e,idx,step,c.hue>0&&e.tint?hbOf(p):0),mx=Math.max(im.width,im.height)||1,dw=s*im.width/mx*len,dh=s*im.height/mx,ax0=anch?0:-dw/2;
    g.globalAlpha=al>1?1:al;
    if(!ang&&len==1){g.drawImage(im,X+ax0,Y-dh/2,dw,dh)}
    else{const rr=-ang,co=Math.cos(rr),si=Math.sin(rr);
      if(useM){g.setTransform(B.a*co+B.c*si,B.b*co+B.d*si,-B.a*si+B.c*co,-B.b*si+B.d*co,B.a*X+B.c*Y+B.e,B.b*X+B.d*Y+B.f);g.drawImage(im,ax0,-dh/2,dw,dh)}
      else{g.save();g.translate(X,Y);g.rotate(rr);g.drawImage(im,ax0,-dh/2,dw,dh);g.restore()}}}
  if(useM)g.setTransform(B);g.globalAlpha=1;g.globalCompositeOperation=op}

/* ---------- управление (On Click / редактор) ---------- */
const finished=(c,st)=>c.mode=='burst'?(st.bd&&!c.rep):(!c.loop&&st.t>c.dur);
const api={mk,norm,draw,PRESETS,SHAPES,D,builtin,
  busy(){if(E.playing())return false;let any=false;const L=E.objs();for(const o of L)if(o.particles&&o.active!==false&&o.particles.preview!==false){any=true;break}
    if(ST.size>64){const ids=new Set(L.map(o=>o.id));for(const k of[...ST.keys()])if(!ids.has(k))ST.delete(k)}return any},
  play(o){const c=o.particles;if(!c)return;const st=ST.get(o.id);if(st&&st.on&&!finished(norm(c),st))return;const f=fresh(o);f.on=true;f.pl=!!E.playing();ST.set(o.id,f)},
  stop(o){const st=ST.get(o.id);if(st)st.on=false},
  burst(o,n){if(!o.particles)return;const st=stOf(o);st.pend+=Math.max(0,Math.round(+n||0))},
  clear(o){const st=ST.get(o.id);if(st)st.ps.length=0},
  restart(o){ST.delete(o.id)},
  alive(o){const st=ST.get(o.id);return st?st.ps.length:0},
  reset(){ST.clear()}};
return api}
/*PFXCORE-END*/
function makeLayout(E){
const DEF={
  v:{type:'v',w:3,h:4,pl:.1,pr:.1,pt:.1,pb:.1,sp:.1,al:'UC',fw:false,fh:false,an:true,ad:.25},
  h:{type:'h',w:4,h:2,pl:.1,pr:.1,pt:.1,pb:.1,sp:.1,al:'ML',fw:false,fh:false,an:true,ad:.25},
  grid:{type:'grid',w:3.4,h:3,pl:.1,pr:.1,pt:.1,pb:.1,cw:1,ch:1,sx:.1,sy:.1,corner:'UL',axis:'h',cons:'cols',cnt:3,al:'UC',fit:true,an:true,ad:.25}};
const mk=t=>Object.assign({},DEF[t]||DEF.v),norm=L=>{const d=DEF[L.type]||DEF.v;for(const k in d)if(L[k]===undefined)L[k]=d[k];return L};
const pick=(m,k,d)=>k in m?m[k]:d,AX=a=>[pick({L:0,C:.5,R:1},String(a)[1],.5),pick({U:0,M:.5,L:1},String(a)[0],0)];   // [по X, по Y]: 0 — лево/верх, 1 — право/низ
const r4=v=>Math.round(v*1e4)/1e4;
// видимый размер ребёнка: bw/bh — без scale, w/h — с ним; rs — можно менять размер (Image / Gradient)
const vis=c=>{const z=E.size(c),f=E.fixed(c);return{bw:z[0],bh:z[1],w:z[0]*(f?1:Math.abs(c.sx)||1e-3),h:z[1]*(f?1:Math.abs(c.sy)||1e-3),rs:!f&&!!(c.img||c.grad)}};
/* Плавность: данные объекта (x, y, scale) каждый кадр «подтягиваются» к своему месту в раскладке (экспонента, время ≈ L.ad секунд).
   Поэтому объект, который вставили в раскладку, выпихнули из неё, включили / выключили или отпустили после перетаскивания — красиво доезжает сам.
   Пока пользователь держит объект мышью, его не трогаем (E.pressed), а после отпускания он плавно возвращается на место. */
const ST=new Map();let lastT=0,dt=.0167,busy=false;
const ease=(cur,tg,k)=>k>=1||Math.abs(tg-cur)<5e-4?tg:cur+(tg-cur)*k;
function place(c,s,w,h,cx,cy,L){
  const tx=r4(cx),ty=r4(cy);let tsx=c.sx,tsy=c.sy;
  if(s.rs){tsx=r4((c.sx<0?-1:1)*w/s.bw);tsy=r4((c.sy<0?-1:1)*h/s.bh)}
  const st=ST.get(c.id);
  if(st&&E.pressed()&&(c.x!==st.x||c.y!==st.y||c.sx!==st.sx||c.sy!==st.sy)){busy=true;return}   // объект держат мышью — не мешаем
  const k=(L.an!==false&&(+L.ad)>0)?1-Math.exp(-dt*4.6/Math.max(.02,+L.ad)):1;
  const nx=k>=1?tx:r4(ease(c.x,tx,k)),ny=k>=1?ty:r4(ease(c.y,ty,k)),nsx=k>=1?tsx:r4(ease(c.sx,tsx,k)),nsy=k>=1?tsy:r4(ease(c.sy,tsy,k));
  if(c.x!==nx)c.x=nx;if(c.y!==ny)c.y=ny;if(s.rs){if(c.sx!==nsx)c.sx=nsx;if(c.sy!==nsy)c.sy=nsy}
  if(nx!==tx||ny!==ty||(s.rs&&(nsx!==tsx||nsy!==tsy)))busy=true;
  ST.set(c.id,{x:c.x,y:c.y,sx:c.sx,sy:c.sy})}
function linear(o,L,kids){
  const v=L.type=='v',[W,H]=E.size(o),iw=W-L.pl-L.pr,ih=H-L.pt-L.pb,n=kids.length,sp=+L.sp||0,[ax,ay]=AX(L.al);
  const S=kids.map(vis);
  S.forEach(s=>{let w=s.w,h=s.h;
    if(s.rs){if(v){if(L.fw)w=iw;if(L.fh)h=(ih-sp*(n-1))/n}else{if(L.fh)h=ih;if(L.fw)w=(iw-sp*(n-1))/n}}
    s.fw=Math.max(.01,w);s.fh=Math.max(.01,h)});
  const total=S.reduce((a,s)=>a+(v?s.fh:s.fw),0)+sp*(n-1);
  let pos=v?H/2-L.pt-(ih-total)*ay:-W/2+L.pl+(iw-total)*ax;
  kids.forEach((c,i)=>{const s=S[i];let cx,cy;
    if(v){cy=pos-s.fh/2;pos-=s.fh+sp;cx=-W/2+L.pl+(iw-s.fw)*ax+s.fw/2}
    else{cx=pos+s.fw/2;pos+=s.fw+sp;cy=H/2-L.pt-(ih-s.fh)*ay-s.fh/2}
    place(c,s,s.fw,s.fh,cx,cy,L)})}
function grid(o,L,kids){
  const[W,H]=E.size(o),iw=W-L.pl-L.pr,ih=H-L.pt-L.pb,n=kids.length,cw=Math.max(.01,+L.cw||1),ch=Math.max(.01,+L.ch||1),gx=+L.sx||0,gy=+L.sy||0,[ax,ay]=AX(L.al),hz=L.axis!='v';
  let cols,rows;
  if(L.cons=='cols'){cols=Math.max(1,Math.round(+L.cnt)||1);rows=Math.ceil(n/cols)}
  else if(L.cons=='rows'){rows=Math.max(1,Math.round(+L.cnt)||1);cols=Math.ceil(n/rows)}
  else if(hz){cols=Math.max(1,Math.floor((iw+gx)/(cw+gx)));rows=Math.ceil(n/cols)}
  else{rows=Math.max(1,Math.floor((ih+gy)/(ch+gy)));cols=Math.ceil(n/rows)}
  let uc,ur;if(hz){uc=Math.min(cols,n);ur=Math.ceil(n/uc)}else{ur=Math.min(rows,n);uc=Math.ceil(n/ur)}
  const bw=uc*cw+(uc-1)*gx,bh=ur*ch+(ur-1)*gy,left=-W/2+L.pl+(iw-bw)*ax,top=H/2-L.pt-(ih-bh)*ay;
  kids.forEach((c,i)=>{let col,row;if(hz){col=i%uc;row=Math.floor(i/uc)}else{row=i%ur;col=Math.floor(i/ur)}
    if(L.corner=='UR'||L.corner=='LR')col=uc-1-col;if(L.corner=='LL'||L.corner=='LR')row=ur-1-row;
    const s=vis(c),f=L.fit&&s.rs;
    place(c,s,f?cw:s.w,f?ch:s.h,left+col*(cw+gx)+cw/2,top-row*(ch+gy)-ch/2,L)})}
// раскладка всех объектов с компонентом layout: родители раньше детей (вложенные раскладки)
function apply(){
  const all=E.objs();let any=false;for(const o of all)if(o.layout){any=true;break}if(!any){if(ST.size)ST.clear();return false}
  const now=E.now(),raw=(now-lastT)/1000;dt=lastT&&raw>0&&raw<.1?raw:.0167;lastT=now;busy=false;
  if(ST.size>all.length*2+16){const ids=new Set(all.map(o=>o.id));for(const k of[...ST.keys()])if(!ids.has(k))ST.delete(k)}
  const km=new Map();for(const c of all)if(c.parent!=null){let a=km.get(c.parent);if(!a)km.set(c.parent,a=[]);a.push(c)}
  const dep=o=>{let n=0;for(let p=o;p&&p.parent!=null&&n<64;p=E.get(p.parent))n++;return n};
  const ls=all.filter(o=>o.layout&&o.active!==false).sort((a,b)=>dep(a)-dep(b));
  for(const o of ls){const L=norm(o.layout),kids=(km.get(o.id)||[]).filter(c=>c.active!==false);if(!kids.length)continue;L.type=='grid'?grid(o,L,kids):linear(o,L,kids)}
  return busy}   // true — что-то ещё едет к своему месту: нужен следующий кадр
return{mk,norm,apply,DEF}}
const LAY=makeLayout({objs:()=>objs,get,size,fixed:o=>!!(o.screen||pureMask(o)),now:()=>performance.now(),pressed:()=>false});
const SV=makeScroll({get,objs:()=>objs,order,size,locM,mulM,wmat,invM,apM,kids:id=>kids.get(id)||[],now:()=>performance.now(),playing:()=>true,paused:()=>false,selSet:()=>new Set(),expMode:()=>false,spr:id=>{const a=ast(id);return a&&a.img||null}});
const PFX=makeParticles({ast,now:()=>performance.now(),playing:()=>true,paused:()=>false,objs:()=>objs});

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
  LAY.apply();
  const OL=order(),bst=[],flushB=d=>{while(bst.length&&bst[bst.length-1].d>=d){const b=bst.pop();SV.bars(g,b.o,b.M,sx,sy,cam,false)}};SV.begin(OL,false);
  for(const{o,d,on,M}of OL){flushB(d);if(!on)continue;
    const im=btnView(o),[w,h]=size(o,o.img?im:null);
    const hw=w/2,hh=h/2,ax=Math.abs(M[0])*hw+Math.abs(M[2])*hh,ay=Math.abs(M[1])*hw+Math.abs(M[3])*hh,px=sx(M[4]),py=sy(M[5]);
    if(!o.particles&&(px+ax*cam.z<-8||px-ax*cam.z>CW+8||py+ay*cam.z<-8||py-ay*cam.z>CH+8))continue;
    const cl=SV.clip(g,o,sx,sy),gx=cl&&cl.ctx?cl.ctx:g;
    gx.save();gx.transform(M[0]*cam.z,-M[1]*cam.z,M[2]*cam.z,-M[3]*cam.z,px,py);gx.scale(1,-1);
    if(o.img&&im)drawImg(gx,im,w,h);
    else if(o.text&&im)window.drawText(gx,o.text,im);
    else if(o.grad)window.drawGrad(gx,o.grad,w,h);
    gx.restore();if(o.particles)PFX.draw(gx,o,M,sx,sy,cam,CW,CH);if(cl)SV.endClip(g,cl);if(o.scrollv)bst.push({d,o,M})}
  flushB(-1);
  g.restore()}
function frame(){
  const now=performance.now();
  for(const{o,on}of order()){if(!on){run.pl.delete(o.id);continue}if(!o.animator)continue;const p=player(o);if(!p){run.pl.delete(o.id);continue}if(!rtTick(p,now))run.pl.delete(o.id)}
  render();requestAnimationFrame(frame)}

/* ================= ввод (мышь и касания) ================= */
function bindInput(){
  cvs.addEventListener('pointerdown',e=>{if(e.button)return;cvs.setPointerCapture&&cvs.setPointerCapture(e.pointerId);
    const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;run.down=live(o)?o.id:null;SV.down(toWorld(e),e.clientX,e.clientY);e.preventDefault()});
  cvs.addEventListener('pointermove',e=>{if(SV.move(toWorld(e),e.clientX,e.clientY)){run.down=null;run.hover=null;return}
    if(e.pointerType!='mouse'&&run.down==null)return;const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;cvs.style.cursor=live(o)?'pointer':''});
  const up=e=>{SV.up();const id=run.down;run.down=null;
    if(id!=null){const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;if(o&&o.id==id)fire(o)}
    if(e.pointerType!='mouse')run.hover=null};
  cvs.addEventListener('pointerup',up);
  cvs.addEventListener('pointercancel',()=>{SV.up();run.down=null;run.hover=null});
  cvs.addEventListener('wheel',e=>{const k=e.deltaMode==1?1/3:e.deltaMode==2?1:1/100;if(SV.wheel(toWorld(e),e.deltaX*k,e.deltaY*k,e.shiftKey))e.preventDefault()},{passive:false});
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
