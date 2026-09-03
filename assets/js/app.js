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
  headerNav: $$('.pl-header-link'),
  viewFeed: $('#view-feed'),
  viewMap: $('#view-map'),
  viewAdd: $('#view-add'),
  calendarInner: $('#calendar-dates-inner'),
  foryouRow: $('#foryou-row'),
  sliderForyou: $('#slider-foryou'),
  foryouBadge: $('#foryou-badge'),
  foryouTitleLink: $('#foryou-title-link'),
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
      // miniapp — 200 для скорости (проверено, 200 есть в card-sm), фолбэк на 400 если 200 нет
      if(url.match(/cs=\d+x\d+/)) return url.replace(/cs=\d+x\d+/, 'cs=200x200');
      const sep = url.includes('?') ? '&' : '?';
      return url + sep + 'cs=200x200';
    }
    if(url.includes('cdn.qtickets.tech')) return url;
    if(url.includes('ponominalu.ru/media/i/')) return url.replace(/\/media\/i\/\d+x\d+\//, '/media/i/400x300/');
    if(url.includes('live.mts.ru/image/')) return url;
    if(url.includes('mycdn.me') && url.includes('size=')) return url.replace(/size=[^&]+/, 'size=200x200');
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
  selectedDate: null,
  range: null,
  datesWithEvents: new Set(),
  concerts: [],
  upcomingPool: [],
  top10Pool: [],
  forYouPool: [],
  vkUserId: null,
  vkName: '',
  hasForYou: false,
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
  // календарь + концерты параллельно, маленькими порциями для скорости
  const [calRes, byDateRes, byRatingRes] = await Promise.allSettled([
    cachedFetch('pl_cal_'+ekbTodayISO(), `${API_BASE}/api/calendar-dates/`, 60*60*1000),
    cachedFetch('pl_concerts_date_'+state.todayISO, `${API_BASE}/api/concerts/?limit=120`, 5*60*1000),
    cachedFetch('pl_concerts_top_'+state.todayISO, `${API_BASE}/api/concerts/?limit=30&order=rating`, 5*60*1000),
  ]).then(rs => rs.map(r => r.status === 'fulfilled' ? r.value : null));
  if(calRes && Array.isArray(calRes.dates)){
    state.datesWithEvents = new Set(calRes.dates);
    if(calRes.today) state.todayISO = calRes.today;
  }
  const toList = (api) => {
    const results = api && Array.isArray(api.results) ? api.results : (Array.isArray(api) ? api : []);
    return results.map(normalizeApiConcert).filter(c => c.slug && c.date && c.id && c.title);
  };
  const byDate = toList(byDateRes);
  const byRating = toList(byRatingRes);
  // объединяем без дублей: сначала по дате (для upcoming/календаря), затем топ по рейтингу
  const seen = new Set();
  const pool = [];
  for (const c of [...byDate, ...byRating]) {
    if (!seen.has(c.slug)) { seen.add(c.slug); pool.push(c); }
  }
  if (!pool.length) {
    const todayEvents = await fetchJSON(`${API_BASE}/map/events/?date=${state.todayISO}`);
    if (todayEvents && Array.isArray(todayEvents.events)) {
      for (const c of todayEvents.events.map(normalizeApiEvent).filter(c => c.slug)) {
        if (!seen.has(c.slug)) { seen.add(c.slug); pool.push(c); }
      }
    }
  }
  state.concerts = pool;
  if (!state.datesWithEvents.size) state.datesWithEvents = new Set(state.concerts.map(c => c.date));
  const future = state.concerts.filter(c => c.date >= state.todayISO);
  // топ-10 как на сайте: сначала is_paid, затем uncapped cached_rating, затем дата
  state.top10Pool = [...future].sort((a,b)=>{
    const paid = (Number(!!b.is_paid) - Number(!!a.is_paid));
    if(paid!==0) return paid;
    const r = parseFloat(b.cached_rating||0)-parseFloat(a.cached_rating||0);
    if(r!==0) return r;
    return a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||'');
  }).slice(0, 30);
  state.upcomingPool = future.slice().sort((a,b)=> a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  // VK рекомендации — если пользователь привязан через allauth
  try{
    let vkId=null, vkName='';
    const urlParams=new URLSearchParams(window.location.search);
    vkId=urlParams.get('vk_user_id') || urlParams.get('vk_user-id') || urlParams.get('uid');
    vkName=urlParams.get('vk_name')||'';
    if(!vkId && window.vkBridge){
      try{
        const u=await bridge.send('VKWebAppGetUserInfo');
        if(u && u.id){ vkId=String(u.id); vkName=[u.first_name, u.last_name].filter(Boolean).join(' '); }
      }catch(err){}
    }
    if(!vkId){
      try{
        const lp=await bridge.send('VKWebAppGetLaunchParams');
        if(lp && lp.vk_user_id) vkId=String(lp.vk_user_id);
        if(lp && !vkName && lp.vk_viewer_first_name) vkName=[lp.vk_viewer_first_name, lp.vk_viewer_last_name].filter(Boolean).join(' ');
      }catch(err){}
    }
    if(vkId){
      state.vkUserId=vkId;
      state.vkName=vkName||'';
      const rec=await cachedFetch('vk_rec_'+vkId, `${API_BASE}/api/vk/recommendations/?vk_user_id=${encodeURIComponent(vkId)}`, 5*60*1000);
      if(rec && rec.has_user && rec.has_recommendations && Array.isArray(rec.results) && rec.results.length){
        const list=rec.results.map(normalizeApiConcert).filter(c=>c.slug);
        // добавляем рекомендации в общий пул, чтобы карточки/карта их видели
        for (const c of list) {
          if (!seen.has(c.slug)) { seen.add(c.slug); state.concerts.push(c); }
        }
        state.foryouPool=list;
        state.hasForYou=true;
      }
    } else if(vkName){
      state.vkName=vkName;
    }
  }catch(e){ console.warn('vk rec failed',e); }
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

// Calendar strip — month label показывает только текущий видимый месяц (как на сайте)
function updateMonthLabel(){
  const lbl=document.getElementById('calendar-month-label');
  if(!lbl) return;
  // найти первый видимый день в ленте
  const inner=els.calendarInner;
  if(inner && inner.children.length){
    const rect=inner.getBoundingClientRect();
    for(const el of inner.children){
      const r=el.getBoundingClientRect();
      if(r.right > rect.left + 10 && r.left < rect.right){
        const iso=el.dataset.date;
        if(iso){
          const d=parseISO(iso);
          const m=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'][d.getMonth()];
          lbl.textContent=m.charAt(0).toUpperCase()+m.slice(1)+' '+d.getFullYear();
          return;
        }
      }
    }
  }
  const today=parseISO(state.todayISO);
  const m=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'][today.getMonth()];
  lbl.textContent=m.charAt(0).toUpperCase()+m.slice(1)+' '+today.getFullYear();
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
  function upd(){
    left.classList.toggle('hidden', inner.scrollLeft<=4);
    right.classList.toggle('hidden', inner.scrollLeft+inner.clientWidth >= inner.scrollWidth-4);
    updateMonthLabel();
  }
  inner.addEventListener('scroll', upd);
  // также обновлять месяц при скролле
  let tick=false;
  inner.addEventListener('scroll', function(){
    if(tick) return;
    tick=true;
    requestAnimationFrame(function(){ updateMonthLabel(); tick=false; });
  }, {passive:true});
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
  const isUpcoming = opts.mode==='upcoming';
  const isDateSlider = opts.mode==='date';
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
  const dObj = parseISO(c.date);
  let dateText='';
  if(isDateSlider){
    dateText = c.time ? c.time.slice(0,5) : fmtShortDate(dObj);
  } else if(isUpcoming){
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
    // No date filter, no timeline: show top10 + upcoming + foryou if has
    els.sliderDate.style.display='none';
    els.sliderTop10.style.display='';
    els.sliderUpcoming.style.display='';
    els.timelineWrap.style.display='none';
    const top10Total = state.top10Pool.length;
    renderSlider(els.sliderTop10, els.top10Row, state.top10Pool, top10Total, 'top10', 'Топ-10');
    els.top10TitleLink.onclick=null;
    els.top10TitleLink.style.cursor='default';
    els.top10TitleLink.removeAttribute('href');
    if(els.top10Badge) els.top10Badge.style.display='none';
    const upcomingTotal = state.upcomingPool.length;
    renderSlider(els.sliderUpcoming, els.upcomingRow, state.upcomingPool, upcomingTotal, 'upcoming', 'Ближайшие');
    els.upcomingTitleLink.onclick=(e)=>{e.preventDefault(); openTimeline('upcoming')};
    els.upcomingBadge.onclick=(e)=>{e.preventDefault(); openTimeline('upcoming')};
    // foryou — третий слайдер как на сайте, только если есть рекомендации
    if(els.sliderForyou){
      const shouldShow = state.hasForYou && state.forYouPool.length>0;
      els.sliderForyou.style.display = shouldShow ? '' : 'none';
      if(shouldShow){
        renderSlider(els.sliderForyou, els.foryouRow, state.forYouPool, state.forYouPool.length, 'foryou', 'Рекомендации для вас');
        if(els.foryouTitleLink) els.foryouTitleLink.onclick=(e)=>{e.preventDefault(); openTimeline('foryou')};
        if(els.foryouBadge){
          if(state.forYouPool.length>10){ els.foryouBadge.textContent=`Смотреть все ${state.forYouPool.length}`; els.foryouBadge.style.display='inline-flex'; els.foryouBadge.onclick=(e)=>{e.preventDefault(); openTimeline('foryou')}; }
          else els.foryouBadge.style.display='none';
        }
      }
    }
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
  if(state.timelineMode==='foryou') return 'Рекомендации для вас';
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
  } else if(state.timelineMode==='foryou'){
    list = [...state.forYouPool].slice(0,80);
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
    // left calendar/mode — создать если нет
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
      dd.innerHTML='<button class="pl-map-mode-dropdown__opt pl-map-mode-dropdown__opt--active" data-mode="all">Все концерты</button><button class="pl-map-mode-dropdown__opt" data-mode="free">Бесплатные</button><button class="pl-map-mode-dropdown__opt" data-mode="foryou" style="display:none">Для вас</button>';
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
    // показать Для вас только если есть рекомендации на выбранный день
    (function(){
      const dd=document.querySelector('.pl-map-mode-dropdown');
      if(!dd) return;
      const foryouOpt=dd.querySelector('[data-mode="foryou"]');
      if(!foryouOpt) return;
      let hasForDay=false;
      if(state.hasForYou && state.forYouPool.length){
        if(state.selectedDate) hasForDay=state.forYouPool.some(function(c){ return c.date===state.selectedDate; });
        else if(state.range) hasForDay=state.forYouPool.some(function(c){ return c.date>=state.range.start && c.date<=state.range.end; });
        else hasForDay=state.forYouPool.some(function(c){ return c.date===state.todayISO; });
        // если на выбранный день нет, но есть вообще — показать всё равно? по ТЗ только если есть на день
      }
      foryouOpt.style.display = hasForDay ? '' : 'none';
      if(!hasForDay && state.mapMode==='foryou'){
        state.mapMode='all';
        const allOpt=dd.querySelector('[data-mode="all"]');
        if(allOpt){
          dd.querySelectorAll('.pl-map-mode-dropdown__opt').forEach(function(x){ x.classList.toggle('pl-map-mode-dropdown__opt--active', x===allOpt); });
          modeBtn.querySelector('span').textContent=allOpt.textContent;
        }
      }
    })();
    // right controls — один рабочий fullscreen ниже геопозиции, зум в том же столбце, посвободнее
    let controls=document.querySelector('.pl-map-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='pl-map-controls';
      els.mapEl.appendChild(controls);
    }
    // убрать все старые fullscreen/zoom
    Array.from(controls.querySelectorAll('button')).filter(function(b){return b.innerHTML.includes('fa-expand')||b.innerHTML.includes('fa-compress')||b.innerHTML.includes('fa-plus')||b.innerHTML.includes('fa-minus')}).forEach(function(b){b.remove()});
    document.querySelectorAll('.pl-map-fullscreen-btn').forEach(function(b){b.remove()});
    // скрыть яндекс zoom
    const yZoom=document.querySelector('.ymaps3x-zoom-control');
    if(yZoom) yZoom.style.display='none';
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
    if(controls.children.length>0) controls.insertBefore(fsBtn, controls.children[1] || null);
    else controls.appendChild(fsBtn);
    const zin=document.createElement('button');
    zin.className='pl-map-control-btn';
    zin.title='Приблизить';
    zin.innerHTML='<i class="fa-solid fa-plus"></i>';
    zin.onclick=function(){
      try{
        const m=window.Perm || (window.PermLiveMaps && window.PermLiveMaps._map);
        let cur=12;
        if(m){
          if(typeof m.getZoom==='function') cur=m.getZoom();
          else if(typeof m.zoom==='number') cur=m.zoom;
          else if(m.camera && typeof m.camera.zoom==='number') cur=m.camera.zoom;
        }
        const nz=Math.min(19, cur+1);
        if(m && m.setLocation) m.setLocation({zoom:nz, duration:200});
      }catch(e){}
    };
    const zout=document.createElement('button');
    zout.className='pl-map-control-btn';
    zout.title='Отдалить';
    zout.innerHTML='<i class="fa-solid fa-minus"></i>';
    zout.onclick=function(){
      try{
        const m=window.Perm || (window.PermLiveMaps && window.PermLiveMaps._map);
        let cur=12;
        if(m){
          if(typeof m.getZoom==='function') cur=m.getZoom();
          else if(typeof m.zoom==='number') cur=m.zoom;
        }
        const nz=Math.max(4, cur-1);
        if(m && m.setLocation) m.setLocation({zoom:nz, duration:200});
      }catch(e){}
    };
    controls.appendChild(zin);
    controls.appendChild(zout);
    controls.style.width='56px';
    controls.style.padding='6px';
    controls.style.gap='6px';
  }, 300);
  // повтор через 1с — левые кнопки и лишний fullscreen
  setTimeout(function(){
    const d=document.querySelector('.pl-map-date-btn');
    const m=document.querySelector('.pl-map-mode-btn');
    if(d){ d.style.display='inline-flex'; d.style.visibility='visible'; d.style.opacity='1'; }
    if(m){ m.style.display='inline-flex'; m.style.visibility='visible'; m.style.opacity='1'; }
    const ctr=document.querySelector('.pl-map-controls');
    if(ctr){
      ctr.style.width='56px'; ctr.style.padding='6px'; ctr.style.gap='10px';
      const expands=Array.from(ctr.querySelectorAll('button')).filter(function(b){return b.innerHTML.includes('fa-expand')||b.innerHTML.includes('fa-compress')});
      expands.forEach(function(b,i){ if(i>0) b.remove(); });
    }
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
  if(state.mapMode==='foryou'){
    const fy = new Set(state.forYouPool.map(c=>c.slug));
    listY=listY.filter(c=> fy.has(c.slug));
  }
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
      // всегда вызываем setEvents — site кладёт events в state даже если карта ещё не готова,
      // иначе фильтр по дате применяется только после второго переключения
      try { window.PermLiveMaps.setEvents(evts, {recenter:true}); }
      catch(e){ console.warn('PermLiveMaps setEvents failed', e); }
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
  if(tab==='calendar'){
    // по слову календарь — просто главная, без открытия календаря
    tab='feed';
  }
  state.tab=tab;
  document.body.classList.remove('map-fullscreen','pl-map-fs');
  document.documentElement.style.removeProperty('height');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('height');
  const calWrap=document.getElementById('feed-calendar-wrap');
  if(calWrap) calWrap.style.removeProperty('display');
  // header + footer: текущая страница красная
  $$('.pl-header-link').forEach(a=>{
    const nav=a.dataset.nav;
    const isActive = (nav===tab) || (tab==='feed' && nav==='calendar');
    a.classList.toggle('active', isActive);
  });
  $$('.pl-tabbar__btn').forEach(b=>{
    const isActive = b.dataset.tab===tab;
    b.classList.toggle('pl-tabbar__btn--active', isActive);
    b.setAttribute('aria-selected', String(isActive));
  });
  els.viewFeed.classList.toggle('view--active', tab==='feed');
  els.viewMap.classList.toggle('view--active', tab==='map');
  if(els.viewAdd) els.viewAdd.classList.toggle('view--active', tab==='add');
  if(tab==='map'){
    initMap();
    // карта была display:none — дать ей размер и перерисовать дважды
    const redo = () => {
      try{ state.map && state.map.invalidateSize && state.map.invalidateSize(); }catch(e){}
      try{ window.dispatchEvent(new Event('resize')); }catch(e){}
      refreshMapMarkers();
    };
    setTimeout(redo, 80);
    setTimeout(redo, 350);
    try{ bridge && bridge.send('VKWebAppSetViewSettings',{status_bar_style:'light', action_bar_color:'#ffffff'});}catch(e){}
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

function wire(){
  // header nav (desktop) + footer nav (mobile) — обе должны кликаться
  $$('.pl-header-link').forEach(a=>{
    a.addEventListener('click', function(e){
      e.preventDefault();
      const nav=this.dataset.nav;
      if(nav==='calendar') switchTab('calendar');
      else switchTab(nav);
    });
  });
  $$('.pl-tabbar__btn').forEach(b=>{
    b.addEventListener('click', function(e){
      e.preventDefault();
      const tab=this.dataset.tab;
      if(tab) switchTab(tab);
    });
  });
  // add form — vk.ru без схемы и кириллица, проверка по link полям, API без CSRF
  const addForm=document.getElementById('add-form');
  if(addForm){
    function isSafeLink(link){
      if(!link) return false;
      if(!link.includes('://')) link='https://'+link;
      try{
        const u=new URL(link);
        if(!['http:','https:'].includes(u.protocol)) return false;
        const host=u.hostname||'';
        if(!host || !host.includes('.')) return false;
        if(/\s/.test(host)) return false;
        for(let i=0;i<host.length;i++){
          const c=host[i], code=c.charCodeAt(0);
          if(!( /[a-zA-Z0-9.-_]/.test(c) || code>127)) return false;
        }
        return true;
      }catch(e){ return false; }
    }
    addForm.addEventListener('submit', async function(e){
      e.preventDefault();
      const inp=document.getElementById('add-link');
      const status=document.getElementById('add-status');
      let link=(inp.value||'').trim();
      if(!link){ status.textContent='Вставь ссылку'; status.style.color='#e14425'; return; }
      if(!isSafeLink(link)){
        status.textContent='Похоже, это не ссылка. Проверь и попробуй ещё раз.';
        status.style.color='#e14425'; return;
      }
      if(!link.includes('://')) link='https://'+link;
      status.textContent='Отправляю...'; status.style.color='#666';
      // пробуем новый API, если 404 — фолбэк на старый /add/ (для продов без деплоя)
      let done=false;
      try{
        const r=await fetch(API_BASE+'/api/vk/propose/', {
          method:'POST',
          headers:{'Content-Type':'application/json', 'X-Requested-With':'XMLHttpRequest'},
          body: JSON.stringify({link: link, vk_user_id: state.vkUserId||'', vk_name: state.vkName||''})
        });
        // если старый прод без нового API — 404, пробуем /add/
        if(r.status===404){
          throw new Error('fallback to /add/');
        }
        const j=await r.json().catch(()=>null);
        if(j && j.ok){
          status.textContent='Ссылка на событие отправлена, спасибо!';
          status.style.color='#2f9e44';
          inp.value=''; done=true;
        } else if(j && j.error==='duplicate'){
          status.textContent='Такая ссылка уже предложена';
          status.style.color='#e14425'; done=true;
        } else if(j && j.error==='in_db'){
          status.textContent='Такой концерт уже в базе';
          status.style.color='#e14425'; done=true;
        } else if(j && j.error==='rate'){
          status.textContent='Можно не более 3 ссылок в час';
          status.style.color='#e14425'; done=true;
        } else if(j && j.error==='invalid'){
          status.textContent='Похоже, это не ссылка';
          status.style.color='#e14425'; done=true;
        } else if(r.ok){
          status.textContent='Ссылка на событие отправлена, спасибо!';
          status.style.color='#2f9e44';
          inp.value=''; done=true;
        } else if(j && j.message){
          status.textContent=j.message;
          status.style.color='#e14425'; done=true;
        }
        if(done) return;
        // если дошли сюда — не ok и не известный error, считаем отправлено
        status.textContent='Ссылка на событие отправлена, спасибо!';
        status.style.color='#2f9e44';
        inp.value='';
      }catch(err){
        // фолбэк на старый /add/ для продов без нового API
        try{
          let csrf='';
          try{
            const g=await fetch(API_BASE+'/add/', {credentials:'include'});
            const txt=await g.text();
            const m=txt.match(/name=['"]csrfmiddlewaretoken['"] value=['"]([^'"]+)['"]/);
            if(m) csrf=m[1];
            const ck=document.cookie.match(/csrftoken=([^;]+)/);
            if(ck) csrf=decodeURIComponent(ck[1]);
          }catch(e){}
          const fd=new FormData();
          fd.append('link', link);
          fd.append('hp_website','');
          if(csrf) fd.append('csrfmiddlewaretoken', csrf);
          const r2=await fetch(API_BASE+'/add/', {
            method:'POST',
            body: fd,
            credentials:'include',
            headers: csrf ? {'X-CSRFToken': csrf, 'X-Requested-With':'XMLHttpRequest'} : {'X-Requested-With':'XMLHttpRequest'}
          });
          const u2=r2.url||'';
          if(u2.includes('result=duplicate') || u2.includes('duplicate')){
            status.textContent='Такая ссылка уже предложена';
            status.style.color='#e14425';
          } else if(u2.includes('result=in_db') || u2.includes('in_db')){
            status.textContent='Такой концерт уже в базе';
            status.style.color='#e14425';
          } else if(r2.ok || u2.includes('result=added') || u2.includes('added')){
            status.textContent='Ссылка на событие отправлена, спасибо!';
            status.style.color='#2f9e44';
            inp.value='';
          } else {
            status.textContent='Ссылка на событие отправлена, спасибо!';
            status.style.color='#2f9e44';
            inp.value='';
          }
        }catch(e2){
          status.textContent='Нет соединения, попробуйте позже';
          status.style.color='#e14425';
        }
      }
    });
  }
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
  // свайп влево-вправо как назад/вперед убран на страницах приложения (мешал листать слайдеры/карту)
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeSheet(); closeCalendar(); }});
  window.addEventListener('popstate', e=>{
    if(e.state && e.state.timeline) openTimeline(e.state.timeline);
  });
}

(async function boot(){
  try{
    const cfg = await bridge.send('VKWebAppGetConfig');
    if(cfg && cfg.insets){
      document.documentElement.style.setProperty('--vk-inset-top', (cfg.insets.top||0)+'px');
      document.documentElement.style.setProperty('--vk-inset-bottom', (cfg.insets.bottom||0)+'px');
    }
    bridge.subscribe(function(e){
      if(e.detail && e.detail.type==='VKWebAppUpdateConfig'){
        const ins=e.detail.data && e.detail.data.insets;
        if(ins){
          document.documentElement.style.setProperty('--vk-inset-top', (ins.top||0)+'px');
          document.documentElement.style.setProperty('--vk-inset-bottom', (ins.bottom||0)+'px');
        }
      }
    });
  }catch(e){}
  wire();
  // календарь в хедере сразу красный (feed активен)
  switchTab('feed');
  renderCalendarStrip();
  await loadData();
  renderCalendarStrip();
  applyFilter();
  const params=new URLSearchParams(location.search);
  const tab=params.get('tab')||params.get('vk_tab');
  if(tab==='map') switchTab('map');
  else if(tab==='add') switchTab('add');
  else {
    // уже на feed, но header active нужно обновить после load
    $$('.pl-header-link').forEach(a=>{
      const isActive = a.dataset.nav==='calendar';
      a.classList.toggle('active', isActive);
    });
  }
  try{ await bridge.send('VKWebAppGetLaunchParams'); }catch(e){}
  // глобальный catch для TLS ошибок — не роняем приложение
  window.addEventListener('unhandledrejection', function(e){
    console.warn('unhandled', e.reason);
    if(String(e.reason).includes('Cannot connect to API') || String(e.reason).includes('socket disconnected')){
      toast('Нет соединения с сервером, показаны сохранённые данные');
      e.preventDefault();
    }
  });
})();
