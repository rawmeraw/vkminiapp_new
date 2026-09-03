/* Permlive VK Mini App — app.js (real API, timezone fix, 2 months, timeline separate) */
const API_BASE = 'https://permlive.ru';
const bridge = window.vkBridge;
try{ bridge && bridge.send('VKWebAppInit'); }catch(e){}
// fix fetch for github.io -> permlive.ru for map-emotions (404 on rawmeraw.github.io/api/...)
(function(){
  const origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    try{
      let url = typeof input==='string' ? input : input.url;
      if(url && url.startsWith('/api/')) url = API_BASE + url;
      else if(url && url.startsWith('api/')) url = API_BASE + '/' + url;
      if(url !== (typeof input==='string' ? input : input.url)){
        if(typeof input==='string') input = url;
        else input = new Request(url, input);
      }
    }catch(e){}
    return origFetch(input, init);
  };
})();

const $ = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];

const els = {
  tabBtns: $$('.pl-tabbar__btn'),
  viewFeed: $('#view-feed'),
  viewMap: $('#view-map'),
  calendarInner: $('#calendar-dates-inner'),
  calOverlay: $('#cal-overlay'),
  calModal: $('#cal-modal'),
  top10Row: $('#top10-row'),
  upcomingRow: $('#upcoming-row'),
  dateRow: $('#date-row'),
  sliderTop10: $('#slider-top10'),
  sliderUpcoming: $('#slider-upcoming'),
  sliderDate: $('#slider-date'),
  top10Badge: $('#top10-badge'),
  upcomingBadge: $('#upcoming-badge'),
  dateBadge: $('#date-badge'),
  dateTitleText: $('#date-title-text'),
  top10TitleLink: $('#top10-title-link'),
  upcomingTitleLink: $('#upcoming-title-link'),
  dateTitleLink: $('#date-title-link'),
  timeline: $('#concert-container'),
  timelineEmpty: $('#timeline-empty'),
  timelineWrap: $('#timeline-wrap'),
  feedSliders: $('#feed-sliders'),
  searchInput: $('#search-input'),
  toast: $('#toast'),
  sheet: $('#event-sheet'),
  sheetOverlay: $('#event-sheet-overlay'),
  sheetContent: $('#sheet-content'),
  mapEl: $('#map'),
};

