/* Production reader: batch filters, stable horizontal event positions, inline media. */
(() => {
  const D=ReaderData, el=id=>document.getElementById(id), all=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const prefs=(()=>{try{return JSON.parse(localStorage.getItem('history-timeline.preferences.v1')||'{}');}catch{return {};}})();
  const state={applied:D.defaults(),draft:D.defaults(),hasRead:false,mode:'select',open:new Set(),anchor:null,scroll:0,pageScroll:0,query:'',limit:40,easy:prefs.easy!==false,large:!!prefs.large};
  let lastList=[], scrollFrame=0, saveTimer=0, restoring=false, followedDecade=null;
  state.view='timeline';state.newsAll=false;
  const progressKey='history-timeline.progress.v1';
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  const modes={select:'selection',read:'reader',news:'newsLibrary'};
  const say=text=>{el('readerStatus').textContent=text;};
  function pauseAudio(root=document){all('audio',root).forEach(a=>a.pause());}
  function savePrefs(){try{localStorage.setItem('history-timeline.preferences.v1',JSON.stringify({easy:state.easy,large:state.large}));}catch{}}
  function applyPrefs(){document.documentElement.classList.toggle('large-text',state.large);all('.easy-section').forEach(n=>n.hidden=!state.easy);all('.full-description').forEach(n=>n.open=!state.easy);el('easyToggle').checked=state.easy;el('largeToggle').checked=state.large;}
  function capturePosition(){if(state.mode!=='read')return;const v=el('timelineViewport');state.scroll=v.scrollLeft;state.pageScroll=window.scrollY;const left=v.getBoundingClientRect().left;if(state.view==='list'&&el('timeline').getBoundingClientRect().top>100)return;const items=all('#timeline>li');const first=state.view==='list'?items.find(n=>n.getBoundingClientRect().bottom>100):items.find(n=>n.getBoundingClientRect().right>left+20);if(first)state.anchor=first.dataset.event;}
  function mode(next,{history=true,focus=true}={}) {
    capturePosition();pauseAudio();state.mode=next;document.body.dataset.mode=next;
    Object.entries(modes).forEach(([key,id])=>el(id).hidden=key!==next);
    el('navNews').setAttribute('aria-current',next==='news'?'page':'false');
    if(history){const hash=next==='read'?'#read':next==='news'?'#clippings':'#filters';if(location.hash.split('?')[0]!==hash)window.history.pushState({reader:true},'',hash);writeLocation();}
    if(next==='read'){
      requestAnimationFrame(()=>{el('timelineViewport').scrollLeft=state.scroll;window.scrollTo(0,state.pageScroll);syncNav();});
      if(focus)el('editFilters').focus({preventScroll:true});queueSave();
    } else if(next==='select'){syncPicker();window.scrollTo(0,0);if(focus)el('selectionTitle').focus({preventScroll:true});}
    else {window.scrollTo(0,0);if(focus)el('newsTitle').focus({preventScroll:true});}
  }
  function addChoice(container,id,label,key,kind){
    const item=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id=id;input.value=String(key);input.dataset.filter=kind;item.append(input,document.createTextNode(label));if(kind==='types')item.style.setProperty('--category','var(--'+key+')');container.append(item);
  }
  D.decades.forEach(d=>addChoice(el('decadeOptions'),'decade-'+d,d+' 年代',d,'decades'));
  D.types.forEach(t=>addChoice(el('typeOptions'),'type-'+t,TRACKS[t].name,t,'types'));
  D.terms.forEach((t,i)=>addChoice(el('wordOptions'),'word-'+i,t,t,'terms'));
  function syncPicker(){
    const f=state.draft;all('[data-filter]').forEach(i=>i.checked=f[i.dataset.filter].includes(i.dataset.filter==='decades'?Number(i.value):i.value));
    el('wordField').hidden=!D.onlyNews(f);const matches=D.filterEvents(f), n=matches.length;el('filterPreview').textContent=n?('從 '+matches[0].y+' 年到 '+matches[n-1].y+' 年；第一件：'+D.title(matches[0])):'試著減少限制，或重設條件。';
    el('filterCount').textContent=!f.types.length?'請至少選取一種事件類型。':`符合 ${n} 件精選事件，共 ${EV.length} 件。`;
    el('applyButton').disabled=!f.types.length;
    el('applyButton').textContent=state.hasRead?'套用並繼續閱讀':'開始閱讀';
    el('cancelFilters').hidden=!state.hasRead;el('readAll').textContent=state.hasRead?'改看全部':'直接看全部';
    el('selectionTitle').textContent=state.hasRead?'調整閱讀範圍':'選擇閱讀範圍';
  }
  function edit(){capturePosition();state.draft=D.clone(state.applied);mode('select');}
  el('filterForm').addEventListener('change',()=>{
    const value={decades:[],types:[],terms:[]};all('[data-filter]:checked').forEach(i=>value[i.dataset.filter].push(i.value));
    state.draft=D.normalize(value);syncPicker();
  });
  el('selectAllTypes').addEventListener('click',()=>{state.draft.types=[...D.types];state.draft.terms=[];syncPicker();});
  el('onlyNews').addEventListener('click',()=>{state.draft.types=['news'];syncPicker();say('已選取剪報，現在可以設定新聞用語。');});
  function commit(f){
    const oldAnchor=state.anchor, changed=JSON.stringify(f)!==JSON.stringify(state.applied), first=!state.hasRead;
    state.applied=D.clone(f);state.hasRead=true;
    if(first||changed){pauseAudio();lastList=D.filterEvents(state.applied);renderTimeline(lastList);const target=first?lastList[0]:D.nearest(lastList,oldAnchor);state.anchor=target?.id||null;state.scroll=target?offsetFor(target.id):0;state.pageScroll=0;}
    const targetId=state.anchor;
    mode('read');if(first||changed)requestAnimationFrame(()=>jump(targetId,{smooth:false}));say(`已套用篩選，顯示 ${lastList.length} 件精選事件。`);
  }
  el('filterForm').addEventListener('submit',e=>{e.preventDefault();if(state.draft.types.length)commit(state.draft);});
  el('readAll').addEventListener('click',()=>commit(D.defaults()));el('cancelFilters').addEventListener('click',()=>{state.draft=D.clone(state.applied);mode('read');});
  el('editFilters').addEventListener('click',edit);
  function mediaFor(event){return READER_MEDIA.items.filter(m=>m.events?.includes(event.id)||(m.allNews&&event.track==='news'));}
  function mediaHtml(event){
    const items=mediaFor(event);if(!items.length)return '';
    const heading=[...new Set(items.map(m=>({photo:'照片',clip:'剪報',audio:'錄音'})[m.kind]))].join('、');
    return `<section class="media-section" aria-label="事件附件"><h3>事件附件</h3>${items.some(m=>m.sample)?'<p class="sample-notice">以下示例僅呈現附件樣式，與此事件沒有史料關聯。真實原件尚待提供。</p>':''}<div class="media-switch" role="group" aria-label="選擇附件">${items.map((m,i)=>`<button type="button" data-media-select="${esc(m.id)}" aria-pressed="${i===0}">${({photo:'照片',clip:'剪報',audio:'錄音'})[m.kind]}</button>`).join('')}</div>${items.map((m,i)=>{
      const key=event.id+'-'+m.id,badge=m.sample?'<span class="sample-badge">示意</span>':'';
      if(m.kind==='audio')return `<section class="media-item" data-kind="audio" data-media-panel="${esc(m.id)}"${i?' hidden':''}><h4>${esc(m.title)}${badge}</h4><audio id="audio-${key}" class="audio-player" controls preload="none" src="${esc(m.src)}" aria-label="${esc(m.title+(m.sample?'，合成語音示例':''))}"></audio><p class="audio-error" hidden>音檔目前無法載入；仍可閱讀下方逐字稿。</p><label class="audio-speed">播放速度<select data-audio-speed="audio-${key}"><option value="0.75">0.75 倍</option><option value="1" selected>1 倍</option><option value="1.25">1.25 倍</option><option value="1.5">1.5 倍</option></select></label><p class="media-caption">${esc(m.caption||'')}</p><details class="transcript more"><summary>閱讀逐字稿與中文對照</summary><ol>${(m.segments||[]).map((s,i)=>`<li data-audio="audio-${key}" data-segment="${i}" data-start="${s.time}"><button type="button" data-seek="${s.time}" data-player="audio-${key}">${Math.floor(s.time/60)}:${String(Math.floor(s.time%60)).padStart(2,'0')} 跳至此段</button><p>${esc(s.text)}</p>${s.translation?`<p class="translation">${esc(s.translation)}</p>`:''}</li>`).join('')}</ol></details></section>`;
      return `<figure class="media-item" data-kind="${esc(m.kind)}" data-media-panel="${esc(m.id)}"${i?' hidden':''}><h4>${esc(m.title)}${badge}</h4><button class="image-button" type="button" data-image="${esc(m.id)}" aria-label="放大${esc(m.title)}"><img src="${esc(m.src)}" alt="${esc(m.alt||m.title)}" loading="lazy" width="${m.kind==='photo'?600:640}" height="${m.kind==='photo'?400:480}"></button><figcaption class="media-caption">${esc(m.caption||'')}</figcaption>${m.kind==='clip'?`<details class="more"><summary>閱讀剪報文字說明</summary><p>${esc(m.text||'原件文字待補。')}</p></details>`:''}</figure>`;
    }).join('')}</section>`;
  }
  function eventHtml(e){
    const easy=D.easy(e),sample=mediaFor(e),labels=[...new Set(sample.map(m=>({photo:'照片',clip:'剪報圖',audio:'錄音'})[m.kind]))];
    const n=e.news!=null?NEWS[e.news]:null;
    return `<details class="event-details" data-ev="${esc(e.id)}"${state.open.has(e.id)?' open':''}><summary><div class="event-meta"><span>${esc(e.precision==='decade'?'約 '+e.y+' 年代':e.y+' 年')}</span><span class="category">${esc(TRACKS[e.track].name)}</span></div><div class="event-title">${esc(D.title(e))}</div>${labels.length?`<p class="media-indicator">附${labels.join('、')}${sample.some(m=>m.sample)?'示例':''}</p>`:''}</summary><div class="event-body"><p class="event-date">${esc(D.date(e))}</p><section class="easy-section"${state.easy?'':' hidden'}><p class="draft-label">易讀介紹（草稿，待審閱）</p><div class="easy-text">${easy.map(t=>`<p>${esc(t)}</p>`).join('')}</div></section><details class="more full-description"${state.easy?'':' open'}><summary>完整說明與資料來源</summary><div class="full-text">${e.summary.split('\n').map(t=>`<p>${esc(t)}</p>`).join('')}${e.memo?e.memo.split('\n').map(t=>`<p>${esc(t)}</p>`).join(''):''}</div><dl class="source"><dt>原始標題</dt><dd>${esc(e.title)}</dd><dt>資料來源</dt><dd>${esc(e.source)}</dd>${e.why?`<dt>精選理由（以本站資料為範圍）</dt><dd>${esc(e.why)}</dd>`:''}<dt>日期精確度</dt><dd>${esc(PREC[e.precision])}${e.certainty==='approx'?'（約略）':''}</dd></dl>${n?`<p class="clip-codes">用詞：${esc(n.w.join('、')||'未編')}<br>觀點：${esc(n.v||'未編')}<br>主題：${esc(n.p.join('、')||'未編')}</p>`:''}</details>${mediaHtml(e)}<div class="event-actions"><button type="button" class="text-button" data-share-event="${esc(e.id)}">分享此事件</button><button type="button" class="text-button" data-close-event="${esc(e.id)}">收起介紹 ↑</button></div></div></details>`;
  }
  function renderTimeline(list){
    pauseAudio(el('timeline'));let decade=null;
    el('timeline').innerHTML=list.map(e=>{const name=decade!==e.dec?e.dec+' 年代':'';decade=e.dec;return `<li data-event="${esc(e.id)}" style="--category:var(--${e.track})"><div class="decade-label">${name}</div>${eventHtml(e)}</li>`;}).join('');
    el('timelineViewport').hidden=!list.length;el('readerEmpty').hidden=!!list.length;
    const label=D.summary(state.applied);el('appliedSummary').textContent=label;
    el('readingCount').textContent=`顯示 ${list.length} / ${EV.length} 件精選事件`;
    const only=D.onlyNews(state.applied);el('allNewsLink').hidden=!only;
    if(only)el('relatedNewsCount').textContent=`完整剪報資料中有 ${D.filterNews(state.applied).length} 篇符合目前的年代與用語條件。`;
    renderDecades();bindAudio();applyPrefs();syncNav();
  }
  function bindAudio(){all('audio',el('timeline')).forEach(audio=>{
    audio.addEventListener('play',()=>all('audio').forEach(other=>{if(other!==audio)other.pause();}));
    audio.addEventListener('error',()=>{const p=audio.parentElement.querySelector('.audio-error');if(p)p.hidden=false;});
    audio.addEventListener('timeupdate',()=>{const rows=all('[data-audio]',audio.parentElement);rows.forEach((row,i)=>row.classList.toggle('current',audio.currentTime>=Number(row.dataset.start)&&(!rows[i+1]||audio.currentTime<Number(rows[i+1].dataset.start))));});
  });}
  el('timeline').addEventListener('toggle',e=>{if(!e.target.matches('.event-details'))return;const d=e.target;if(d.open)state.open.add(d.dataset.ev);else{state.open.delete(d.dataset.ev);pauseAudio(d);}queueSave();},true);
  function syncNav(){const v=el('timelineViewport');el('earlier').disabled=!lastList.length||v.scrollLeft<=2;el('later').disabled=!lastList.length||v.scrollLeft>=v.scrollWidth-v.clientWidth-2;syncPosition();}
  function move(direction){const v=el('timelineViewport'),width=el('timeline').firstElementChild?.getBoundingClientRect().width||272;v.scrollBy({left:direction*(width+Number.parseFloat(getComputedStyle(el('timeline')).gap||'32'))*Math.max(1,Math.floor(v.clientWidth/(width+Number.parseFloat(getComputedStyle(el('timeline')).gap||'32')))-1),behavior:calm()?'instant':'smooth'});}
  el('earlier').addEventListener('click',()=>move(-1));el('later').addEventListener('click',()=>move(1));
  el('timelineViewport').addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{capturePosition();syncNav();queueSave();});},{passive:true});
  el('timelineViewport').addEventListener('keydown',e=>{if(e.target!==el('timelineViewport'))return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}});
  new ResizeObserver(syncNav).observe(el('timelineViewport'));
  new ResizeObserver(()=>syncPosition({forceFollow:true})).observe(el('decadeNav'));
  el('easyToggle').addEventListener('change',e=>{state.easy=e.target.checked;applyPrefs();savePrefs();});
  el('largeToggle').addEventListener('change',e=>{capturePosition();state.large=e.target.checked;applyPrefs();savePrefs();const target=all('#timeline>li').find(n=>n.dataset.event===state.anchor);if(target)el('timelineViewport').scrollLeft=offsetFor(state.anchor);syncNav();});
  function library({reset=true}={}){if(reset){state.query='';state.limit=40;state.newsAll=false;el('newsQuery').value='';}renderNews();mode('news');}
  function renderNews(){
    const f=state.newsAll?D.defaults():state.applied,A=D.filterNews(f,state.query),scope={...D.clone(f),types:['news']};
    el('clearNewsScope').hidden=state.newsAll||(!f.decades.length&&!f.terms.length);el('newsConditions').textContent='目前範圍：'+D.summary(scope)+'。';
    el('newsCount').textContent=`符合 ${A.length} 篇，共 ${NEWS.length} 篇；目前列出 ${Math.min(state.limit,A.length)} 篇。`;
    el('newsRows').innerHTML=A.slice(0,state.limit).map(n=>`<li><details><summary><span class="clip-meta">${esc(n.d)}　${esc(n.o)}</span><h3 class="clip-title">${esc(n.t)}</h3></summary><p class="clip-codes">用詞：${esc(n.w.join('、')||'未編')}<br>觀點：${esc(n.v||'未編')}${n.v2&&n.v2!=='無'?'；次要：'+esc(n.v2):''}<br>主題：${esc(n.p.join('、')||'未編')}${n.x?'<br>原資料標記：主體非智能障礙者':''}</p><figure class="clip-preview"><button type="button" class="image-button" data-image="sample-clip" aria-label="放大剪報版面示意"><img src="assets/sample-newspaper.png" alt="剪報版面示意，非這篇新聞的原件" width="640" height="480" loading="lazy"></button><figcaption class="media-caption">示意，非本篇原件。尚未提供掃描圖與內文，以上僅為實際編碼資料。</figcaption></figure></details></li>`).join('');
    el('newsEmpty').hidden=!!A.length;el('moreNews').hidden=state.limit>=A.length;el('moreNews').textContent=`再看 ${Math.min(40,Math.max(0,A.length-state.limit))} 篇`;
  }
  el('navNews').addEventListener('click',e=>{e.preventDefault();library();});el('openFilteredNews').addEventListener('click',()=>library());
  el('backToTimeline').addEventListener('click',()=>mode(state.hasRead?'read':'select'));
  el('newsQuery').addEventListener('input',e=>{state.query=e.target.value;state.limit=40;renderNews();});el('moreNews').addEventListener('click',()=>{state.limit+=40;renderNews();});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.action==='edit')return edit();
    if(b.dataset.action==='about'||b.id==='aboutButton'){el('aboutDialog').showModal();return;}
    if(b.dataset.image){el('imageCanvas').classList.remove('zoomed');el('imageZoom').textContent='放大圖片';el('imageZoom').setAttribute('aria-pressed','false');const m=READER_MEDIA.items.find(m=>m.id===b.dataset.image);if(!m)return;el('imageTitle').textContent=m.title+(m.sample?'（示意）':'');el('fullImage').src=m.src;el('fullImage').alt=m.alt||m.title;el('imageCaption').textContent=m.caption||'';el('imageDialog').showModal();return;}
    if(b.dataset.player){const a=el(b.dataset.player);if(!a)return;const seek=()=>{a.currentTime=Math.min(Number(b.dataset.seek),Number.isFinite(a.duration)?Math.max(0,a.duration-.1):Number(b.dataset.seek));a.play().catch(()=>say('請使用播放器的播放按鈕。'));};if(a.readyState>=1)seek();else{a.addEventListener('loadedmetadata',seek,{once:true});a.load();}}
  });
  document.addEventListener('change',e=>{if(e.target.dataset.audioSpeed){const a=el(e.target.dataset.audioSpeed);if(a)a.playbackRate=Number(e.target.value);}});
  all('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));

  function offsetFor(id){const item=all('#timeline>li').find(n=>n.dataset.event===id);return item?Math.max(0,item.offsetLeft-8):0;}
  function snapshot(){return D.readingState({filters:state.applied,anchor:state.anchor,open:[...state.open],view:state.view});}
  function writeLocation(){
    if(restoring)return;
    const route=state.mode==='read'?'read':state.mode==='news'?'clippings':'filters';
    const hash='#'+route+(state.hasRead?'?'+D.encodeReading(snapshot()):'');
    window.history.replaceState({reader:true},'',hash);
  }
  function queueSave(){
    clearTimeout(saveTimer);if(!state.hasRead||restoring)return;
    saveTimer=setTimeout(()=>{const saved=snapshot();try{localStorage.setItem(progressKey,JSON.stringify(saved));}catch{}writeLocation();updateResume();},220);
  }
  function updateResume(){
    let saved=null;try{saved=JSON.parse(localStorage.getItem(progressKey)||'null');}catch{}
    const ok=saved&&Array.isArray(saved.filters?.types)&&saved.anchor;
    el('resumeReading').hidden=!ok;el('resumeLabel').hidden=!ok;
    if(ok){const clean=D.readingState(saved),event=EV.find(e=>e.id===clean.anchor);el('resumeLabel').textContent=event?event.y+' 年 · '+D.title(event):'繼續閱讀已儲存的範圍';}
  }
  function syncPosition({forceFollow=false}={}){
    const idx=Math.max(0,lastList.findIndex(e=>e.id===state.anchor)),event=lastList[idx];
    el('positionLabel').textContent=event?`${event.dec} 年代 · 第 ${idx+1} 件 / ${lastList.length} 件`:'目前沒有精選事件';
    all('#decadeNav button').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.decade)===event?.dec)));
    const nav=el('decadeNav'),active=nav.querySelector('[aria-current="true"]');
    if(!active||!nav.clientWidth)return;
    if(!forceFollow&&followedDecade===event.dec)return;
    followedDecade=event.dec;
    // Reveal only within this horizontal strip; never scroll the page or steal focus.
    const bounds=nav.getBoundingClientRect(),rect=active.getBoundingClientRect();
    const left=bounds.left+nav.clientLeft+8,right=bounds.left+nav.clientLeft+nav.clientWidth-8;
    const delta=rect.left<left?rect.left-left:rect.right>right?rect.right-right:0;
    if(delta)nav.scrollBy({left:delta,behavior:'instant'});
  }
  function renderDecades(){
    followedDecade=null;
    el('decadeNav').innerHTML=D.decades.map(dec=>{const count=lastList.filter(e=>e.dec===dec).length;return `<button type="button" data-decade="${dec}"${count?'':' disabled'}>${dec}<span>${count} 件事件</span></button>`;}).join('');
  }
  function jump(id,{expand=false,focus=false,smooth=true}={}){
    const item=all('#timeline>li').find(n=>n.dataset.event===id);if(!item)return;
    state.anchor=id;const detail=item.querySelector('.event-details');
    if(expand){detail.open=true;state.open.add(id);}
    const behavior='instant';
    if(state.view==='list'){item.scrollIntoView({block:'start',behavior});}
    else {state.scroll=offsetFor(id);el('timelineViewport').scrollTo({left:state.scroll,behavior});}
    if(focus)detail.querySelector('summary').focus({preventScroll:true});syncPosition({forceFollow:true});queueSave();
  }
  function setView(view){
    state.view=view;document.body.classList.toggle('list-view',view==='list');
    el('viewToggle').setAttribute('aria-pressed',String(view==='list'));
    el('viewToggle').textContent=view==='list'?'改用橫向年表':'改用直式清單';
    el('timelineViewport').setAttribute('aria-label',view==='list'?'依時間排列的事件清單':'可左右捲動的精選年表');
    el('readingHint').textContent=view==='list'?'由上往下閱讀，點年份或標題展開介紹。可以同時打開多件事件。':'向右閱讀，點年份或標題展開介紹。等距排列，間距不代表經過的年數。';
  }
  function restore(saved,route='read'){
    restoring=true;clearTimeout(saveTimer);pauseAudio();const clean=D.readingState(saved);
    state.applied=clean.filters;state.draft=D.clone(clean.filters);state.open=new Set(clean.open);state.anchor=clean.anchor;state.hasRead=true;state.pageScroll=0;
    // Disable capture while swapping the stored reading state.
    state.mode='select';setView(clean.view);lastList=D.filterEvents(state.applied);renderTimeline(lastList);state.scroll=offsetFor(clean.anchor);
    if(route==='news')renderNews();mode(route,{history:false,focus:false});
    requestAnimationFrame(()=>{if(route==='read'&&clean.anchor)jump(clean.anchor,{smooth:false});restoring=false;queueSave();});
  }
  function restoreRoute(){
    const [route,query='']=location.hash.slice(1).split('?');
    if(query&&(route==='read'||route==='clippings'||route==='filters')){restore(D.decodeReading(query),route==='clippings'?'news':route==='filters'?'select':'read');return;}
    if(route==='read'){restore({filters:D.defaults()});return;}
    if(route==='clippings'){renderNews();mode('news',{history:false,focus:false});return;}
    state.draft=D.clone(state.applied);mode('select',{history:false,focus:false});
  }
  function renderDirectory(){
    const results=D.searchEvents(lastList,el('eventQuery').value);
    el('directoryCount').textContent=`找到 ${results.length} 件，目前閱讀範圍共 ${lastList.length} 件。`;
    el('directoryEmpty').hidden=!!results.length;
    el('directoryResults').innerHTML=results.map(e=>`<li><button type="button" data-jump-event="${esc(e.id)}"><span>${e.y} 年 · ${esc(TRACKS[e.track].name)}</span><strong>${esc(D.title(e))}</strong></button></li>`).join('');
  }
  function share(id){
    capturePosition();const saved=snapshot();if(id){saved.anchor=id;if(!saved.open.includes(id))saved.open.push(id);}
    const url=new URL(location.href);url.hash='read?'+D.encodeReading(saved);el('shareUrl').value=url.href;el('shareFeedback').textContent='';
    el('localLinkNotice').hidden=!['127.0.0.1','localhost',''].includes(location.hostname);
    el('shareDialog').showModal();
  }
  el('decadeNav').addEventListener('click',e=>{const b=e.target.closest('[data-decade]');if(!b||b.disabled)return;const event=lastList.find(ev=>ev.dec===Number(b.dataset.decade));if(event){jump(event.id,{focus:true});say(`已移到 ${event.dec} 年代。`);}});
  el('resetFilters').addEventListener('click',()=>{state.draft=D.defaults();syncPicker();});
  el('emptyReset').addEventListener('click',()=>commit(D.defaults()));
  el('viewToggle').addEventListener('click',()=>{capturePosition();const anchor=state.anchor;setView(state.view==='list'?'timeline':'list');requestAnimationFrame(()=>{if(state.view==='timeline')el('reader').scrollIntoView({block:'start'});jump(anchor,{smooth:false});syncNav();});});
  el('openDirectory').addEventListener('click',()=>{el('eventQuery').value='';renderDirectory();el('directoryDialog').showModal();el('eventQuery').focus();});
  el('eventQuery').addEventListener('input',renderDirectory);
  el('directoryResults').addEventListener('click',e=>{const b=e.target.closest('[data-jump-event]');if(!b)return;el('directoryDialog').close();jump(b.dataset.jumpEvent,{expand:true,focus:true});say('已移到並展開該事件。');});
  el('resumeReading').addEventListener('click',()=>{let saved;try{saved=JSON.parse(localStorage.getItem(progressKey));}catch{}if(saved)restore(saved);});
  el('shareReading').addEventListener('click',()=>share());
  el('copyShare').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(el('shareUrl').value);el('shareFeedback').textContent='連結已複製。';}catch{el('shareUrl').focus();el('shareUrl').select();el('shareFeedback').textContent='已選取連結，請按 Ctrl+C 或使用裝置的複製功能。';}});
  el('clearNewsScope').addEventListener('click',()=>{state.newsAll=true;state.limit=40;renderNews();});
  el('imageZoom').addEventListener('click',()=>{const zoom=el('imageCanvas').classList.toggle('zoomed');el('imageZoom').textContent=zoom?'縮回完整圖片':'放大圖片';el('imageZoom').setAttribute('aria-pressed',String(zoom));});
  el('timeline').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.mediaSelect){const section=b.closest('.media-section');pauseAudio(section);all('[data-media-panel]',section).forEach(p=>p.hidden=p.dataset.mediaPanel!==b.dataset.mediaSelect);all('[data-media-select]',section).forEach(t=>t.setAttribute('aria-pressed',String(t===b)));}
    if(b.dataset.shareEvent)share(b.dataset.shareEvent);
    if(b.dataset.closeEvent){const details=b.closest('.event-details');details.open=false;details.querySelector('summary').focus({preventScroll:true});}
  });
  window.addEventListener('scroll',()=>{if(state.mode==='read'&&state.view==='list'){capturePosition();syncPosition();queueSave();}},{passive:true});
  window.addEventListener('pagehide',()=>{if(state.hasRead){capturePosition();try{localStorage.setItem(progressKey,JSON.stringify(snapshot()));}catch{}}});
  window.addEventListener('popstate',restoreRoute);
  syncPicker();applyPrefs();updateResume();restoreRoute();

})();
