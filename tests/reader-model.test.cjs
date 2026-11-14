const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,'source',p),'utf8');
const context=vm.createContext({console,URLSearchParams});
const source=read('data.js').replace('/*__DATA__*/',read('data.json'))+
  '\nconst PHOTOS=[], INTERVIEWS=[];\n'+read('src-reader/02-sheet.js')+
  '\nconst SHEET=SheetData.build('+read('sheet-snapshot.json')+',NEWS.length);\n'+read('events-base.js')+
  read('src-reader/05-model.js')+'\nglobalThis.data=ReaderData;globalThis.events=EV;globalThis.news=NEWS;globalThis.sheet=SHEET;globalThis.S=SheetData;';
vm.runInContext(source,context);
const D=context.data;
test('all seven selected decades have the same short label as the default range', () => {
  const filters = D.defaults();
  assert.equal(D.summary({...filters, decades:[...D.decades]}), D.summary(filters));
  assert.match(D.summary({...filters, decades:[1970, 1990]}), /1970、1990 年代/);
});
test('built-in snapshot retains the 50 events and 738 clippings without problems',()=>{assert.deepEqual([...context.sheet.problems],[]);assert.equal(context.sheet.origin,'snapshot');assert.equal(context.events.length,50);assert.equal(context.news.length,738);assert.equal(D.filterEvents(D.defaults()).length,50);assert.equal(new Set(context.events.map(e=>e.id)).size,50);});
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

