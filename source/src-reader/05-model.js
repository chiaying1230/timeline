/* Pure reading/filtering rules. Shared with the dependency-free model tests. */
const ReaderData = (() => {
  const types = Object.keys(TRACKS);
  const decades = [...new Set(EV.map(e => e.dec))].sort((a,b) => a-b);
  const terms = [...new Set(NEWS.flatMap(n => n.wg))].sort((a,b) => a.localeCompare(b,'zh-Hant'));
  const defaults = () => ({decades:[], types:[...types], terms:[]});
  const clone = f => ({decades:[...f.decades],types:[...f.types],terms:[...f.terms]});
  const onlyNews = f => f.types.length===1 && f.types[0]==='news';
  function normalize(value={}) {
    const result={decades:[...new Set(value.decades||[])].map(Number).filter(d=>decades.includes(d)),
      types:[...new Set(value.types||[])].filter(t=>types.includes(t)),terms:[...new Set(value.terms||[])].filter(t=>terms.includes(t))};
    result.decades.sort((a,b)=>a-b);result.types.sort((a,b)=>types.indexOf(a)-types.indexOf(b));
    if(!onlyNews(result)) result.terms=[];
    return result;
  }
  function order(e) {
    if(e.precision==='year'||e.precision==='decade') return e.y+0.999;
    return e.y+((e.mo-1)*32+(e.precision==='month'?32:(e.dd||1)))/400;
  }
  const ordered = [...EV].sort((a,b)=>a.y-b.y||order(a)-order(b)||a.id.localeCompare(b.id));
  function acceptsNews(n,f) {return (!f.decades.length||f.decades.includes(n.dec))&&(!f.terms.length||n.wg.some(w=>f.terms.includes(w)));}
  function filterEvents(f) {return ordered.filter(e=>(!f.decades.length||f.decades.includes(e.dec))&&f.types.includes(e.track)&&(!onlyNews(f)||e.news!=null&&acceptsNews(NEWS[e.news],f)));}
  function filterNews(f,q='') {const query=q.trim().toLocaleLowerCase();return NEWS.filter(n=>acceptsNews(n,f)&&(!query||[n.t,n.o,...n.w,...n.wg,...n.p,n.v,n.v2].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));}
  function nearest(list,id) {if(!list.length)return null;const exact=list.find(e=>e.id===id);if(exact)return exact;const old=byId[id];if(!old)return list[0];return list.reduce((best,e)=>Math.abs(order(e)-order(old))<Math.abs(order(best)-order(old))?e:best,list[0]);}
  const names={n0:'本站最早收錄的剪報',n2:'教育局設班告家長書的報導',n60:'家長陳情的相關報導',n87:'使用「智障」用語的剪報',n737:'本站最後收錄的剪報（2022）'};
  function title(e) {if(names[e.id])return names[e.id];if(e.type==='lit'&&e.title.startsWith('第一篇'))return '本站收錄的'+e.title.replace('第一篇','首篇');return e.title;}
  function easy(e) {
    if(!e.easy&&e.news!=null){const n=NEWS[e.news];return [`${n.d.replace(/-/g,'．')}，${n.o}刊出一篇報導。`,`整理標題是「${n.t}」。`,`這篇剪報編到的用語：${n.wg.join('、')||'未編碼'}。`];}
    const lines=(e.easy||e.summary).split('\n').filter(Boolean);
    if(e.type==='lit') return ['以下描述以本站收錄的研究資料為範圍。',...lines];
    return lines;
  }
  function date(e) {if(e.precision==='decade')return '約 '+(e.when||e.y+' 年代');if(e.precision==='year')return e.y+' 年（月日未詳）';if(e.precision==='month')return e.y+' 年 '+e.mo+' 月（日未詳）';return `${e.y} 年 ${e.mo} 月 ${e.dd} 日`;}
  function summary(f) {
    const allDecades = !f.decades.length || decades.every(decade => f.decades.includes(decade));
    const d = allDecades ? '全部年代' : f.decades.join('、') + ' 年代';
    const t=f.types.length===types.length?'全部類型':f.types.map(t=>TRACKS[t].name).join('、');
    return [d,t,f.terms.length?f.terms.join('、'):''].filter(Boolean).join('｜');
  }
  function searchEvents(list,query='') {
    const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return list.filter(e=>{const text=[e.y,title(e),e.title,e.summary,e.source,TRACKS[e.track].name].join(' ').toLocaleLowerCase();return terms.every(t=>text.includes(t));});
  }
  function readingState(value={}) {
    if(!value||typeof value!=='object')value={};
    const f=value.filters&&typeof value.filters==='object'?value.filters:defaults();
    const safe={decades:Array.isArray(f.decades)?f.decades:[],types:Array.isArray(f.types)?f.types:types,terms:Array.isArray(f.terms)?f.terms:[]};
    const filters=normalize(safe),list=filterEvents(filters);
    return {filters,anchor:nearest(list,typeof value.anchor==='string'?value.anchor:null)?.id||null,
      open:Array.isArray(value.open)?[...new Set(value.open)].filter(id=>list.some(e=>e.id===id)):[],view:value.view==='list'?'list':'timeline'};
  }
  function encodeReading(value) {
    const s=readingState(value),p=new URLSearchParams();
    p.set('d',s.filters.decades.join(','));p.set('t',s.filters.types.join(','));
    if(s.filters.terms.length)p.set('w',JSON.stringify(s.filters.terms));
    if(s.anchor)p.set('at',s.anchor);if(s.open.length)p.set('open',s.open.join(','));
    if(s.view==='list')p.set('view','list');return p.toString();
  }
  function decodeReading(query) {
    const p=new URLSearchParams(query);let terms=[];
    try{terms=JSON.parse(p.get('w')||'[]');}catch{}
    return readingState({filters:{decades:(p.get('d')||'').split(',').filter(Boolean),types:p.has('t')?p.get('t').split(','):types,terms},anchor:p.get('at'),open:(p.get('open')||'').split(','),view:p.get('view')});
  }
  return {types,decades,terms,defaults,clone,onlyNews,normalize,order,ordered,acceptsNews,filterEvents,filterNews,nearest,title,easy,date,summary,searchEvents,readingState,encodeReading,decodeReading};
})();