// --- timezone Ekaterinburg (Asia/Yekaterinburg UTC+5) ---
function ekbTodayISO(){
  // Use Intl to get date in Ekaterinburg
  const fmt = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Yekaterinburg', year:'numeric', month:'2-digit', day:'2-digit'});
  return fmt.format(new Date());
}
function ekbToISO(d){ // d is local Date, convert via Ekaterinburg? For parsing we treat ISO as calendar date
  return d.toISOString().slice(0,10);
}
function toISO(d){ // local calendar date without timezone shift
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function parseISO(s){ const [y,m,day]=s.split('-').map(Number); return new Date(y,m-1,day); }
function fmtDay(d){ const m=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']; return `${d.getDate()} ${m[d.getMonth()]}`; }
function fmtWeekday(d){ const w=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']; return w[d.getDay()]; }
function fmtHeaderDate(d){ const today=parseISO(state.todayISO); if(toISO(d)===state.todayISO) return 'Сегодня'; const tmr=new Date(today); tmr.setDate(today.getDate()+1); if(toISO(d)===toISO(tmr)) return 'Завтра'; return `${fmtWeekday(d)}, ${fmtDay(d)}`; }
function fmtDateShort(iso){ const d=parseISO(iso); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`; }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function toast(msg){
  els.toast.textContent=msg;
  els.toast.classList.add('pl-toast--show');
  setTimeout(()=>els.toast.classList.remove('pl-toast--show'),2200);
}

// deterministic pastel color fallback
function hashColor(str){
  let h=0; for(let i=0;i<str.length;i++) h=(h*31 + str.charCodeAt(i))>>>0;
  const pastels=['#e8d5c4','#d5e8c4','#c4d5e8','#e8c4d5','#d8c4e8','#c4e8d5','#f0d5b8','#c8e0f0'];
  return pastels[h % pastels.length];
}
function optimizeMiniImage(url){
  if(!url || typeof url!=='string') return url;
  try{
    if(url.includes('vkuserphoto.ru') || url.includes('userapi.com')){
      // keep 400-540 like site, 200 too small and may 404 for some sizes — use 400
      if(url.match(/cs=\d+x\d+/)) return url.replace(/cs=\d+x\d+/, 'cs=400x400');
      const sep = url.includes('?') ? '&' : '?';
      return url + sep + 'cs=400x400';
    }
    if(url.includes('cdn.qtickets.tech')) return url;
    if(url.includes('ponominalu.ru/media/i/')) return url.replace(/\/media\/i\/\d+x\d+\//, '/media/i/400x300/');
    if(url.includes('live.mts.ru/image/')) return url;
    if(url.includes('mycdn.me') && url.includes('size=')) return url.replace(/size=[^&]+/, 'size=400x400');
  }catch(e){}
  return url;
}

function extractSlug(urlOrSlug){
  if(!urlOrSlug) return '';
  if(urlOrSlug.includes('/')){ // url like https://permlive.ru/event/slug/ or /event/slug/
    const m=urlOrSlug.match(/\/event\/([^\/\?#]+)/);
    if(m) return m[1];
    const parts=urlOrSlug.split('/').filter(Boolean);
    return parts[parts.length-1]||'';
  }
  return urlOrSlug;
}

const state = {
  tab: 'feed',
  selectedDate: null, // no day selected by default (per request)
  range: null,
  datesWithEvents: new Set(),
  concerts: [],
  upcomingPool: [],
  top10Pool: [],
  filtered: [],
  query: '',
  map: null,
  mapMarkers: [],
  mapMode: 'all',
  todayISO: ekbTodayISO(),
  timelineMode: null,
};

async function fetchJSON(url){
  try{
    const r=await fetch(url,{headers:{'X-Requested-With':'XMLHttpRequest'}});
    if(!r.ok) throw new Error(r.status);
    return await r.json();
  }catch(e){ console.warn('fetch failed', url, e); return null; }
}
function cachedFetch(key, url, ttlMs){
  try{
    const raw=localStorage.getItem(key);
    if(raw){
      const o=JSON.parse(raw);
      if(o && o.t && Date.now()-o.t < ttlMs && o.v) return Promise.resolve(o.v);
    }
  }catch(e){}
  return fetchJSON(url).then(function(v){
    if(v) try{ localStorage.setItem(key, JSON.stringify({t:Date.now(), v:v})); }catch(e){}
    return v;
  });
}

async function loadData(){
  const cal = await cachedFetch('pl_cal_'+ekbTodayISO(), `${API_BASE}/api/calendar-dates/`, 5*60*1000);
  if(cal && Array.isArray(cal.dates)){
    state.datesWithEvents=new Set(cal.dates);
    if(cal.today) state.todayISO=cal.today;
  }
  // we show only 20 images but top10 needs correct ordering across future — fetch 80 for correct rock saturday order
  let pool = [];
  const api = await cachedFetch('pl_concerts_'+state.todayISO, `${API_BASE}/api/concerts/?limit=80`, 5*60*1000);
  if(api){
    const results = Array.isArray(api.results)?api.results: Array.isArray(api)?api: [];
    pool = results.map(normalizeApiConcert).filter(c=>c.slug && c.date);
  }
  if(!pool.length){
    // fallback to map events for splicing dates
    const todayEvents = await fetchJSON(`${API_BASE}/map/events/?date=${state.todayISO}`);
    if(todayEvents && Array.isArray(todayEvents.events)){
      pool = todayEvents.events.map(normalizeApiEvent).filter(c=>c.slug);
    }
  }
  // filter out broken
  state.concerts = pool.filter(c=>c.id && c.title && c.date);
  // sort future only for top10/upcoming
  if(!state.datesWithEvents.size) state.datesWithEvents=new Set(state.concerts.map(c=>c.date));
  // precompute top10 pool sorted by rating
  const future = state.concerts.filter(c=> c.date >= state.todayISO);
  state.top10Pool = [...future].sort((a,b)=> parseFloat(b.cached_rating||0)-parseFloat(a.cached_rating||0) || a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  state.upcomingPool = future.slice().sort((a,b)=> a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
}

function normalizeApiConcert(c){
  const slug = c.slug || extractSlug(c.url||c.link||'');
  const placeName = c.place?.name || c.place_name || '';
  const bg = c.bg_color || c.place?.bg_color || hashColor(slug||placeName||String(c.id));
  const img = c.main_image || c.image || c.images?.[0]?.url || '';
  return {
    id:c.id, title:c.title||c.name||'Без названия', slug, date:(c.date||'').slice(0,10), time:(c.time||'19:00').slice(0,5),
    place: c.place||{name:placeName, coordinates:c.coordinates||'58.0105,56.2502', address:c.address||''}, place_name: placeName,
    bg_color: bg, main_image: img, price: c.price ?? '',
    cached_rating: String(c.cached_rating||c.rating||c.display_rating||'3.0'), display_rating: String(c.display_rating||c.rating||c.cached_rating||'3.0'),
    is_paid: !!c.is_paid, tickets:c.tickets||c.link||'', tags: c.tags||[], description:c.description||''
  };
}
function normalizeApiEvent(e){
  const slug = e.slug || extractSlug(e.url||'');
  const placeName = e.place || e.place_name || '';
  const bg = e.bg_color || hashColor(slug||placeName||String(e.id));
  const img = e.image || e.main_image || '';
  return {
    id:e.id||Math.floor(Math.random()*1e6), title:e.title, slug, date:e.date, time:(e.time||'19:00').slice(0,5),
    place:{name:placeName, coordinates: (e.coordinates? e.coordinates.join(',') : '58.0105,56.2502'), address:e.address||''}, place_name:placeName,
    bg_color:bg, main_image:img, price:e.price ?? '', cached_rating:String(e.rating||'4.0'), display_rating:String(e.rating||'4.0'),
    is_paid:!!e.paid, tickets:e.tickets||'', tags:e.tags||[], description:e.description||''
  };
}

// Calendar strip — 60 days (2 months) from today, inactive if no concerts, month label
function updateMonthLabel(){
  const lbl=document.getElementById('calendar-month-label');
  if(!lbl) return;
  const today=parseISO(state.todayISO);
  const monthsNom=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  // show month of today + next if spans two months
  const end=new Date(today); end.setDate(end.getDate()+59);
  const m1=monthsNom[today.getMonth()], m2=monthsNom[end.getMonth()];
  const y1=today.getFullYear(), y2=end.getFullYear();
  let txt=m1.charAt(0).toUpperCase()+m1.slice(1);
  if(m1!==m2) txt+=` — ${m2.charAt(0).toUpperCase()+m2.slice(1)}`;
  if(y1!==y2) txt+=` ${y1} — ${y2}`;
  else txt+=` ${y1}`;
  lbl.textContent=txt;
}
function renderCalendarStrip(){
  const inner=els.calendarInner;
  inner.innerHTML='';
  updateMonthLabel();
  const today=parseISO(state.todayISO);
  const totalDays = 60;
  for(let i=0;i<totalDays;i++){
    const d=new Date(today); d.setDate(today.getDate()+i);
    const iso=toISO(d);
    const has = state.datesWithEvents.has(iso) || state.datesWithEvents.size===0;
    const inRange = isInRange(iso);
    const sel = state.selectedDate ? (state.range ? inRange : iso===state.selectedDate) : false;
    const isWeekend=d.getDay()===0||d.getDay()===6;
    const el=document.createElement('button');
    el.className='calendar-date'+(sel?' selected':'')+(isWeekend?' calendar-date--weekend':'');
    if(inRange && state.range) el.classList.add('in-range');
    if(!has) el.classList.add('calendar-date--empty');
    el.dataset.date=iso;
    el.disabled = !has;
    el.setAttribute('aria-disabled', String(!has));
    el.innerHTML=`<span class="calendar-date__day">${d.getDate()}</span><span class="calendar-date__wd">${['пн','вт','ср','чт','пт','сб','вс'][ (d.getDay()+6)%7 ]}</span>`;
    if(has) el.addEventListener('click',()=> handleCalendarClick(iso));
    inner.appendChild(el);
  }
  updateArrowVisibility();
}

function isInRange(iso){
  if(!state.range) return false;
  return iso>=state.range.start && iso<=state.range.end;
}

function handleCalendarClick(iso){
  // clicking same selected single date -> cancel to main (per request)
  if(!state.range && iso===state.selectedDate){
    clearDateFilter();
    return;
  }
  if(state.range && iso>=state.range.start && iso<=state.range.end && state.range.start!==state.range.end){
    state.range=null;
    state.selectedDate=iso;
    state.timelineMode=null;
  } else {
    state.range=null;
    state.selectedDate=iso;
    state.timelineMode=null;
  }
  renderCalendarStrip();
  applyFilter();
  loadMapForDate(iso);
  const sel=document.querySelector(`.calendar-date[data-date="${iso}"]`);
  sel && sel.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
}

function clearDateFilter(){
  state.range=null;
  state.selectedDate=null;
  state.timelineMode=null;
  renderCalendarStrip();
  applyFilter();
  refreshMapMarkers();
}

function updateArrowVisibility(){
  const inner=els.calendarInner;
  const left=$('#feed-calendar .calendar-arrow.left');
  const right=$('#feed-calendar .calendar-arrow.right');
  if(!left||!right) return;
  function upd(){ left.classList.toggle('hidden', inner.scrollLeft<=4); right.classList.toggle('hidden', inner.scrollLeft+inner.clientWidth >= inner.scrollWidth-4); }
  inner.addEventListener('scroll', upd);
  upd();
  left.onclick=()=> inner.scrollBy({left:-240,behavior:'smooth'});
  right.onclick=()=> inner.scrollBy({left:240,behavior:'smooth'});
}

// Month modal — 2 months logic, show current month + next
let calView=null;
let rangeStart=null;
function openCalendar(){
  els.calOverlay.classList.add('pl-map-calendar-overlay--show');
  els.calModal.classList.add('pl-map-calendar-modal--open');
  els.calModal.setAttribute('aria-hidden','false');
  if(!calView){ const sel=parseISO(state.range?.start||state.selectedDate||state.todayISO); calView={y:sel.getFullYear(), m:sel.getMonth()}; }
  rangeStart=null;
  renderMonth();
}
function closeCalendar(){
  els.calOverlay.classList.remove('pl-map-calendar-overlay--show');
  els.calModal.classList.remove('pl-map-calendar-modal--open');
  els.calModal.setAttribute('aria-hidden','true');
}
function renderMonth(){
  const host=els.calModal.querySelector('.pl-map-calendar-modal__cal');
  const y=calView.y, m=calView.m;
  const today=parseISO(state.todayISO);
  const maxDate = parseISO(state.todayISO); maxDate.setDate(maxDate.getDate()+90);
  const monthsNom=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const atStart = y < today.getFullYear() || (y===today.getFullYear() && m<=today.getMonth());
  const atEnd = y>maxDate.getFullYear() || (y===maxDate.getFullYear() && m>=maxDate.getMonth());
  host.innerHTML='';
  const head=document.createElement('div'); head.className='pl-map-mcal__head';
  const prev=document.createElement('button'); prev.className='pl-map-mcal__nav'; prev.innerHTML='<i class="fas fa-chevron-left" style="font-size:12px"></i>';
  const next=document.createElement('button'); next.className='pl-map-mcal__nav'; next.innerHTML='<i class="fas fa-chevron-right" style="font-size:12px"></i>';
  const label=document.createElement('div'); label.className='pl-map-mcal__label'; label.textContent=`${monthsNom[m].charAt(0).toUpperCase()+monthsNom[m].slice(1)} ${y}`;
  const close=document.createElement('button'); close.className='pl-map-mcal__nav'; close.innerHTML='&times;'; close.style.fontSize='18px';
  if(atStart) prev.disabled=true; if(atEnd) next.disabled=true;
  prev.onclick=()=>{ if(atStart) return; calView={y: m===0?y-1:y, m: m===0?11:m-1}; renderMonth(); };
  next.onclick=()=>{ if(atEnd) return; calView={y: m===11?y+1:y, m: m===11?0:m+1}; renderMonth(); };
  close.onclick=closeCalendar;
  head.append(prev,label,next,close);
  const isMap = state.tab==='map';
  const hint=document.createElement('div'); hint.style.cssText='font-size:11px;color:#999;text-align:center;margin:6px 0';
  hint.textContent= isMap ? 'Выберите дату' : (rangeStart ? 'Выберите конец диапазона' : 'Клик — дата, второй клик — диапазон');
  const grid=document.createElement('div'); grid.className='pl-map-mcal__grid';
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach((n,i)=>{ const w=document.createElement('div'); w.className='pl-map-mcal__wd'+(i>=5?' pl-map-mcal__wd--weekend':''); w.textContent=n; grid.appendChild(w); });
  const first=new Date(y,m,1); const offset=(first.getDay()+6)%7; const daysIn=new Date(y,m+1,0).getDate();
  for(let i=0;i<offset;i++){ const e=document.createElement('div'); e.style.aspectRatio='1'; grid.appendChild(e); }
  for(let d=1;d<=daysIn;d++){
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const has = state.datesWithEvents.has(ds);
    const past = ds < state.todayISO;
    const wd=new Date(y,m,d).getDay();
    const btn=document.createElement('button'); btn.className='pl-map-mcal__day'; if(wd===0||wd===6) btn.classList.add('pl-map-mcal__day--weekend');
    btn.innerHTML=`<span>${d}</span>`;
    const inSelRange = state.range && ds>=state.range.start && ds<=state.range.end;
    const isStart = rangeStart===ds;
    if(inSelRange) btn.classList.add('pl-map-mcal__day--selected');
    if(isStart) btn.style.outline='2px solid #e14425';
    const isEmpty = !has && !past;
    if(past || isEmpty){ btn.classList.add('pl-map-mcal__day--muted'); btn.disabled=true; }
    else if(!state.range && ds===state.selectedDate) btn.classList.add('pl-map-mcal__day--selected');
    else if(ds===state.todayISO && !inSelRange) btn.classList.add('pl-map-mcal__day--today');
    if(!past && has) btn.onclick=()=> handleMonthDayClick(ds);
    grid.appendChild(btn);
  }
  const filled=offset+daysIn; for(let f=filled; f<42; f++){ const e=document.createElement('div'); grid.appendChild(e); }
  const foot=document.createElement('div'); foot.style.cssText='display:flex;gap:8px;margin-top:10px';
  const btnClear=document.createElement('button'); btnClear.className='pl-btn pl-btn--secondary'; btnClear.style.flex='1'; btnClear.textContent='Сбросить';
  btnClear.onclick=()=>{ state.range=null; rangeStart=null; state.selectedDate=null; state.timelineMode=null; renderCalendarStrip(); applyFilter(); closeCalendar(); refreshMapMarkers(); };
  const btnToday=document.createElement('button'); btnToday.className='pl-btn'; btnToday.style.flex='1'; btnToday.textContent='Сегодня';
  btnToday.onclick=()=>{ state.range=null; rangeStart=null; state.selectedDate=state.todayISO; state.timelineMode=null; renderCalendarStrip(); applyFilter(); closeCalendar(); refreshMapMarkers(); };
  foot.append(btnClear,btnToday);
  host.append(head,hint,grid,foot);
}

function handleMonthDayClick(ds){
  // map: only single date, no range
  if(state.tab==='map'){
    state.range=null;
    rangeStart=null;
    state.selectedDate=ds;
    state.timelineMode=null;
    closeCalendar();
    renderCalendarStrip();
    applyFilter();
    loadMapForDate(ds);
    return;
  }
  if(!rangeStart){
    rangeStart=ds;
    renderMonth();
    return;
  }
  let start=rangeStart, end=ds;
  if(start>end) [start,end]=[end,start];
  if(start===end){
    state.range=null;
    state.selectedDate=start;
    state.timelineMode=null;
  } else {
    state.range={start,end};
    state.selectedDate=start;
    state.timelineMode='range';
  }
  rangeStart=null;
  closeCalendar();
  renderCalendarStrip();
  applyFilter();
  refreshMapMarkers();
}

// Cards
function shortMonthRu(dateObj){
  const m=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return m[dateObj.getMonth()];
}
function fmtShortDate(d){ // "7 сен" etc, сегодня/завтра handling for cards
  if(toISO(d)===state.todayISO) return 'Сегодня';
  const today=parseISO(state.todayISO); const tmr=new Date(today); tmr.setDate(today.getDate()+1);
  if(toISO(d)===toISO(tmr)) return 'Завтра';
  return `${d.getDate()} ${shortMonthRu(d)}`;
}
function fmtUpcomingDate(d, timeStr){
  if(toISO(d)===state.todayISO){
    return timeStr ? timeStr.slice(0,5) : 'Сегодня';
  }
  if(toISO(d)===toISO((()=>{const t=parseISO(state.todayISO); const n=new Date(t); n.setDate(n.getDate()+1); return n})())) return 'Завтра';
  return fmtShortDate(d);
}

function cardHTML(c, opts={}){
  const isTop10 = !!opts.rank;
  const isUpcoming = opts.mode==='upcoming' || opts.mode==='date';
  const rank=opts.rank? `<div class="card-rank">${opts.rank}</div>`:'';
  const ratingVal = c.display_rating||c.cached_rating||'';
  const ratingNum = parseFloat(c.cached_rating||0);
  let ratingBadge='';
  let ratingInfo='';
  if(isTop10){
    ratingInfo = ratingVal ? `<div class="card-rating"><i class="fa-solid fa-star"></i> ${esc(ratingVal)}</div>` : '';
  } else {
    if(ratingVal && ratingNum>=4) ratingBadge = `<div class="card-rating-badge ${ratingNum>=5?'featured':''}"><i class="fa-solid fa-star"></i> ${esc(ratingVal)}</div>`;
  }
  const priceTag = c.price===0? 'бесплатно' : c.price? `${c.price}₽`: '';
  // tag: first + count if >1
  let tagHtml='';
  if(!isTop10){
    if(c.tags && c.tags.length){
      const first = esc(c.tags[0].name);
      if(c.tags.length>1) tagHtml = `<span class="tag">${first} <span class="tag-count">+${c.tags.length-1}</span></span>`;
      else tagHtml = `<span class="tag">${first}</span>`;
    }
  }
  const venue = esc(c.place_name||c.place?.name||'');
  const bg = c.bg_color || hashColor(c.slug||venue||String(c.id));
  const imgUrl = c.main_image ? optimizeMiniImage(c.main_image) : '';
  const img = imgUrl? `<img class="card-img" src="${esc(imgUrl)}" alt="${esc(c.title)}" loading="lazy" decoding="async">` : `<div class="card-img-placeholder"></div>`;
  const slug = c.slug || extractSlug(c.url||'');
  const href = slug ? `https://permlive.ru/event/${esc(slug)}/` : '#';
  // date text: upcoming -> time if today else short date
  const dObj = parseISO(c.date);
  let dateText='';
  if(isUpcoming){
    dateText = fmtUpcomingDate(dObj, c.time);
  } else {
    dateText = fmtShortDate(dObj);
  }
  return `<a class="concert-card" href="${href}" target="_blank" rel="noopener" data-slug="${esc(slug)}" style="--card-bg-color:${esc(bg)}">
    <div class="card-img-wrapper">${img}${rank}${ratingBadge}</div>
    <div class="card-info">
      <h3 class="card-title">${esc(c.title)}</h3>
      <div class="card-meta">${esc(dateText)} › ${venue}${priceTag? ' · '+priceTag:''}</div>
      ${ratingInfo}
      <div class="card-footer"><div class="card-tags">${tagHtml}</div></div>
    </div>
  </a>`;
}

function renderSliders(){
  const hasDateFilter = !!state.range || !!state.selectedDate || state.query.trim()!=='' ;
  const showTimeline = !!state.timelineMode;
  if(hasDateFilter && !showTimeline){
    let list=[];
    let title='';
    let total=0;
    if(state.query.trim()){
      list = state.concerts.filter(c=> (c.title+c.place_name+(c.tags?.map(t=>t.name).join(' ')||'')).toLowerCase().includes(state.query.trim().toLowerCase()));
      title=`Поиск «${state.query.trim()}»`;
      total=list.length;
    } else if(state.range){
      list = state.concerts.filter(c=> c.date>=state.range.start && c.date<=state.range.end);
      title=`${fmtDateShort(state.range.start)} — ${fmtDateShort(state.range.end)}`;
      total=list.length;
    } else if(state.selectedDate){
      list = state.concerts.filter(c=> c.date===state.selectedDate);
      title=fmtHeaderDate(parseISO(state.selectedDate));
      total=list.length;
    } else {
      list=[];
      title='';
      total=0;
    }
    els.sliderDate.style.display='';
    els.sliderTop10.style.display='none';
    els.sliderUpcoming.style.display='none';
    els.dateTitleText.textContent=title;
    renderSlider(els.sliderDate, els.dateRow, list, total, 'date', title);
    els.dateTitleLink.onclick=(e)=>{e.preventDefault(); openTimeline('date')};
    els.dateBadge.onclick=(e)=>{e.preventDefault(); openTimeline('date')};
    els.timelineWrap.style.display='none';
  } else if(!hasDateFilter && !showTimeline){
    // No date filter, no timeline: show top10 + upcoming
    els.sliderDate.style.display='none';
    els.sliderTop10.style.display='';
    els.sliderUpcoming.style.display='';
    els.timelineWrap.style.display='none';
    const top10Total = state.top10Pool.length;
    renderSlider(els.sliderTop10, els.top10Row, state.top10Pool, top10Total, 'top10', 'Топ-10');
    // топ-10 не должен быть ссылкой на таймлайн (per request)
    els.top10TitleLink.onclick=null;
    els.top10TitleLink.style.cursor='default';
    els.top10TitleLink.removeAttribute('href');
    if(els.top10Badge) els.top10Badge.style.display='none';
    const upcomingTotal = state.upcomingPool.length;
    renderSlider(els.sliderUpcoming, els.upcomingRow, state.upcomingPool, upcomingTotal, 'upcoming', 'Ближайшие');
    els.upcomingTitleLink.onclick=(e)=>{e.preventDefault(); openTimeline('upcoming')};
    els.upcomingBadge.onclick=(e)=>{e.preventDefault(); openTimeline('upcoming')};
  } else {
    // timeline mode: hide all sliders
    els.sliderDate.style.display='none';
    els.sliderTop10.style.display='none';
    els.sliderUpcoming.style.display='none';
    els.timelineWrap.style.display='';
  }
}

function renderSlider(slider, row, list, total, type, title){
  const isTop10 = type==='top10';
  const hasMore = !isTop10 && total>10;
  const visible = list.slice(0,10);
  row.innerHTML = visible.map((c,i)=> cardHTML(c, isTop10?{rank:i+1,mode:type}:{mode:type})).join('') || '<p style="padding:12px;color:#999">Нет событий</p>';
  const badge = slider.querySelector('.section-count-badge');
  if(badge){
    if(isTop10){
      badge.style.display='none';
    } else if(hasMore){
      badge.textContent=`Смотреть все ${total}`;
      badge.style.display='inline-flex';
      badge.style.cursor='pointer';
    } else badge.style.display='none';
  }
  const oldSee = row.querySelector('.see-all-card');
  if(oldSee) oldSee.remove();
  if(hasMore){
    const more=document.createElement('a');
    more.className='concert-card see-all-card';
    more.style.background='linear-gradient(135deg,#e14425,#ff6b35)';
    more.href='#';
    more.innerHTML=`<div class="see-all-wrapper"><div class="see-all-content"><div class="see-all-icon"><i class="fa-solid fa-arrow-right"></i></div><div class="see-all-text">Смотреть все ${total}</div><div class="see-all-count">${total} концертов</div></div></div>`;
    more.addEventListener('click',e=>{e.preventDefault(); openTimeline(type)});
    row.appendChild(more);
  }
  bindSliderArrows(slider);
}

function bindSliderArrows(slider){
  const row=slider.querySelector('.horizontal-slider-row');
  const left=slider.querySelector('.horizontal-slider-arrow.left');
  const right=slider.querySelector('.horizontal-slider-arrow.right');
  if(!row||!left||!right) return;
  // avoid duplicate listeners
  row.onscroll=null;
  function upd(){ left.classList.toggle('hidden', row.scrollLeft<=4); right.classList.toggle('hidden', row.scrollLeft+row.clientWidth >= row.scrollWidth-4); }
  row.addEventListener('scroll', upd); upd();
  left.onclick=()=> row.scrollBy({left:-260,behavior:'smooth'});
  right.onclick=()=> row.scrollBy({left:260,behavior:'smooth'});
}

// Timeline — only when timelineMode active
function renderTimeline(){
  const list = state.filtered;
  els.timeline.innerHTML='';
  if(!list.length){
    els.timelineEmpty.classList.remove('hidden');
    return;
  }
  els.timelineEmpty.classList.add('hidden');
  const groups={};
  list.forEach(c=>{ (groups[c.date]||(groups[c.date]=[])).push(c); });
  const dates=Object.keys(groups).sort();
  // header with back
  const header=document.createElement('div');
  header.style.cssText='display:flex;align-items:center;gap:8px;margin:12px 0';
  header.innerHTML=`<button id="timeline-back" class="pl-btn pl-btn--secondary" style="padding:6px 10px"><i class="fa-solid fa-arrow-left"></i> Назад</button><span style="font-weight:700">${esc(getTimelineTitle())}</span>`;
  els.timeline.appendChild(header);
  $('#timeline-back').onclick=()=>{
    state.timelineMode=null;
    applyFilter();
  };
  dates.forEach(date=>{
    const d=parseISO(date);
    const dayEl=document.createElement('div'); dayEl.className='schedule-day';
    const title=document.createElement('div'); title.className='schedule-day-title';
    const isToday=date===state.todayISO;
    // без счетчика около даты (per request)
    title.innerHTML=`<i class="fa-solid fa-calendar"></i> ${isToday? 'Сегодня': fmtHeaderDate(d)}`;
    dayEl.appendChild(title);
    const events=document.createElement('div'); events.className='schedule-day-events';
    groups[date].forEach(c=>{
      const slug=c.slug||extractSlug(c.url||'');
      const row=document.createElement('div'); row.className='schedule-event';
      row.innerHTML=`<span class="schedule-time">${esc(c.time||'')}</span>
        <a class="schedule-title" href="https://permlive.ru/event/${esc(slug)}/" target="_blank" rel="noopener">${esc(c.title)} ${parseFloat(c.cached_rating)>=4? `<span style="background:#ffc107;border-radius:999px;padding:2px 6px;font-size:10px"><i class="fa-solid fa-star"></i> ${esc(c.display_rating)}</span>`:''}</a>
        <span class="schedule-details">${esc(c.place_name||c.place?.name||'')} ${c.tags?.length? '› '+esc(c.tags[0].name):''} ${c.price===0?'› бесплатно': c.price? `› ${c.price}₽`:''}</span>`;
      events.appendChild(row);
    });
    dayEl.appendChild(events);
    els.timeline.appendChild(dayEl);
  });
}

function getTimelineTitle(){
  if(state.timelineMode==='top10') return 'Топ-10';
  if(state.timelineMode==='upcoming') return 'Ближайшие события';
  if(state.timelineMode==='date') return fmtHeaderDate(parseISO(state.selectedDate));
  if(state.timelineMode==='range') return `${fmtDateShort(state.range.start)} — ${fmtDateShort(state.range.end)}`;
  if(state.timelineMode==='search') return `Поиск «${state.query}»`;
  return '';
}

function applyFilter(){
  const q=state.query.trim().toLowerCase();
  let list=[];
  if(q){
    list = state.concerts.filter(c=> (c.title+c.place_name+(c.tags?.map(t=>t.name).join(' ')||'')).toLowerCase().includes(q));
    state.timelineMode='search';
  } else if(state.timelineMode==='top10'){
    list = [...state.top10Pool].slice(0,80);
  } else if(state.timelineMode==='upcoming'){
    list = [...state.upcomingPool].slice(0,80);
  } else if(state.timelineMode==='date'){
    list = state.concerts.filter(c=> c.date===state.selectedDate);
  } else if(state.timelineMode==='range'){
    list = state.concerts.filter(c=> c.date>=state.range.start && c.date<=state.range.end);
  } else if(state.range){
    list = state.concerts.filter(c=> c.date>=state.range.start && c.date<=state.range.end);
  } else if(state.selectedDate){
    list = state.concerts.filter(c=> c.date===state.selectedDate);
  } else {
    list = [];
  }
  state.filtered=list;
  const calWrap = document.getElementById('feed-calendar-wrap');
  if(state.timelineMode){
    renderTimeline();
    els.timelineWrap.style.display='';
    if(calWrap) calWrap.style.display='none';
  } else {
    // no timeline: hide timeline, show calendar
    els.timelineWrap.style.display='none';
    if(calWrap) calWrap.style.display='';
    // don't render timeline when hidden to avoid empty group logic
  }
  renderSliders();
}

function openTimeline(type){
  state.timelineMode = type;
  applyFilter();
  history.pushState({timeline:type},'',`#timeline-${type}`);
  // скролл к самому верху таймлайна, а не чуть ниже — без smooth смещения
  requestAnimationFrame(function(){
    const top = els.timelineWrap.getBoundingClientRect().top + window.scrollY - 64; // header height
    window.scrollTo({top: Math.max(0, top), behavior:'auto'});
  });
}

// Sheet
function openSheet(c){
  const slug=c.slug||extractSlug(c.url||'');
  els.sheetContent.innerHTML=`
    ${c.main_image? `<img class="sheet__img" src="${esc(c.main_image)}" alt="">`:''}
    <h3 class="sheet__title">${esc(c.title)}</h3>
    <div class="sheet__meta"><i class="fas fa-calendar"></i> ${esc(fmtDay(parseISO(c.date)))} в ${esc(c.time||'')} · <i class="fas fa-location-dot"></i> ${esc(c.place_name||c.place?.name||'')} ${c.place?.address? '· '+esc(c.place.address):''}</div>
    ${c.tags?.length? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${c.tags.map(t=> `<span class="tag" style="background:#f0f0f0">${esc(t.name)}</span>`).join('')}</div>`:''}
    <p class="sheet__desc">${esc(c.description||'Подробности на permlive.ru')}</p>
    <div style="display:flex;gap:8px;margin-top:6px;color:#a97c00;font-weight:600">${c.price===0? 'Вход свободный' : c.price? `от ${c.price}₽` : ''} ${c.is_paid? '· <span style="color:#e14425">★ Топ</span>':''}</div>
    <div class="sheet__actions">
      <a class="pl-btn" href="https://permlive.ru/event/${esc(slug)}/" target="_blank" rel="noopener"><i class="fas fa-external-link"></i> Открыть на сайте</a>
      <button class="pl-btn pl-btn--secondary" id="sheet-map-btn"><i class="fas fa-map"></i> Показать на карте</button>
    </div>`;
  els.sheet.classList.add('sheet--open');
  els.sheetOverlay.classList.add('sheet-overlay--show');
  $('#sheet-map-btn').onclick=()=>{
    closeSheet();
    switchTab('map');
    if(c.place?.coordinates){ const [lat,lng]=c.place.coordinates.split(',').map(Number); if(state.map && isFinite(lat) && isFinite(lng)) try{ state.map.setCenter([lat,lng],14); }catch(e){ state.map.setView([lat,lng],14); } }
    toast('Событие на карте');
  };
}
function closeSheet(){ els.sheet.classList.remove('sheet--open'); els.sheetOverlay.classList.remove('sheet-overlay--show'); }

// Maps — Yandex only (как на /map/, без Leaflet мока)
let yandexReady=false;

function initMap(){
  if(yandexReady) return;
  if(window.PermLiveMaps && window.PermLiveMaps.loadCore){
    window.PermLiveMaps.loadCore().then(function(){
      yandexReady=true;
      state.map = {
        setCenter: function(){},
        setView: function(){},
        invalidateSize: function(){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }
      };
      ensureMapButtons();
      refreshMapMarkers();
    }).catch(function(e){
      console.warn('Yandex load failed', e);
      showMapError();
    });
    els.mapEl.addEventListener('pl:map-ready', function(){
      yandexReady=true;
      ensureMapButtons();
      refreshMapMarkers();
    });
    setTimeout(function(){ if(!yandexReady){ showMapError(); } }, 5000);
    return;
  }
  showMapError();
}
function ensureMapButtons(){
  setTimeout(function(){
    // left calendar/mode — создать если нет (events-map inline не скопирован в vkminiapp)
    let dateBtn=document.querySelector('.pl-map-date-btn');
    if(!dateBtn){
      dateBtn=document.createElement('button');
      dateBtn.className='pl-map-date-btn';
      dateBtn.innerHTML='<span class="pl-map-date-btn__text">Сегодня</span> <i class="fa-solid fa-calendar" style="font-size:11px"></i>';
      dateBtn.onclick=openCalendar;
      els.mapEl.appendChild(dateBtn);
    }
    dateBtn.style.display='inline-flex';
    dateBtn.style.visibility='visible';
    if(!dateBtn.onclick) dateBtn.onclick=openCalendar;
    let modeBtn=document.querySelector('.pl-map-mode-btn');
    if(!modeBtn){
      modeBtn=document.createElement('button');
      modeBtn.className='pl-map-date-btn pl-map-mode-btn';
      modeBtn.style.top='56px';
      modeBtn.innerHTML='<span>Все концерты</span> <i class="fa-solid fa-chevron-down" style="font-size:10px"></i>';
      els.mapEl.appendChild(modeBtn);
      const dd=document.createElement('div');
      dd.className='pl-map-mode-dropdown';
      dd.innerHTML='<button class="pl-map-mode-dropdown__opt pl-map-mode-dropdown__opt--active" data-mode="all">Все концерты</button><button class="pl-map-mode-dropdown__opt" data-mode="free">Бесплатные</button>';
      els.mapEl.appendChild(dd);
      modeBtn.onclick=function(){ dd.classList.toggle('pl-map-mode-dropdown--open'); };
      dd.querySelectorAll('.pl-map-mode-dropdown__opt').forEach(function(b){
        b.onclick=function(){
          state.mapMode=b.dataset.mode;
          dd.querySelectorAll('.pl-map-mode-dropdown__opt').forEach(function(x){ x.classList.toggle('pl-map-mode-dropdown__opt--active', x===b); });
          dd.classList.remove('pl-map-mode-dropdown--open');
          modeBtn.querySelector('span').textContent=b.textContent;
          refreshMapMarkers();
        };
      });
    }
    modeBtn.style.display='inline-flex';
    modeBtn.style.visibility='visible';
    // right controls — один рабочий fullscreen, первым (верхняя работает, нижнюю лишнюю убрали)
    let controls=document.querySelector('.pl-map-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='pl-map-controls';
      els.mapEl.appendChild(controls);
    }
    document.querySelectorAll('.pl-map-fullscreen-btn').forEach(function(b){ b.remove(); });
    const fsBtn=document.createElement('button');
    fsBtn.className='pl-map-control-btn pl-map-fullscreen-btn';
    fsBtn.title='На весь экран';
    fsBtn.innerHTML='<i class="fa-solid fa-expand"></i>';
    fsBtn.onclick=function(){
      const wrap=document.getElementById('view-map');
      const isFs=wrap.classList.toggle('is-fullscreen');
      fsBtn.innerHTML=isFs?'<i class="fa-solid fa-compress"></i>':'<i class="fa-solid fa-expand"></i>';
      try{ window.dispatchEvent(new Event('resize')); }catch(e){}
      setTimeout(function(){ try{ window.dispatchEvent(new Event('resize')); }catch(e){} }, 300);
    };
    controls.prepend(fsBtn);
  }, 300);
  // повтор через 1с на случай позднего создания events-map контролов + убрать лишний fullscreen
  setTimeout(function(){
    const d=document.querySelector('.pl-map-date-btn');
    const m=document.querySelector('.pl-map-mode-btn');
    if(d) d.style.display='inline-flex';
    if(m) m.style.display='inline-flex';
    document.querySelectorAll('.pl-map-fullscreen-btn').forEach(function(b,i){ if(i>0) b.remove(); });
  }, 1200);
}
function showMapError(){
  if(els.mapEl && !els.mapEl.querySelector('.map-error')){
    const err=document.createElement('div');
    err.className='map-error';
    err.style.cssText='padding:40px 20px;text-align:center;color:#999';
    err.innerHTML='<p>Карта Яндекс не загрузилась.<br>Проверьте ключ и Referer для github.io в кабинете Яндекс.</p>';
    els.mapEl.appendChild(err);
  }
}

let controlsAdded=false;
function addCommonControls(){
  if(controlsAdded) return; controlsAdded=true;
  const dateText = state.selectedDate ? fmtHeaderDate(parseISO(state.selectedDate)) : 'Сегодня';
  const dateBtn=document.createElement('button'); dateBtn.className='pl-map-date-btn map-date-btn'; dateBtn.innerHTML=`<span class="pl-map-date-btn__text">${esc(dateText)}</span> <i class="fa-solid fa-calendar" style="font-size:11px"></i>`;
  dateBtn.onclick=openCalendar;
  els.mapEl.appendChild(dateBtn);
  const modeBtn=document.createElement('button'); modeBtn.className='pl-map-date-btn map-mode-btn'; modeBtn.style.top='56px'; modeBtn.innerHTML='<span>Все концерты</span> <i class="fas fa-chevron-down" style="font-size:10px"></i>';
  els.mapEl.appendChild(modeBtn);
  const dropdown=document.createElement('div'); dropdown.className='map-dropdown'; dropdown.innerHTML=`<button class="map-dropdown__opt map-dropdown__opt--active" data-mode="all">Все концерты</button><button class="map-dropdown__opt" data-mode="free">Бесплатные</button><button class="map-dropdown__opt" data-mode="paid">Топ</button>`;
  els.mapEl.appendChild(dropdown);
  modeBtn.onclick=()=> dropdown.classList.toggle('map-dropdown--open');
  dropdown.querySelectorAll('.map-dropdown__opt').forEach(b=>{
    b.onclick=()=>{
      state.mapMode=b.dataset.mode;
      dropdown.querySelectorAll('.map-dropdown__opt').forEach(x=>x.classList.toggle('map-dropdown__opt--active', x===b));
      dropdown.classList.remove('map-dropdown--open');
      modeBtn.querySelector('span').textContent=b.textContent;
      refreshMapMarkers();
    };
  });
}

function updateMapFiltersBlack(){
  const dBtn=document.querySelector('.pl-map-date-btn');
  const mBtn=document.querySelector('.pl-map-mode-btn');
  const isDateFiltered = !!state.selectedDate || !!state.range;
  const isModeFiltered = state.mapMode!=='all';
  if(dBtn) dBtn.classList.toggle('pl-map-date-btn--filtered', isDateFiltered);
  if(mBtn) mBtn.classList.toggle('pl-map-mode-btn--filtered', isModeFiltered);
}
function refreshMapMarkers(){
  updateMapFiltersBlack();
  // Yandex - site logic via PermLiveMaps.setEvents (как на /map/ - без мока Leaflet)
  let listY=[];
  if(state.range) listY=state.concerts.filter(c=> c.date>=state.range.start && c.date<=state.range.end);
  else if(state.selectedDate) listY=state.concerts.filter(c=> c.date===state.selectedDate);
  else listY=state.concerts.filter(c=> c.date===state.todayISO);
  if(state.mapMode==='free') listY=listY.filter(c=> c.price===0);
  if(state.mapMode==='paid') listY=listY.filter(c=> c.is_paid);
  if(window.PermLiveMaps && typeof window.PermLiveMaps.setEvents==='function'){
    try{
      const evts=listY.map(c=>{
        const coords=c.place?.coordinates||'';
        const [latStr,lngStr]=coords.split(','); const lat=parseFloat(latStr), lng=parseFloat(lngStr);
        return {
          id:c.id, title:c.title, url:'https://permlive.ru/event/'+(c.slug||'')+'/',
          date:c.date, time:c.time||'', price:c.price||0, paid:!!c.is_paid, rating:parseFloat(c.cached_rating||3),
          place:c.place_name||c.place?.name||'', address:c.place?.address||'',
          coordinates:[isFinite(lng)?lng:56.25, isFinite(lat)?lat:58.01],
          image:c.main_image||'', tags:(c.tags||[]).map(t=>({name:t.name, type:t.type||'other'})), is_liked:false, is_foryou:false
        };
      }).filter(e=>e.coordinates[0] && e.coordinates[1]);
      window.PermLiveMapData = window.PermLiveMapData||{};
      window.PermLiveMapData.events=evts;
      window.PermLiveMapData.today=state.todayISO;
      window.PermLiveMapData.defaultDate=state.selectedDate||state.todayISO;
      window.PermLiveMapData.emotionDate=state.todayISO;
      window.__PermLiveMapCurrentDate = state.selectedDate||state.todayISO;
      if(yandexReady) window.PermLiveMaps.setEvents(evts, {recenter:true});
      else {
        // if map not ready yet, store for later
        window.PermLiveMapData.events=evts;
      }
      const mapDateBtn=document.querySelector('.pl-map-date-btn__text');
      if(mapDateBtn){
        const txt = state.selectedDate ? fmtHeaderDate(parseISO(state.selectedDate)) : 'Сегодня';
        mapDateBtn.textContent=txt;
      }
      return;
    }catch(e){ console.warn('PermLiveMaps setEvents failed', e); }
  }
  // Yandex not ready yet — will retry on pl:map-ready
}

async function loadMapForDate(iso){
  const j=await fetchJSON(`${API_BASE}/map/events/?date=${iso}`);
  if(j && Array.isArray(j.events)){
    const other=state.concerts.filter(c=>c.date!==iso);
    const incoming=j.events.map(normalizeApiEvent).filter(c=>c.slug);
    // dedup
    const seen=new Set(state.concerts.map(c=>c.slug));
    const add = incoming.filter(c=>!seen.has(c.slug));
    state.concerts = [...state.concerts, ...add].sort((a,b)=> a.date.localeCompare(b.date));
    state.datesWithEvents.add(iso);
    applyFilter();
    refreshMapMarkers();
  }else{
    refreshMapMarkers();
  }
}

function switchTab(tab){
  state.tab=tab;
  // prevent site's events-map.js fullscreen lock
  document.body.classList.remove('map-fullscreen','pl-map-fs');
  document.documentElement.style.removeProperty('height');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('height');
  const calWrap=document.getElementById('feed-calendar-wrap');
  if(calWrap) calWrap.style.removeProperty('display');
  els.tabBtns.forEach(b=>{ const active=b.dataset.tab===tab; b.classList.toggle('pl-tabbar__btn--active', active); b.setAttribute('aria-selected', String(active)); });
  els.viewFeed.classList.toggle('view--active', tab==='feed');
  els.viewMap.classList.toggle('view--active', tab==='map');
  if(tab==='map'){
    initMap();
    setTimeout(()=> { try{ state.map && state.map.invalidateSize && state.map.invalidateSize(); }catch(e){} }, 80);
    refreshMapMarkers();
    try{ bridge && bridge.send('VKWebAppSetViewSettings',{status_bar_style:'light', action_bar_color:'#ffffff'});}catch(e){}
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

function wire(){
  els.tabBtns.forEach(b=> b.addEventListener('click',()=> switchTab(b.dataset.tab)));
  els.calOverlay.addEventListener('click', closeCalendar);
  els.sheetOverlay.addEventListener('click', closeSheet);
  $('.sheet__close')?.addEventListener('click', closeSheet);
  $('#btn-show-all').addEventListener('click',clearDateFilter);
  els.searchInput.addEventListener('input', e=>{
    state.query=e.target.value;
    if(state.query.trim()) state.timelineMode='search';
    else if(state.timelineMode==='search') state.timelineMode=null;
    applyFilter();
  });
  els.calendarInner.addEventListener('dblclick', openCalendar);
  let startX=0;
  document.addEventListener('touchstart', e=> startX=e.touches[0].clientX,{passive:true});
  document.addEventListener('touchend', e=>{
    const dx=e.changedTouches[0].clientX - startX;
    if(Math.abs(dx)>80){
      if(dx<0 && state.tab==='feed') switchTab('map');
      else if(dx>0 && state.tab==='map') switchTab('feed');
    }
  },{passive:true});
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeSheet(); closeCalendar(); }});
  window.addEventListener('popstate', e=>{
    if(e.state && e.state.timeline) openTimeline(e.state.timeline);
  });
}

(async function boot(){
  wire();
  renderCalendarStrip();
  await loadData();
  renderCalendarStrip();
  applyFilter();
  const params=new URLSearchParams(location.search);
  const tab=params.get('tab')||params.get('vk_tab');
  if(tab==='map') switchTab('map');
  try{ await bridge.send('VKWebAppGetLaunchParams'); }catch(e){}
})();
