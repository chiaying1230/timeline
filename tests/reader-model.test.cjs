const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,'source',p),'utf8');
const context=vm.createContext({console,URLSearchParams});
const source=read('data.js').replace('/*__DATA__*/',read('data.json'))+
  '\nconst PHOTOS=[], INTERVIEWS=[];\n'+read('events-base.js').replace('/*__EVENTS__*/',read('events.json'))+
  read('easy.js')+read('src-reader/05-model.js')+'\nglobalThis.data=ReaderData;globalThis.events=EV;globalThis.news=NEWS;';
vm.runInContext(source,context);
const D=context.data;
test('retains the exact 50 events and 738 clippings',()=>{assert.equal(context.events.length,50);assert.equal(context.news.length,738);assert.equal(D.filterEvents(D.defaults()).length,50);assert.equal(new Set(context.events.map(e=>e.id)).size,50);});
test('type choices OR together, decade and terms AND across groups',()=>{
 const f=D.normalize({decades:[1980],types:['news','lit']});
 const result=D.filterEvents(f);assert(result.length>0);assert(result.every(e=>e.dec===1980&&['news','lit'].includes(e.track)));assert(result.some(e=>e.track==='news'));assert(result.some(e=>e.track==='lit'));
});
test('newspaper language uses actual grouped codes and counts full archive independently',()=>{
 const term=context.news[0].wg[0],f=D.normalize({decades:[],types:['news'],terms:[term]});
 const picked=D.filterEvents(f),full=D.filterNews(f);
 assert(picked.length>0);assert(full.length>=picked.length);assert(picked.every(e=>context.news[e.news].wg.includes(term)));assert(full.every(n=>n.wg.includes(term)));
});
test('changing away from news-only clears hidden term constraints',()=>{const f=D.normalize({types:['news','law'],terms:[context.news[0].wg[0]]});assert.equal(f.terms.length,0);assert(D.filterEvents(f).some(e=>e.track==='law'));});
test('same-year day/month dates precede unknown dates, including December 31',()=>{
 const year={y:2000,precision:'year'},lastDay={y:2000,mo:12,dd:31,precision:'day'},lastMonth={y:2000,mo:12,precision:'month'};
 assert(D.order(lastDay)<D.order(lastMonth));assert(D.order(lastMonth)<D.order(year));assert(D.order(year)<D.order({y:2001,mo:1,dd:1,precision:'day'}));
 for(let i=1;i<D.ordered.length;i++)assert(D.order(D.ordered[i-1])<=D.order(D.ordered[i]));
});
test('nearest reader anchor keeps exact event or nearest remaining date',()=>{
 const old=context.events.find(e=>e.id==='l3');assert.equal(D.nearest(D.ordered,'l3').id,'l3');const filtered=D.filterEvents(D.normalize({types:['news']}));const got=D.nearest(filtered,'l3');assert(got);assert.equal(Math.abs(D.order(got)-D.order(old)),Math.min(...filtered.map(e=>Math.abs(D.order(e)-D.order(old)))));assert.equal(D.nearest([],'l3'),null);
});
test('archive search is independent from the 50 selected events',()=>{assert.equal(D.filterNews(D.defaults()).length,738);const row=context.news[30];assert(D.filterNews(D.defaults(),row.t).some(n=>n.i===row.i));assert.equal(D.filterNews(D.defaults(),'NO_MATCH_123_XYZ').length,0);});
test('media attachments resolve to local files and real event IDs',()=>{
 const manifest=JSON.parse(read('reader-media.json'));for(const item of manifest.items){assert(fs.existsSync(path.join(root,'source',item.src)));assert(item.sample);for(const id of item.events)assert(context.events.some(e=>e.id===id));if(item.kind==='audio')assert(item.segments.length>0);}
});

test('shared reading link round-trips Chinese terms, selected event, open panels and reading view',()=>{
 const filters=D.normalize({decades:[1980],types:['news'],terms:['智能不足']});
 const selected=D.filterEvents(filters)[0];assert(selected);
 const original=D.readingState({filters,anchor:selected.id,open:[selected.id],view:'list'});
 assert.deepEqual(D.decodeReading(D.encodeReading(original)),original);
});
test('empty type selection stays empty in a shared link rather than broadening to everything',()=>{
 const restored=D.decodeReading('d=&t=&at=l3');assert.equal(restored.filters.types.length,0);assert.equal(restored.anchor,null);
});
test('malformed or outdated saved state cannot introduce unknown records or hidden term constraints',()=>{
 for(const value of [null,{}, {filters:{types:'news',decades:1990,terms:{}},open:'l3'}, {filters:{types:['news','law'],terms:['智能不足']},anchor:'missing',open:['missing','l3','l3']}]){
  const restored=D.readingState(value);assert(Array.isArray(restored.open));assert(restored.open.every(id=>context.events.some(e=>e.id===id)));assert.equal(new Set(restored.open).size,restored.open.length);
 }
 assert.equal(D.decodeReading('t=news&w=%7Bbroken').filters.terms.length,0);
 assert.equal(D.decodeReading('t=news&w=%7B%7D').filters.terms.length,0);
 const restored=D.readingState({filters:{types:['law'],decades:[1990]},anchor:'n0',open:['n0']});assert.equal(restored.open.length,0);assert.equal(restored.anchor,'l3');
});
test('event search respects the selected reading range and supports multiple terms',()=>{
 const list=D.filterEvents(D.normalize({types:['law'],decades:[1990]}));
 assert(D.searchEvents(list,'1990 福利').some(e=>e.id==='l3'));assert.equal(D.searchEvents(list,'WISC').length,0);assert.equal(D.searchEvents(list,'NO_MATCH_XYZ').length,0);assert.equal(D.searchEvents(list,'   ').length,list.length);
});
