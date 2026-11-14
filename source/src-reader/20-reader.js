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
  function pauseAudio(root=document){all('audio,video',root).forEach(a=>a.pause());all('.media-frame iframe',root).forEach(f=>{f.src=f.src;});}
  function savePrefs(){try{localStorage.setItem('history-timeline.preferences.v1',JSON.stringify({easy:state.easy,large:state.large}));}catch{}}
  function applyPrefs(){document.documentElement.classList.toggle('large-text',state.large);all('.easy-section').forEach(n=>n.hidden=!state.easy);all('.full-description').forEach(n=>n.open=!state.easy);el('easyToggle').checked=state.easy;el('largeToggle').checked=state.large;}
  function capturePosition(){
    if(state.mode !== 'read') return;
    const viewport = el('timelineViewport');
    state.scroll = viewport.scrollLeft;
    state.pageScroll = window.scrollY;
    const items = all('#timeline>li');
    if(state.view === 'list'){
      if(el('timeline').getBoundingClientRect().top > 100) return;
      const first = items.find(item => item.getBoundingClientRect().bottom > 100);
      if(first) state.anchor = first.dataset.event;
      return;
    }
    const left = viewport.getBoundingClientRect().left + viewport.clientLeft;
    const selected = items.find(item => item.dataset.event === state.anchor)?.getBoundingClientRect();
    // Several events can share the last page. Keep a search or shared-link target there.
    if(selected && selected.left >= left - 1 && selected.right <= left + viewport.clientWidth + 1) return;
    const first = items.find(item => item.getBoundingClientRect().right > left + 1);
    if(first) state.anchor = first.dataset.event;
  }
  function mode(next,{history=true,focus=true,capture=true}={}) {
    if(capture)capturePosition();pauseAudio();state.mode=next;document.body.dataset.mode=next;
    Object.entries(modes).forEach(([key,id])=>el(id).hidden=key!==next);
    el('navNews').setAttribute('aria-current',next==='news'?'page':'false');
    if(history){const hash=next==='read'?'#read':next==='news'?'#clippings':'#filters';if(location.hash.split('?')[0]!==hash)window.history.pushState({reader:true},'',hash);writeLocation();}
    if(next==='read'){
      requestAnimationFrame(()=>{el('timelineViewport').scrollLeft=state.scroll;window.scrollTo(0,state.pageScroll);syncNav();});
      if(focus)el('readerTitle').focus({preventScroll:true});queueSave();
    } else if(next==='select'){syncPicker();window.scrollTo(0,0);if(focus)el('selectionTitle').focus({preventScroll:true});}
    else {window.scrollTo(0,0);if(focus)el('newsTitle').focus({preventScroll:true});}
  }
  function addChoice(container,id,label,key,kind,scope='filter'){
    const item=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id=id;input.value=String(key);input.dataset[scope]=kind;item.append(input,document.createTextNode(label));if(kind==='types')item.style.setProperty('--category','var(--'+key+')');container.append(item);
  }
  D.decades.forEach(d=>addChoice(el('decadeOptions'),'decade-'+d,d+' 年代',d,'decades'));
  D.types.forEach(t=>addChoice(el('typeOptions'),'type-'+t,TRACKS[t].name,t,'types'));
  D.terms.forEach((t,i)=>addChoice(el('wordOptions'),'word-'+i,t,t,'terms'));
  D.decades.forEach(d=>addChoice(el('quickDecades'),'quick-decade-'+d,d+' 年代',d,'decades','quickFilter'));
  D.types.forEach(t=>addChoice(el('quickTypes'),'quick-type-'+t,TRACKS[t].name,t,'types','quickFilter'));
  D.terms.forEach((term,index)=>addChoice(el('quickWords'),'quick-word-'+index,term,term,'terms','quickFilter'));
  function syncPicker(){
    const f=state.draft;all('[data-filter]',el('filterForm')).forEach(i=>i.checked=f[i.dataset.filter].includes(i.dataset.filter==='decades'?Number(i.value):i.value));
    el('wordField').hidden=!D.onlyNews(f);const matches=D.filterEvents(f), n=matches.length;el('filterPreview').textContent=n?('從 '+matches[0].y+' 年到 '+matches[n-1].y+' 年；第一件：'+D.title(matches[0])):'試著減少限制，或重設條件。';
    el('filterCount').textContent=!f.types.length?'請至少選取一種事件類型。':`符合 ${n} 件精選事件，共 ${EV.length} 件。`;
    el('applyButton').disabled=!f.types.length;
    el('applyButton').textContent=state.hasRead?'套用並繼續閱讀':'開始閱讀';
    el('cancelFilters').hidden=!state.hasRead;
    el('selectionTitle').textContent=state.hasRead?'調整閱讀範圍':'選擇閱讀範圍';
  }
  function edit(){el('quickFilters').open=true;el('quickFilters').querySelector('summary').focus();}
  el('filterForm').addEventListener('change',()=>{
    const value={decades:[],types:[],terms:[]};all('[data-filter]:checked',el('filterForm')).forEach(i=>value[i.dataset.filter].push(i.value));
    state.draft=D.normalize(value);syncPicker();
  });
  el('selectAllTypes').addEventListener('click',()=>{state.draft.types=[...D.types];state.draft.terms=[];syncPicker();});
  el('onlyNews').addEventListener('click',()=>{state.draft.types=['news'];syncPicker();say('已選取剪報，現在可以設定新聞用語。');});
  function commit(f,{focus=true}={}){
    capturePosition();
    const oldAnchor=state.anchor, changed=JSON.stringify(f)!==JSON.stringify(state.applied), first=!state.hasRead;
    state.applied=D.clone(f);state.hasRead=true;
    if(first||changed){pauseAudio();lastList=D.filterEvents(state.applied);renderTimeline(lastList);const target=first?lastList[0]:D.nearest(lastList,oldAnchor);state.anchor=target?.id||null;state.scroll=target?offsetFor(target.id):0;state.pageScroll=focus?0:window.scrollY;}
    const targetId=state.anchor;
    mode('read',{focus,capture:false});if(first||changed)requestAnimationFrame(()=>jump(targetId,{smooth:false}));say('');
  }
  el('filterForm').addEventListener('submit',e=>{e.preventDefault();if(state.draft.types.length)commit(state.draft);});
  el('readAll').addEventListener('click',()=>commit(D.defaults()));el('cancelFilters').addEventListener('click',()=>{state.draft=D.clone(state.applied);mode('read');});
  const KIND_LABEL={photo:'照片',clip:'剪報',audio:'錄音',video:'影片',text:'文字'};
  function mediaFor(event){return SHEET.media.filter(m=>m.events.includes(event.id));}
  const findMedia=id=>SHEET.media.find(m=>m.id===id)||READER_MEDIA.items.find(m=>m.id===id);
  const srcOf=m=>m.link?m.link.src:m.src;
  const paragraphs=t=>String(t||'').split('\n').filter(Boolean).map(x=>`<p>${esc(x)}</p>`).join('');
  const clock=t=>(t>=3600?Math.floor(t/3600)+':'+String(Math.floor(t%3600/60)).padStart(2,'0'):Math.floor(t/60))+':'+String(Math.floor(t%60)).padStart(2,'0');
  const frame=(src,title,kind)=>`<div class="media-frame" data-frame="${kind}"><iframe src="${esc(src)}" title="${esc(title)}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  // player: id of an <audio>/<video> element that timed segments can seek; empty when playback is an embedded frame.
  function transcriptHtml(m,player){
    const segments=m.segments||[];if(!segments.length)return '';
    const translated=segments.some(s=>s.translation);
    return `<details class="transcript more"><summary>${translated?'閱讀逐字稿與中文對照':'閱讀逐字稿'}</summary><ol>${segments.map((s,i)=>{
      const timed=s.time!=null;
      const head=timed?(player?`<button type="button" data-seek="${s.time}" data-player="${player}">${clock(s.time)} 跳至此段</button>`:`<span class="transcript-time">${clock(s.time)}</span>`):'';
      return `<li${timed&&player?` data-audio="${player}" data-segment="${i}" data-start="${s.time}"`:''}>${head}${s.text?`<p>${esc(s.text)}</p>`:''}${s.translation?`<p class="translation">${esc(s.translation)}</p>`:''}</li>`;}).join('')}</ol></details>`;
  }
  function mediaHtml(event,{samples=false}={}){
    const items=samples?READER_MEDIA.items.filter(item=>item.sample):mediaFor(event);if(!items.length)return '';
    const title = '<h3>事件附件</h3>';
    const notice = items.some(item=>item.sample) ? '<p class="sample-notice">以下示例僅呈現附件樣式，與歷史事件沒有史料關聯。</p>' : '';
    const totals={},seen={};items.forEach(item=>totals[item.kind]=(totals[item.kind]||0)+1);
    const labels=items.map(item=>{seen[item.kind]=(seen[item.kind]||0)+1;return KIND_LABEL[item.kind]+(totals[item.kind]>1?' '+seen[item.kind]:'');});
    const selector = items.length > 1 ? `<div class="media-switch" role="group" aria-label="選擇附件">${items.map((item,index)=>`<button type="button" data-media-select="${esc(item.id)}" aria-pressed="${index===0}">${labels[index]}</button>`).join('')}</div>` : '';
    return `<section class="media-section" aria-label="事件附件">${title}${notice}${selector}${items.map((m,i)=>{
      const key=esc(event.id+'-'+m.id),badge=m.sample?'<span class="sample-badge">示意</span>':'';
      const open=`data-kind="${esc(m.kind)}" data-media-panel="${esc(m.id)}"${i?' hidden':''}><h4>${esc(m.title)}${badge}</h4>`;
      const caption=`${m.caption?`<p class="media-caption">${esc(m.caption)}</p>`:''}${m.credit?`<p class="media-caption media-credit">來源與授權：${esc(m.credit)}</p>`:''}`;
      if(m.kind==='audio')return `<section class="media-item" ${open}<audio id="audio-${key}" class="audio-player" controls preload="none" src="${esc(srcOf(m))}"${m.link?.embed?` data-embed="${esc(m.link.embed)}"`:''} aria-label="${esc(m.title+(m.sample?'，合成語音示例':''))}"></audio><p class="audio-error" hidden>音檔目前無法載入；仍可閱讀下方逐字稿。</p><label class="audio-speed">播放速度<select data-audio-speed="audio-${key}"><option value="0.75">0.75 倍</option><option value="1" selected>1 倍</option><option value="1.25">1.25 倍</option><option value="1.5">1.5 倍</option></select></label>${caption}${transcriptHtml(m,'audio-'+key)}</section>`;
      if(m.kind==='video'){
        const player=m.link.embed?frame(m.link.embed,m.title,'video'):`<video id="video-${key}" class="video-player" controls preload="metadata" playsinline src="${esc(m.link.src)}" aria-label="${esc(m.title)}"></video>`;
        return `<section class="media-item" ${open}${player}${caption}${transcriptHtml(m,m.link.embed?'':'video-'+key)}</section>`;
      }
      if(m.kind==='text')return `<article class="media-item media-text" ${open}<div class="media-text-body">${paragraphs(m.text)}</div>${caption}</article>`;
      const size=m.link?'class="natural"':`width="${m.kind==='photo'?600:640}" height="${m.kind==='photo'?400:480}"`;
      const clipText=m.kind==='clip'&&(m.text||m.sample)?`<details class="more"><summary>閱讀剪報文字說明</summary>${paragraphs(m.text||'原件文字待補。')}</details>`:'';
      return `<figure class="media-item" ${open}<button class="image-button" type="button" data-image="${esc(m.id)}" aria-label="放大${esc(m.title)}"><img src="${esc(srcOf(m))}"${m.link?.backup?` data-backup="${esc(m.link.backup)}"`:''} alt="${esc(m.alt||m.title)}" loading="lazy" ${size}></button><figcaption>${caption}</figcaption>${clipText}</figure>`;
    }).join('')}</section>`;
  }
  function eventHtml(e){
    const easy=D.easy(e);
    const n=e.news!=null?NEWS[e.news]:null;
    return `<details class="event-details" data-ev="${esc(e.id)}"${state.open.has(e.id)?' open':''}><summary><div class="event-meta"><span>${esc(e.precision==='decade'?'約 '+e.y+' 年代':e.y+' 年')}</span><span class="category">${esc(TRACKS[e.track].name)}</span></div><div class="event-title">${esc(D.title(e))}</div></summary><div class="event-body"><p class="event-date">${esc(D.date(e))}</p><section class="easy-section"${state.easy?'':' hidden'}><p class="draft-label">易讀介紹（草稿，待審閱）</p><div class="easy-text">${easy.map(t=>`<p>${esc(t)}</p>`).join('')}</div></section><details class="more full-description"${state.easy?'':' open'}><summary>完整說明與資料來源</summary><div class="full-text">${e.summary.split('\n').map(t=>`<p>${esc(t)}</p>`).join('')}${e.memo?e.memo.split('\n').map(t=>`<p>${esc(t)}</p>`).join(''):''}</div><dl class="source"><dt>原始標題</dt><dd>${esc(e.title)}</dd><dt>資料來源</dt><dd>${esc(e.source)}</dd>${e.why?`<dt>精選理由（以本站資料為範圍）</dt><dd>${esc(e.why)}</dd>`:''}<dt>日期精確度</dt><dd>${esc(PREC[e.precision])}${e.certainty==='approx'?'（約略）':''}</dd></dl>${n?`<p class="clip-codes">用詞：${esc(n.w.join('、')||'未編')}<br>觀點：${esc(n.v||'未編')}<br>主題：${esc(n.p.join('、')||'未編')}</p>`:''}</details>${mediaHtml(e)}<div class="event-actions"><button type="button" class="text-button" data-share-event="${esc(e.id)}">分享此事件</button><button type="button" class="text-button" data-close-event="${esc(e.id)}">收起介紹 ↑</button></div></div></details>`;
  }
  function renderTimeline(list){
    pauseAudio(el('timeline'));let decade=null;
    el('timeline').innerHTML=list.map(e=>{const name=decade!==e.dec?e.dec+' 年代':'';decade=e.dec;return `<li data-event="${esc(e.id)}" style="--category:var(--${e.track})"><div class="decade-label">${name}</div>${eventHtml(e)}</li>`;}).join('');
    el('timelineViewport').hidden=!list.length;el('readerEmpty').hidden=!!list.length;
    const label=D.summary(state.applied);el('appliedSummary').textContent=label;
    el('positionLabel').parentElement.hidden=!list.length;
    el('decadeNav').hidden=!list.length;
    renderDecades();bindAudio();applyPrefs();syncNav();syncQuickFilters();
  }
  function bindAudio(root=el('timeline')){all('audio,video',root).forEach(audio=>{
    audio.addEventListener('play',()=>all('audio,video').forEach(other=>{if(other!==audio)other.pause();}));
    audio.addEventListener('error',()=>{
      if(!audio.parentElement)return;
      const p=audio.parentElement.querySelector('.audio-error');
      // Google Drive sometimes refuses direct playback; its own embedded player still works.
      if(audio.dataset.embed){
        const item=audio.parentElement;audio.insertAdjacentHTML('afterend',frame(audio.dataset.embed,audio.getAttribute('aria-label')||'錄音','audio'));
        item.querySelector('.audio-speed')?.remove();all('[data-seek]',item).forEach(b=>{b.outerHTML=`<span class="transcript-time">${esc(b.textContent.replace(' 跳至此段',''))}</span>`;});
        if(p){p.textContent='已改用 Google 播放器；調整速度與逐字稿跳轉暫時無法使用。';p.hidden=false;}audio.remove();return;
      }
      if(p)p.hidden=false;});
    audio.addEventListener('timeupdate',()=>{if(!audio.parentElement)return;const rows=all('[data-audio]',audio.parentElement);rows.forEach((row,i)=>row.classList.toggle('current',audio.currentTime>=Number(row.dataset.start)&&(!rows[i+1]||audio.currentTime<Number(rows[i+1].dataset.start))));});
  });}
  document.addEventListener('error',e=>{const img=e.target;if(img instanceof HTMLImageElement&&img.dataset.backup){const next=img.dataset.backup;delete img.dataset.backup;img.src=next;}},true);
  el('timeline').addEventListener('toggle',e=>{if(!e.target.matches('.event-details'))return;const d=e.target;if(d.open)state.open.add(d.dataset.ev);else{state.open.delete(d.dataset.ev);pauseAudio(d);}queueSave();},true);
  function syncNav(){const v=el('timelineViewport');el('earlier').disabled=!lastList.length||v.scrollLeft<=2;el('later').disabled=!lastList.length||v.scrollLeft>=v.scrollWidth-v.clientWidth-2;syncPosition();}
  function move(direction){
    const viewport = el('timelineViewport');
    const track = el('timeline');
    const first = track.firstElementChild;
    if(!first || state.view !== 'timeline') return;
    const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap);
    const perPage = Number(getComputedStyle(track).getPropertyValue('--cards')) || 1;
    viewport.scrollTop = 0;
    viewport.scrollBy({left:direction * perPage * step, behavior:calm()?'instant':'smooth'});
  }
  el('earlier').addEventListener('click',()=>move(-1));el('later').addEventListener('click',()=>move(1));
  let wheelDelta = 0, wheelLockedUntil = 0, wheelDirection = 0;
  function visibleEventIsOpen(){
    const viewport = el('timelineViewport');
    const left = viewport.getBoundingClientRect().left + viewport.clientLeft;
    const right = left + viewport.clientWidth;
    return all('.event-details[open]',viewport).some(detail=>{
      const bounds = detail.getBoundingClientRect();
      return bounds.left < right - 1 && bounds.right > left + 1;
    });
  }
  el('timelineViewport').addEventListener('wheel', event => {
    const viewport = el('timelineViewport');
    // Opening any visible event expresses reading intent across the entire row.
    if(visibleEventIsOpen()){
      wheelDelta = 0;
      wheelLockedUntil = 0;
      wheelDirection = 0;
      return;
    }
    const nativeScroll = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY);
    // Keep document reading, media controls and browser zoom on their native paths.
    if(state.view !== 'timeline' || nativeScroll || !event.cancelable ||
      event.target.closest('.event-body')) return;
    const direction = Math.sign(event.deltaY);
    const atEdge = direction < 0 ? viewport.scrollLeft <= 2 :
      viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 2;
    if(atEdge) return;
    event.preventDefault();
    const now = performance.now();
    if(now < wheelLockedUntil && wheelDirection === direction){
      wheelLockedUntil = now + 240;
      return;
    }
    if(Math.sign(wheelDelta) !== direction) wheelDelta = 0;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    wheelDelta += event.deltaY * unit;
    if(Math.abs(wheelDelta) < 24) return;
    wheelLockedUntil = now + 240;
    wheelDirection = direction;
    wheelDelta = 0;
    move(direction);
  }, {passive:false});
  el('timelineViewport').addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{capturePosition();syncNav();queueSave();});},{passive:true});
  el('timelineViewport').addEventListener('keydown',e=>{if(e.target!==el('timelineViewport'))return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}});
  new ResizeObserver(syncNav).observe(el('timelineViewport'));
  new ResizeObserver(()=>syncPosition({forceFollow:true})).observe(el('decadeNav'));
  const preferences = el('preferencesDialog');
  el('openPreferences').addEventListener('click', () => {
    el('easyToggle').checked = state.easy;
    el('largeToggle').checked = state.large;
    preferences.querySelector(`input[value="${state.view}"]`).checked = true;
    preferences.returnValue = '';
    preferences.showModal();
  });
  preferences.addEventListener('close', () => {
    if (preferences.returnValue !== 'apply') return;
    capturePosition();
    const view = preferences.querySelector('input[name="layout"]:checked').value;
    const layoutChanged = view !== state.view;
    const reposition = layoutChanged || state.large !== el('largeToggle').checked;
    const anchor = state.anchor;
    state.easy = el('easyToggle').checked;
    state.large = el('largeToggle').checked;
    setView(view);
    applyPrefs();
    savePrefs();
    if (layoutChanged && view === 'timeline') el('reader').scrollIntoView({block:'start'});
    if (reposition && anchor) jump(anchor, {focus:true});
    syncNav();
    queueSave();
    say('已套用閱讀設定。');
  });
  function library({reset=true}={}){if(reset){state.query='';state.limit=40;state.newsAll=false;el('newsQuery').value='';}renderNews();mode('news');}
  function renderNews(){
    const f=state.newsAll?D.defaults():state.applied,A=D.filterNews(f,state.query),scope={...D.clone(f),types:['news']};
    el('clearNewsScope').hidden=state.newsAll||(!f.decades.length&&!f.terms.length);el('newsConditions').textContent='目前範圍：'+D.summary(scope)+'。';
    el('newsCount').textContent=`符合 ${A.length} 篇，共 ${NEWS.length} 篇；目前列出 ${Math.min(state.limit,A.length)} 篇。`;
    el('newsRows').innerHTML=A.slice(0,state.limit).map(n=>`<li><details><summary><span class="clip-meta">${esc(n.d)}　${esc(n.o)}</span><h3 class="clip-title">${esc(n.t)}</h3></summary><p class="clip-codes">用詞：${esc(n.w.join('、')||'未編')}<br>觀點：${esc(n.v||'未編')}${n.v2&&n.v2!=='無'?'；次要：'+esc(n.v2):''}<br>主題：${esc(n.p.join('、')||'未編')}${n.x?'<br>原資料標記：主體非智能障礙者':''}</p></details></li>`).join('');
    el('newsEmpty').hidden=!!A.length;el('moreNews').hidden=state.limit>=A.length;el('moreNews').textContent=`再看 ${Math.min(40,Math.max(0,A.length-state.limit))} 篇`;
  }
  el('navNews').addEventListener('click',e=>{e.preventDefault();library();});
  el('backToTimeline').addEventListener('click',()=>mode(state.hasRead?'read':'select'));
  el('newsQuery').addEventListener('input',e=>{state.query=e.target.value;state.limit=40;renderNews();});el('moreNews').addEventListener('click',()=>{state.limit+=40;renderNews();});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.action==='edit')return edit();
    if(b.dataset.action==='about'||b.id==='aboutButton'){el('aboutDialog').showModal();return;}
    if(b.dataset.image){el('imageCanvas').classList.remove('zoomed');el('imageZoom').textContent='放大圖片';el('imageZoom').setAttribute('aria-pressed','false');const m=findMedia(b.dataset.image);if(!m)return;el('imageTitle').textContent=m.title+(m.sample?'（示意）':'');el('fullImage').src=b.querySelector('img')?.currentSrc||srcOf(m);el('fullImage').alt=m.alt||m.title;el('imageCaption').textContent=m.caption||'';el('imageDialog').showModal();return;}
    if(b.dataset.player){const a=el(b.dataset.player);if(!a)return;const seek=()=>{a.currentTime=Math.min(Number(b.dataset.seek),Number.isFinite(a.duration)?Math.max(0,a.duration-.1):Number(b.dataset.seek));a.play().catch(()=>say('請使用播放器的播放按鈕。'));};if(a.readyState>=1)seek();else{a.addEventListener('loadedmetadata',seek,{once:true});a.load();}}
  });
  document.addEventListener('change',e=>{if(e.target.dataset.audioSpeed){const a=el(e.target.dataset.audioSpeed);if(a)a.playbackRate=Number(e.target.value);}});
  all('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));

  function offsetFor(id){const item=all('#timeline>li').find(n=>n.dataset.event===id);return item?.offsetLeft || 0;}
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
    const viewport = el('timelineViewport');
    const viewportBounds = viewport.getBoundingClientRect();
    const visible = all('#timeline>li').filter(item=>{
      const rect = item.getBoundingClientRect();
      if(state.view === 'list') return rect.bottom > 0 && rect.top < window.innerHeight;
      const left = viewportBounds.left + viewport.clientLeft;
      return rect.left >= left - 1 && rect.right <= left + viewport.clientWidth + 1;
    });
    const first = visible[0], last = visible[visible.length-1];
    const start = first ? lastList.findIndex(item=>item.id===first.dataset.event)+1 : idx+1;
    const end = last ? lastList.findIndex(item=>item.id===last.dataset.event)+1 : start;
    const range = start === end ? String(start) : `${start}–${end}`;
    el('positionLabel').textContent=event?`目前顯示第 ${range} 件，共 ${lastList.length} 件`:'目前沒有精選事件';
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
    else {state.scroll=offsetFor(id);el('timelineViewport').scrollTo({left:state.scroll,top:0,behavior});}
    if(focus){
      const summary = detail.querySelector('summary');
      summary.focus({preventScroll:true});
      const bounds = summary.getBoundingClientRect();
      if(bounds.top < 0 || bounds.bottom > window.innerHeight){
        summary.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      }
    }
    syncPosition({forceFollow:true});queueSave();
  }
  function setView(view){
    state.view=view;document.body.classList.toggle('list-view',view==='list');
    el('timelineViewport').setAttribute('aria-label',view==='list'?'依時間排列的事件清單':'可左右捲動的精選年表');
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
  function syncQuickFilters(){
    const filters = state.applied;
    el('quickWordField').hidden=!D.onlyNews(filters);
    all('[data-quick-filter]').forEach(input => {
      const key = input.dataset.quickFilter;
      input.checked = filters[key].includes(key === 'decades' ? Number(input.value) : input.value);
    });
    const removals = [
      ...filters.decades.map(value => ({kind:'decades',value,label:value+' 年代'})),
      ...(filters.types.length !== D.types.length ? [{kind:'types',value:'',label:filters.types.map(type=>TRACKS[type].name).join('、') || '未選事件類型'}] : []),
      ...filters.terms.map(value => ({kind:'terms',value,label:value}))
    ];
    el('activeFilters').innerHTML = removals.map(item =>
      `<button type="button" data-remove-filter="${item.kind}" data-value="${esc(item.value)}" aria-label="移除${esc(item.label)}篩選">${esc(item.label)} <span aria-hidden="true">×</span></button>`
    ).join('');
    el('activeFilters').hidden = !removals.length;
  }
  function groupedEvents(results, prefix){
    return D.decades.map(decade => {
      const events = results.filter(event => event.dec === decade);
      if(!events.length) return '';
      return `<li class="directory-group"><section aria-labelledby="${prefix}-${decade}"><h3 id="${prefix}-${decade}">${decade} 年代 <span>${events.length} 件</span></h3><ol>${events.map(event =>
        `<li><button type="button" data-jump-event="${esc(event.id)}"><span class="directory-meta">${event.y} 年 <span class="category" style="--category:var(--${event.track})">${esc(TRACKS[event.track].name)}</span></span><strong>${esc(D.title(event))}</strong></button></li>`
      ).join('')}</ol></section></li>`;
    }).join('');
  }
  el('quickFilters').addEventListener('change',()=>{
    const filters = D.clone(state.applied);
    filters.decades = all('[data-quick-filter="decades"]:checked').map(input=>Number(input.value));
    filters.types = all('[data-quick-filter="types"]:checked').map(input=>input.value);
    filters.terms = all('[data-quick-filter="terms"]:checked').map(input=>input.value);
    commit(D.normalize(filters),{focus:false});
    say(`目前顯示 ${lastList.length} 件事件。`);
  });
  el('quickFilters').addEventListener('keydown',event=>{
    if(event.key!=='Escape') return;
    event.preventDefault();
    el('quickFilters').open=false;
    el('quickFilters').querySelector('summary').focus();
  });
  document.addEventListener('click',event=>{
    if(!el('quickFilters').contains(event.target) && !event.target.closest('[data-action="edit"]')){
      el('quickFilters').open=false;
    }
  });
  el('resetQuickFilters').addEventListener('click',()=>{
    commit(D.defaults(),{focus:false});
    say('已恢復全部事件。');
  });
  el('activeFilters').addEventListener('click',event=>{
    const button = event.target.closest('[data-remove-filter]');
    if(!button) return;
    const filters = D.clone(state.applied), kind = button.dataset.removeFilter;
    filters[kind] = kind === 'types' ? [...D.types] :
      filters[kind].filter(value=>String(value)!==button.dataset.value);
    commit(D.normalize(filters),{focus:false});
    el('quickFilters').querySelector('summary').focus({preventScroll:true});
    say(`目前顯示 ${lastList.length} 件事件。`);
  });
  function renderDirectory(){
    const results=D.searchEvents(lastList,el('eventQuery').value);
    el('directoryCount').textContent=`找到 ${results.length} 件，目前閱讀範圍共 ${lastList.length} 件。`;
    el('directoryEmpty').hidden=!!results.length;
    el('directoryResults').innerHTML=groupedEvents(results, 'directory');
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
  el('openDirectory').addEventListener('click',()=>{el('eventQuery').value='';renderDirectory();el('directoryDialog').showModal();el('eventQuery').focus();});
  el('eventQuery').addEventListener('input',renderDirectory);
  el('directoryResults').addEventListener('click',e=>{const b=e.target.closest('[data-jump-event]');if(!b)return;el('directoryDialog').close();jump(b.dataset.jumpEvent,{expand:true,focus:true});say('已移到並展開該事件。');});
  el('resumeReading').addEventListener('click',()=>{let saved;try{saved=JSON.parse(localStorage.getItem(progressKey));}catch{}if(saved)restore(saved);});
  el('shareReading').addEventListener('click',()=>share());
  el('copyShare').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(el('shareUrl').value);el('shareFeedback').textContent='連結已複製。';}catch{el('shareUrl').focus();el('shareUrl').select();el('shareFeedback').textContent='已選取連結，請按 Ctrl+C 或使用裝置的複製功能。';}});
  const tour = el('tourDialog');
  let tourSteps = [], tourIndex = 0, tourScroll = 0;
  function placeTour(){
    if(!tour.open) return;
    const target = tourSteps[tourIndex].target;
    const bounds = target.getBoundingClientRect();
    const left = Math.max(4,bounds.left-5), top = Math.max(4,bounds.top-5);
    const right = Math.min(window.innerWidth-4,bounds.right+5);
    const bottom = Math.min(window.innerHeight-4,bounds.bottom+5);
    const spotlight = el('tourSpotlight');
    Object.assign(spotlight.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
    const card = el('tourCard'), height = card.offsetHeight;
    const below = bottom+12;
    const cardTop = below+height <= window.innerHeight-12 ? below :
      top-height-12 >= 12 ? top-height-12 : Math.max(12,window.innerHeight-height-12);
    Object.assign(card.style,{left:Math.max(12,Math.min(left,window.innerWidth-card.offsetWidth-12))+'px',top:cardTop+'px'});
  }
  function showTourStep(){
    const step = tourSteps[tourIndex];
    step.target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    el('tourCount').textContent=`第 ${tourIndex+1} 步，共 ${tourSteps.length} 步`;
    el('tourTitle').textContent=step.title;
    el('tourText').textContent=step.text;
    el('tourPrevious').disabled=tourIndex===0;
    el('tourNext').textContent=tourIndex===tourSteps.length-1?'完成說明':'下一步';
    el('tourTitle').focus({preventScroll:true});
    placeTour();
  }
  el('startTour').addEventListener('click',()=>{
    if(state.mode==='read'){
      const viewport = el('timelineViewport').getBoundingClientRect();
      const firstVisible = all('#timeline>li').find(item=>{
        const bounds=item.getBoundingClientRect();
        return state.view==='list' ? bounds.bottom>0 : bounds.right>viewport.left+1;
      });
      tourSteps=[
        {target:el('quickFilters').querySelector('summary'),title:'原地調整閱讀範圍',text:'展開「年代與類別」後，可複選年代和類型。條件會立即套用，也能直接清除已選條件。'},
        {target:el('decadeNav'),title:'跳到另一個年代',text:'點選年代即可定位到該年代的第一件事件。下方會顯示目前可見的事件範圍。'},
        {target:firstVisible?.querySelector('.event-details>summary'),title:'點加號開始閱讀',text:'點年份、標題或加號可展開介紹，也能同時展開多件事件。畫面中只要有事件展開，滑鼠滾輪就用來上下閱讀。'},
        {target:el('later').parentElement,title:'切換上一組、下一組',text:'閱讀中可按這兩個按鈕切換事件。畫面中的事件全部收起後，也能用滑鼠滾輪左右翻閱；連續滾動一次翻一組。'}
      ];
    }else if(state.mode==='news'){
      tourSteps=[
        {target:el('newsQuery'),title:'搜尋剪報',text:'可搜尋整理標題、報別或歷史用語。結果會立即更新，也會顯示符合的篇數。'},
        {target:el('backToTimeline'),title:'回到年表',text:'按這裡返回原本閱讀的年表範圍。'}
      ];
    }else{
      tourSteps=[
        {target:el('readAll'),title:'直接開始閱讀',text:`按「閱讀全部事件」可開啟全部 ${EV.length} 件精選事件。進入年表後，仍可隨時搜尋或篩選。`},
        {target:el('decadeOptions'),title:'選擇年代',text:'可複選想讀的年代；不勾選代表全部年代。'},
        {target:el('typeOptions'),title:'選擇事件類型',text:'可依類型挑選事件，顏色和文字會一起標示類別。選好後按「開始閱讀」。'}
      ];
    }
    tourSteps=tourSteps.filter(step=>step.target?.getClientRects().length);
    tourIndex=0;tourScroll=window.scrollY;
    tour.showModal();
    showTourStep();
  });
  el('tourNext').addEventListener('click',()=>{
    if(tourIndex===tourSteps.length-1) tour.close();
    else {tourIndex++;showTourStep();}
  });
  el('tourPrevious').addEventListener('click',()=>{tourIndex--;showTourStep();});
  el('tourExit').addEventListener('click',()=>tour.close());
  tour.addEventListener('close',()=>{
    window.scrollTo({top:tourScroll,behavior:'instant'});
    el('startTour').focus({preventScroll:true});
  });
  window.addEventListener('resize',placeTour);
  window.addEventListener('scroll',placeTour,{passive:true});
  el('clearNewsScope').addEventListener('click',()=>{state.newsAll=true;state.limit=40;renderNews();});
  el('imageZoom').addEventListener('click',()=>{const zoom=el('imageCanvas').classList.toggle('zoomed');el('imageZoom').textContent=zoom?'縮回完整圖片':'放大圖片';el('imageZoom').setAttribute('aria-pressed',String(zoom));});
  all('#timeline,#aboutSamples').forEach(root=>root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.mediaSelect){const section=b.closest('.media-section');pauseAudio(section);all('[data-media-panel]',section).forEach(p=>p.hidden=p.dataset.mediaPanel!==b.dataset.mediaSelect);all('[data-media-select]',section).forEach(t=>t.setAttribute('aria-pressed',String(t===b)));}
    if(b.dataset.shareEvent)share(b.dataset.shareEvent);
    if(b.dataset.closeEvent){const details=b.closest('.event-details');details.open=false;details.querySelector('summary').focus({preventScroll:true});}
  }));
  window.addEventListener('scroll',()=>{if(!tour.open&&state.mode==='read'&&state.view==='list'){capturePosition();syncPosition();queueSave();}},{passive:true});
  window.addEventListener('pagehide',()=>{if(state.hasRead){capturePosition();try{localStorage.setItem(progressKey,JSON.stringify(snapshot()));}catch{}}});
  window.addEventListener('popstate',restoreRoute);
  all('[data-event-count]').forEach(n=>n.textContent=EV.length);
  el('aboutCounts').textContent=`精選 ${EV.length} 件事件：`+[['重大事件',EV.filter(e=>e.type==='event').length],...['news','lit','people'].map(t=>[TRACKS[t].name,EV.filter(e=>e.track===t).length])].filter(x=>x[1]).map(x=>`${x[1]} 件${x[0]}`).join('、')+'。事件不會因篩選而增加。';
  el('aboutSamples').innerHTML=mediaHtml({id:'about'},{samples:true});
  bindAudio(el('aboutSamples'));
  all('dialog').forEach(dialog=>dialog.addEventListener('close',()=>pauseAudio(dialog)));
  syncPicker();applyPrefs();updateResume();restoreRoute();

})();
