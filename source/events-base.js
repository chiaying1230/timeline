/* ============ 時間軸版本比較：共用的工具與 50 件事件 ============
   事件 = 重大事件表的 18 件（src/00-data.js 的 TREE）＋ pick_events.py 從剪報、研究、學生人數挑出的事件（events.json）。
   照片與訪談沿用 src/60-media.js 的清單：清單是空的時候是版面示意，放入真實資料後就會換成真的。 */
const PICK = /*__EVENTS__*/;
const $ = (s,r) => (r||document).querySelector(s);
const $$ = (s,r) => Array.from((r||document).querySelectorAll(s));
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const vw = () => document.documentElement.clientWidth;
const f1 = v => v.toFixed(1);
// 粗估一段文字畫出來有多寬：中文字算一個字寬，英數字大約半個多一點
const textW = (s,fs) => [...String(s)].reduce((a,ch)=>a+(ch.charCodeAt(0)<256 ? (ch===' '?.3:.58) : 1)*fs, 0);
// 減少動態：作業系統的設定，或頁面上的開關
let calmPick = null;
try{ const v = localStorage.getItem('idtree.tl.calm'); if(v==='1'||v==='0') calmPick = v==='1'; }catch(e){}
const calm = () => calmPick!=null ? calmPick : window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 軌道：除了顏色，每一條的記號形狀也不同 ---------- */
const TRACKS = {
  iq:{name:'智力測驗', shape:'circle', type:'event'},
  ab:{name:'適應行為量表', shape:'square', type:'event'},
  law:{name:'法規與鑑定', shape:'diamond', type:'event'},
  news:{name:'剪報', shape:'tri', type:'news'},
  lit:{name:'研究', shape:'hex', type:'lit'},
  people:{name:'學生人數', shape:'cross', type:'people'}
};
const TK = Object.keys(TRACKS);
const TYPES = {event:'重大事件', news:'剪報', lit:'研究', people:'人數'};
const PREC = {day:'日', month:'月', year:'年', decade:'年代'};
const colorOf = k => 'var(--c-'+k+')';
function mark(shape,x,y,r,attrs){
  attrs = attrs||'';
  if(shape==='square') return `<rect x="${f1(x-r*.9)}" y="${f1(y-r*.9)}" width="${f1(r*1.8)}" height="${f1(r*1.8)}" rx="1.5" ${attrs}/>`;
  if(shape==='diamond') return `<polygon points="${f1(x)},${f1(y-r*1.25)} ${f1(x+r*1.25)},${f1(y)} ${f1(x)},${f1(y+r*1.25)} ${f1(x-r*1.25)},${f1(y)}" ${attrs}/>`;
  if(shape==='tri') return `<polygon points="${f1(x)},${f1(y-r*1.2)} ${f1(x+r*1.15)},${f1(y+r*.85)} ${f1(x-r*1.15)},${f1(y+r*.85)}" ${attrs}/>`;
  if(shape==='hex'){ const p = []; for(let i=0;i<6;i++){ const a = Math.PI/6+i*Math.PI/3; p.push(f1(x+Math.cos(a)*r*1.08)+','+f1(y+Math.sin(a)*r*1.08)); } return `<polygon points="${p.join(' ')}" ${attrs}/>`; }
  if(shape==='cross'){ const a = r*1.1, b = r*.42; return `<polygon points="${[[-b,-a],[b,-a],[b,-b],[a,-b],[a,b],[b,b],[b,a],[-b,a],[-b,b],[-a,b],[-a,-b],[-b,-b]].map(p=>f1(x+p[0])+','+f1(y+p[1])).join(' ')}" ${attrs}/>`; }
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" ${attrs}/>`;
}
// 小圖示：實心，或空心（篩選還沒選到的軌道）
const icon = (k,hollow) => `<svg class="ico" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">${mark(TRACKS[k].shape,7,7,hollow?4:4.6, hollow ? `fill="var(--paper)" stroke="${colorOf(k)}" stroke-width="2"` : `fill="${colorOf(k)}"`)}</svg>`;

