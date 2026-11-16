/* Google Sheet content: CSV parsing, row validation, link handling and loading with fallbacks.
   The pure functions are shared with the dependency-free tests. */
const SheetData = (() => {
  const TRACK_NAMES = {'智力測驗':'iq','適應行為量表':'ab','法規與鑑定':'law','剪報':'news','研究':'lit','學生人數':'people'};
  const TRACK_TYPES = {iq:'event',ab:'event',law:'event',news:'news',lit:'lit',people:'people'};
  const PRECISIONS = {'日':'day','月':'month','年':'year','年代':'decade'};
  const KINDS = {'照片':'photo','圖片':'photo','剪報':'clip','錄音':'audio','影片':'video','文字':'text'};
  const text = v => String(v ?? '').replace(/\r\n?/g, '\n').trim();
  const hidden = v => /^(否|不|no|n|false|0|隱藏)$/i.test(text(v));

  function parseCSV(source) {
    const rows = []; let row = [], cell = '', quoted = false;
    const s = String(source).replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // First row is the header; blank rows are dropped. Each object remembers its sheet row number.
  function toObjects(rows) {
    if (!rows.length) return [];
    const head = rows[0].map(text);
    return rows.slice(1).map((r, i) => {
      const o = {_row: i + 2};
      head.forEach((h, j) => { if (h) o[h] = text(r[j]); });
      return o;
    }).filter(o => Object.keys(o).some(k => k !== '_row' && o[k]));
  }

  function parseDateText(value) {
    const m = text(value).match(/^(\d{4})(?:\s*[-\/.年]\s*(\d{1,2}))?(?:\s*[-\/.月]\s*(\d{1,2}))?\s*日?$/);
    if (!m) return null;
    const y = +m[1], mo = m[2] ? +m[2] : 0, dd = m[3] ? +m[3] : 0;
    if (y < 1800 || y > 2200 || mo > 12 || dd > 31) return null;
    return {date: [y, mo && String(mo).padStart(2, '0'), mo && dd && String(dd).padStart(2, '0')].filter(Boolean).join('-'), mo, dd};
  }

  function toEvents(rows, newsCount, problems = []) {
    const out = [], seen = new Set();
    for (const r of rows) {
      const where = `「事件」第 ${r._row} 列`;
      if (hidden(r['顯示'])) continue;
      const id = text(r['編號']);
      if (!/^[\w-]+$/.test(id)) { problems.push(`${where}：編號只能用英文字母、數字、- 或 _，已略過。`); continue; }
      if (seen.has(id)) { problems.push(`${where}：編號 ${id} 重複，已略過。`); continue; }
      const track = TRACK_NAMES[text(r['類型'])];
      if (!track) { problems.push(`${where}：類型「${text(r['類型'])}」不在清單內，已略過。`); continue; }
      const d = parseDateText(r['日期']);
      if (!d) { problems.push(`${where}：日期「${text(r['日期'])}」看不懂，已略過。`); continue; }
      const title = text(r['標題']);
      if (!title) { problems.push(`${where}：沒有標題，已略過。`); continue; }
      let precision = PRECISIONS[text(r['日期精確度'])] || (d.dd ? 'day' : d.mo ? 'month' : 'year');
      if (precision === 'day' && !d.dd) precision = d.mo ? 'month' : 'year';
      if (precision === 'month' && !d.mo) precision = 'year';
      let news = null;
      if (text(r['剪報序號']) !== '') {
        const n = Number(r['剪報序號']);
        if (Number.isInteger(n) && n >= 0 && n < newsCount) news = n;
        else problems.push(`${where}：剪報序號「${r['剪報序號']}」不存在，已忽略這一欄。`);
      }
      seen.add(id);
      const e = {id, type: TRACK_TYPES[track], track, date: d.date, precision, certainty: precision === 'decade' ? 'approx' : 'sure',
        title, summary: text(r['完整說明']) || title, memo: text(r['備註']), easy: text(r['易讀介紹']),
        source: text(r['資料來源']) || '未註明', why: text(r['精選理由']), importance: 2};
      if (precision === 'decade') e.when = Math.floor(+d.date.slice(0, 4) / 10) * 10 + '年代';
      if (news != null) e.news = news;
      out.push(e);
    }
    return out;
  }

  // "1:05 原文 | 中文對照" per line. Lines without a time are kept as untimed paragraphs.
  function parseTranscript(value) {
    const segments = [];
    for (const line of text(value).split('\n').map(s => s.trim()).filter(Boolean)) {
      const m = line.match(/^\[?(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.\d+)?\]?\s*(.*)$/);
      const body = m ? m[4] : line, bar = body.search(/[|｜]/);
      const seg = {time: m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : null,
        text: (bar < 0 ? body : body.slice(0, bar)).trim(), translation: bar < 0 ? '' : body.slice(bar + 1).trim()};
      if (seg.text || seg.translation) segments.push(seg);
    }
    return segments;
  }

  const driveId = url => {
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url)) return null;
    const m = url.match(/\/d\/([\w-]{10,})/) || url.match(/[?&]id=([\w-]{10,})/);
    return m ? m[1] : null;
  };
  const youtubeId = url => {
    const m = url.match(/^https?:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)([\w-]{6,})/) || url.match(/^https?:\/\/youtu\.be\/([\w-]{6,})/);
    return m ? m[1] : null;
  };
  // Returns how a link should be shown for the given kind, or null if it cannot be used safely.
  function resolveLink(value, kind) {
    const url = text(value);
    if (!url) return null;
    const yt = youtubeId(url);
    if (yt) return kind === 'video' ? {embed: 'https://www.youtube-nocookie.com/embed/' + yt, provider: 'youtube'} : null;
    const id = driveId(url);
    if (id) {
      if (kind === 'photo' || kind === 'clip') return {src: 'https://lh3.googleusercontent.com/d/' + id + '=w1600', backup: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600', provider: 'drive'};
      if (kind === 'audio') return {src: 'https://drive.google.com/uc?export=download&id=' + id, embed: 'https://drive.google.com/file/d/' + id + '/preview', provider: 'drive'};
      return {embed: 'https://drive.google.com/file/d/' + id + '/preview', provider: 'drive'};
    }
    if (/^https?:\/\//i.test(url)) return /[\s"'<>]/.test(url) ? null : {src: url, provider: 'url'};
    // Site-relative file such as assets/interview.mp3
    if (/^[^:\\?#\s"'<>]+$/.test(url) && !url.startsWith('/') && !url.includes('..')) return {src: url, provider: 'site'};
    return null;
  }

  function toMedia(rows, eventIds, problems = []) {
    const out = [], seen = new Set(), known = new Set(eventIds);
    for (const r of rows) {
      const where = `「附件」第 ${r._row} 列`;
      if (hidden(r['顯示'])) continue;
      const kind = KINDS[text(r['種類'])];
      if (!kind) { problems.push(`${where}：種類「${text(r['種類'])}」不在清單內，已略過。`); continue; }
      let id = text(r['編號']).replace(/[^\w-]/g, '') || 'r' + r._row;
      if (seen.has(id)) id += '-r' + r._row;
      const wanted = text(r['事件編號']).split(/[,，、;；\s]+/).filter(Boolean);
      const events = wanted.filter(e => known.has(e));
      wanted.filter(e => !known.has(e)).forEach(e => problems.push(`${where}：找不到事件 ${e}。`));
      if (!events.length) { if (!wanted.length) problems.push(`${where}：沒有填事件編號，已略過。`); continue; }
      const body = text(r['內文']);
      const link = kind === 'text' ? null : resolveLink(r['連結'], kind);
      if (kind === 'text' ? !body : !link) {
        problems.push(kind === 'text' ? `${where}：文字附件沒有內文，已略過。` : `${where}：連結空白或無法使用，已略過。`);
        continue;
      }
      seen.add(id);
      const title = text(r['標題']) || text(r['種類']);
      out.push({id, kind, events, title, caption: text(r['圖說']), alt: text(r['替代文字']) || title, text: body,
        credit: text(r['來源與授權']), segments: kind === 'audio' || kind === 'video' ? parseTranscript(r['逐字稿']) : [], link});
    }
    return out;
  }

  // rows: {events:[row objects], media:[row objects]}
  function build(rows, newsCount, origin = 'snapshot') {
    const problems = [];
    const events = toEvents(rows.events || [], newsCount, problems);
    const media = toMedia(rows.media || [], events.map(e => e.id), problems);
    return {events, media, problems, origin};
  }

  const CACHE_KEY = 'history-timeline.sheet.v1', SKIP_KEY = 'history-timeline.sheet.skip';
  const csvUrl = (id, sheet) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheet)}`;
  async function fetchRows(config, timeout) {
    const control = new AbortController(), timer = setTimeout(() => control.abort(), timeout);
    try {
      const get = async (sheet, required) => {
        const response = await fetch(csvUrl(config.sheetId, sheet), {signal: control.signal, credentials: 'omit', cache: 'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const rows = parseCSV(await response.text());
        // A missing tab silently returns the first tab, and a private sheet returns a sign-in page.
        if (!rows.length || !required.every(h => rows[0].map(text).includes(h))) throw new Error('unexpected columns in ' + sheet);
        return toObjects(rows);
      };
      const [events, media] = await Promise.all([get(config.eventsSheet || '事件', ['編號', '日期', '標題']), get(config.mediaSheet || '附件', ['事件編號', '種類'])]);
      return {events, media};
    } finally { clearTimeout(timer); }
  }
  // Live sheet -> last copy saved in this browser -> snapshot built into the page.
  async function load(config, snapshot, newsCount) {
    const fallback = () => build(snapshot, newsCount, 'snapshot');
    let skip = false;
    try { skip = sessionStorage.getItem(SKIP_KEY) === '1'; } catch {}
    if (!config || !config.sheetId || skip) return fallback();
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch {}
    if (!cached || cached.sheetId !== config.sheetId || !cached.rows) cached = null;
    try {
      const rows = await fetchRows(config, cached ? 3000 : 5000);
      const data = build(rows, newsCount, 'sheet');
      if (!data.events.length) throw new Error('no usable events');
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({sheetId: config.sheetId, saved: Date.now(), rows})); } catch {}
      return data;
    } catch (error) {
      if (cached) { const data = build(cached.rows, newsCount, 'cache'); if (data.events.length) return data; }
      return fallback();
    }
  }
  // Called when live data broke the page: reload once using only the built-in snapshot.
  function distrust() {
    try { localStorage.removeItem(CACHE_KEY); if (sessionStorage.getItem(SKIP_KEY) === '1') return false; sessionStorage.setItem(SKIP_KEY, '1'); return true; } catch { return false; }
  }
  return {TRACK_NAMES, PRECISIONS, KINDS, parseCSV, toObjects, parseDateText, toEvents, toMedia, parseTranscript, resolveLink, build, csvUrl, load, distrust};
})();