const S=context.S;
const plain=v=>JSON.parse(JSON.stringify(v));
test('CSV parsing keeps quoted commas, quotes and line breaks inside cells',()=>{
 const rows=S.parseCSV('﻿"編號","標題","完整說明"\r\n"x1","a, ""b""","第一行\n第二行"\r\n"","",""\r\n"x2","c",""\r\n');
 assert.deepEqual(plain(rows[1]),['x1','a, "b"','第一行\n第二行']);
 const objects=plain(S.toObjects(rows));assert.equal(objects.length,2);assert.equal(objects[1]._row,4);assert.equal(objects[0]['完整說明'],'第一行\n第二行');
});
test('sheet event rows accept loose dates, skip hidden or invalid rows and report why',()=>{
 const problems=[];
 const rows=[{_row:2,'編號':'x1','類型':'研究','日期':'1984/12/7','標題':'甲'},{_row:3,'編號':'x2','顯示':'否','類型':'研究','日期':'1985','標題':'乙'},
  {_row:4,'編號':'x1','類型':'研究','日期':'1986','標題':'重複'},{_row:5,'編號':'x3','類型':'不存在','日期':'1986','標題':'丙'},{_row:6,'編號':'x4','類型':'剪報','日期':'去年','標題':'丁'},
  {_row:7,'編號':'x5','類型':'剪報','日期':'1990-06','日期精確度':'日','標題':'戊','剪報序號':'99999'},{_row:8,'編號':'x6','類型':'適應行為量表','日期':'1975','日期精確度':'年代','標題':'己'}];
 const got=plain(S.toEvents(rows,738,problems));
 assert.deepEqual(got.map(e=>e.id),['x1','x5','x6']);assert.equal(got[0].date,'1984-12-07');assert.equal(got[0].precision,'day');assert.equal(got[0].type,'lit');
 assert.equal(got[1].precision,'month');assert.equal(got[1].news,undefined);assert.equal(got[2].when,'1970年代');assert.equal(got[2].certainty,'approx');
 assert.equal(problems.length,4);assert(problems.every(p=>/第 \d 列/.test(p)));
});
test('links resolve by source and kind, and unsafe values are rejected',()=>{
 const id='1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
 const audio=S.resolveLink('https://drive.google.com/file/d/'+id+'/view?usp=drivesdk','audio');
 assert.equal(audio.src,'https://drive.google.com/uc?export=download&id='+id);assert.equal(audio.embed,'https://drive.google.com/file/d/'+id+'/preview');
 assert.equal(S.resolveLink('https://drive.google.com/open?id='+id,'photo').src,'https://lh3.googleusercontent.com/d/'+id+'=w1600');
 assert.equal(S.resolveLink('https://drive.google.com/file/d/'+id+'/view','video').embed,'https://drive.google.com/file/d/'+id+'/preview');
 for(const url of ['https://youtu.be/dQw4w9WgXcQ?t=3','https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x','https://youtube.com/shorts/dQw4w9WgXcQ'])assert.equal(S.resolveLink(url,'video').embed,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(S.resolveLink('https://youtu.be/dQw4w9WgXcQ','audio'),null);
 assert.equal(S.resolveLink('assets/interview.mp3','audio').src,'assets/interview.mp3');assert.equal(S.resolveLink('https://example.org/a.mp3','audio').src,'https://example.org/a.mp3');
 for(const bad of ['','javascript:alert(1)','data:text/html,x','//evil.example/x.js','../secret','https://a.example/"onerror="x'])assert.equal(S.resolveLink(bad,'photo'),null,bad);
});
test('transcripts parse timed, translated and untimed lines',()=>{
 const got=plain(S.parseTranscript('0:05 第一段\n1:20 Hello | 你好\n[1:02:03] 很後面\n沒有時間的一行'));
 assert.deepEqual(got.map(s=>s.time),[5,80,3723,null]);assert.equal(got[1].text,'Hello');assert.equal(got[1].translation,'你好');assert.equal(got[3].text,'沒有時間的一行');
});
test('attachment rows attach to known events only and need usable content',()=>{
 const problems=[];
 const rows=[{_row:2,'編號':'a001','事件編號':'l3, n0','種類':'錄音','標題':'訪談','連結':'assets/a.mp3','逐字稿':'0:00 開始'},{_row:3,'編號':'a002','事件編號':'l3','種類':'文字','標題':'說明','內文':'一段文字'},
  {_row:4,'編號':'a003','顯示':'否','事件編號':'l3','種類':'照片','連結':'assets/a.png'},{_row:5,'編號':'a004','事件編號':'nope','種類':'照片','連結':'assets/a.png'},
  {_row:6,'編號':'a005','事件編號':'l3','種類':'影片','連結':'javascript:alert(1)'},{_row:7,'編號':'a006','事件編號':'l3','種類':'文字','內文':''},{_row:8,'編號':'a001','事件編號':'q1','種類':'影片','連結':'https://youtu.be/dQw4w9WgXcQ'}];
 const got=plain(S.toMedia(rows,['l3','n0','q1'],problems));
 assert.deepEqual(got.map(m=>m.id),['a001','a002','a001-r8']);assert.deepEqual(got[0].events,['l3','n0']);assert.equal(got[0].segments.length,1);assert.equal(got[1].link,null);assert.equal(got[2].link.provider,'youtube');
 assert.equal(problems.length,3);
});

// Apps Script helpers that do not touch Google services.
const gs=vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(root,'sheet','Code.gs'),'utf8')+'\nglobalThis.G={SEED_EVENTS,EVENT_HEADERS,MEDIA_HEADERS,nextAttachmentId,nextEventId,folderIdFromUrl,validateEvent,validPasscode,passcodeMatches,eventLabel,rowsToObjects,buildRow,validateAttachment,findProblems};',gs);
const G=gs.G;
test('Apps Script seed matches the built-in snapshot and passes its own data check',()=>{
 const snapshot=JSON.parse(read('sheet-snapshot.json'));assert.deepEqual(plain(G.SEED_EVENTS),snapshot.events);
 for(const event of snapshot.events)assert(Object.keys(event).every(key=>G.EVENT_HEADERS.includes(key)));
 assert.deepEqual(plain(G.findProblems(G.SEED_EVENTS.map((e,i)=>({...e,_row:i+2})),[])),[]);
});
test('Apps Script numbers attachments, labels events and writes rows in header order',()=>{
 assert.equal(G.nextAttachmentId([]),'a001');assert.equal(G.nextAttachmentId(['a001','a012','自訂','a2']),'a013');assert.equal(G.nextAttachmentId(['a999']),'a1000');
 assert.equal(G.eventLabel({'日期':'1990-01-12','標題':'福利法改稱智能障礙者','類型':'法規與鑑定'}),'1990｜福利法改稱智能障礙者（法規與鑑定）');
 assert.deepEqual(plain(G.buildRow(['標題',' 編號 ','自訂欄'],{'編號':'a001','標題':'甲','連結':'x'})),['甲','a001','']);
 assert.deepEqual(plain(G.rowsToObjects([['編號','標題'],['a1','甲'],['',''],['a2','乙']])).map(o=>o._row),[2,4]);
});
test('Apps Script form validation asks for the right content per kind',()=>{
 const base={eventId:'l3',title:'標題'};
 assert.equal(G.validateAttachment({...base,kind:'文字',text:'內容'}),'');assert.notEqual(G.validateAttachment({...base,kind:'文字'}),'');
 assert.equal(G.validateAttachment({...base,kind:'錄音',file:{data:'AAAA'}}),'');assert.equal(G.validateAttachment({...base,kind:'錄音',link:'https://drive.google.com/file/d/x/view'}),'');
 assert.notEqual(G.validateAttachment({...base,kind:'錄音'}),'');assert.notEqual(G.validateAttachment({...base,kind:'影片',file:{data:'AAAA'}}),'');
 assert.notEqual(G.validateAttachment({...base,kind:'照片',link:'javascript:alert(1)'}),'');assert.notEqual(G.validateAttachment({kind:'照片',title:'x',link:'https://a.example/x.png'}),'');
 assert.notEqual(G.validateAttachment({...base,kind:'其他',link:'https://a.example/x.png'}),'');
 const problems=plain(G.findProblems([{_row:2,'編號':'l3','類型':'法規與鑑定','日期':'1990-01-12','標題':'甲'}],[{_row:2,'事件編號':'l3、zz','種類':'錄音','連結':''}]));
 assert.equal(problems.length,2);
});
test('Apps Script passcode and new-event checks',()=>{
 assert(!G.validPasscode('12345'));assert(G.validPasscode('123456'));assert(!G.validPasscode(undefined));
 assert(G.passcodeMatches('年表通關密語',' 年表通關密語 '));for(const wrong of ['','年表通關密','年表通關密語x',undefined,null])assert(!G.passcodeMatches('年表通關密語',wrong));
 assert.equal(G.nextEventId(['l3','n0','e001','e007']),'e008');assert.equal(G.nextEventId(['l3']),'e001');
 const ok={track:'研究',date:'1984-12-17',title:'標題'};assert.equal(G.validateEvent(ok),'');assert.equal(G.validateEvent({...ok,date:'1984'}),'');assert.equal(G.validateEvent({...ok,date:'1984/6'}),'');
 for(const bad of [{...ok,track:'其他'},{...ok,date:'去年'},{...ok,date:'1984-13'},{...ok,date:'1984-12-32'},{...ok,date:'84'},{...ok,title:' '},null])assert.notEqual(G.validateEvent(bad),'');
 assert(G.EVENT_HEADERS.includes('填寫人')&&G.MEDIA_HEADERS.includes('填寫人'));
});
test('Apps Script reads a Drive folder ID from pasted links',()=>{
 const id='1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
 for(const value of ['https://drive.google.com/drive/folders/'+id+'?usp=sharing','https://drive.google.com/drive/u/1/folders/'+id,'https://drive.google.com/open?id='+id,' '+id+' '])assert.equal(G.folderIdFromUrl(value),id);
 for(const value of ['','https://example.org/','資料夾',null])assert.equal(G.folderIdFromUrl(value),'');
});