/* ---------- 50 件事件 ---------- */
// 重大事件表的重要度（1–3）：縮放到全覽時只寫出 3 的名稱
const IMPORTANCE = {q1:3,q2:2,q3:2,q4:2,q5:3, b1:3,b2:3,b3:2,b4:2,b5:2, l1:3,l2:3,l3:3,l4:2,l5:3,l6:3,l7:3,l8:3};
function parseDate(e){
  const p = String(e.date).split('-').map(Number);
  e.y = p[0]; e.mo = p[1]||0; e.dd = p[2]||0; e.t = p[0]+((p[1]||1)-1)/12+((p[2]||1)-1)/372; e.dec = Math.floor(e.y/10)*10;
}
const EV = [];
TREE.events.filter(e=>e.id!=='root').forEach(e=>{
  const lines = e.desc.split('\n'), k = lines.findIndex(s=>s.startsWith('備註：'));
  const x = {id:e.id, type:'event', track:e.theme, title:e.title, date:e.date, when:e.when, importance:IMPORTANCE[e.id]||2,
    summary:(k<0?lines:lines.slice(0,k)).join('\n'), memo:k<0 ? '' : lines.slice(k).join('\n').replace(/^備註：/,''),
    source:'智能障礙重大事件表', parents:e.parents.filter(p=>p!=='root'), trends:e.trends||[], media:[]};
  parseDate(x);
  x.precision = /年代/.test(e.when||'') ? 'decade' : e.when ? 'year' : x.dd ? 'day' : x.mo ? 'month' : 'year';
  x.certainty = x.precision==='decade' ? 'approx' : 'sure';
  EV.push(x);
});
PICK.forEach(p=>{ const x = Object.assign({parents:[], trends:[], memo:'', media:[]}, p); parseDate(x); if(x.news!=null) x.media.push({kind:'clip', i:x.news}); EV.push(x); });
EV.sort((a,b)=>a.t-b.t || TK.indexOf(a.track)-TK.indexOf(b.track));
EV.forEach((e,i)=>e.n = i);
const byId = Object.fromEntries(EV.map(e=>[e.id,e]));
// 重大事件：附上同一年政策類的剪報（最多 3 篇），當作延伸閱讀
EV.filter(e=>e.type==='event').forEach(e=>{
  NEWS.filter(a=>a.y===e.y && a.pg.includes('政策公告及回應')).slice(0,3).forEach(a=>e.media.push({kind:'clip', i:a.i, rel:true}));
});
// 照片：每張照片掛在年份最接近、還沒有照片的事件上
PHOTOS.forEach(ph=>{
  const c = EV.filter(e=>!e.media.some(m=>m.kind==='photo')).sort((a,b)=>Math.abs(a.y-ph.year)-Math.abs(b.y-ph.year) || b.importance-a.importance)[0];
  if(c) c.media.push({kind:'photo', ph});
});
// 訪談：清單裡寫了 event:'事件 id' 就掛在那件事上；沒寫的，依序掛在最晚的幾件重要事件上
{ const late = EV.filter(e=>e.importance===3).sort((a,b)=>b.t-a.t); let j = 0;
  INTERVIEWS.forEach(iv=>{ const e = (iv.event && byId[iv.event]) || late[j++ % late.length]; if(e) e.media.push({kind:'audio', iv}); }); }
const kidsOf = e => EV.filter(x=>x.parents.includes(e.id));

const whenLong = e => e.precision==='decade' ? '約 '+e.when : e.when ? e.when : e.dd ? `${e.y}年${e.mo}月${e.dd}日` : e.mo ? `${e.y}年${e.mo}月` : `${e.y}年`;
const whenShort = e => e.precision==='decade' ? '約 '+e.when : e.dd ? `${e.y}.${e.mo}.${e.dd}` : e.mo ? `${e.y}.${e.mo}` : `${e.y}`;
const dtAttr = e => e.precision==='decade' ? String(e.dec) : e.dd ? e.date : e.mo ? `${e.y}-${String(e.mo).padStart(2,'0')}` : String(e.y);
const timeTag = e => `<time datetime="${dtAttr(e)}">${esc(whenLong(e))}</time>`;
const trackName = e => TRACKS[e.track].name;
const kindLabel = e => e.type==='event' ? '重大事件・'+trackName(e) : trackName(e);
const evLabel = (e,pos) => [whenLong(e), e.title, kindLabel(e)].concat(pos ? [pos] : []).join('，');

const AX0 = 1962, AX1 = 2026;          // 時間軸的範圍：1962 年初到 2025 年底

/* ---------- 報紙用詞的比例（和正式網站的事件樹背景同一套算法） ---------- */
const TERMS = TREE.trends, TERM_IDS = Object.keys(TERMS);
TERM_IDS.forEach(k=>{ TERMS[k].pts = TERMS[k].curve.map(c=>{ const p = c[0].split('-').map(Number); return [p[0]+((p[1]||1)-1)/12, c[1]]; }); });
const TR_LO = Math.min(...TERM_IDS.map(k=>TERMS[k].pts[0][0])), TR_HI = Math.max(...TERM_IDS.map(k=>TERMS[k].pts[TERMS[k].pts.length-1][0])), DATA_END = Math.ceil(TR_HI);
const STACK = (()=>{ const c = k => { const p = TERMS[k].pts, w = p.reduce((a,x)=>a+x[1],0)||1; return p.reduce((a,x)=>a+x[0]*x[1],0)/w; }; return [...TERM_IDS].sort((a,b)=>c(a)-c(b)); })();
STACK.forEach((k,i)=>TERMS[k].color = 'var(--g'+Math.min(i+1,4)+')');
function termLevel(k,t){
  const p = TERMS[k].pts; if(t<=p[0][0]) return p[0][1];
  for(let i=0;i<p.length-1;i++){ if(t<=p[i+1][0]){ const x = (t-p[i][0])/((p[i+1][0]-p[i][0])||1), s = x*x*(3-2*x); return p[i][1]+(p[i+1][1]-p[i][1])*s; } }
  return p[p.length-1][1];
}
function shares(t){
  t = Math.min(Math.max(t,TR_LO),TR_HI);
  const lv = STACK.map(k=>termLevel(k,t)), sum = lv.reduce((a,b)=>a+b,0);
  let c = 0; return STACK.map((k,i)=>{ const w = sum ? lv[i]/sum : 0, r = [c,c+w]; c += w; return r; });
}
// 每年的剪報篇數（概覽列的密度）
const NEWS_BY_Y = {}; NEWS.forEach(a=>{ NEWS_BY_Y[a.y] = (NEWS_BY_Y[a.y]||0)+1; });
