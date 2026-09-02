/* Permlive VK Mini App — app.js */
const API_BASE = 'https://permlive.ru';
const MOCK_ENABLED = true;

const bridge = window.vkBridge;

// Init VK Bridge
try{
  bridge && bridge.send('VKWebAppInit');
  bridge && bridge.subscribe(e=>{/* keep */});
}catch(e){}

const $ = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];

const els = {
  tabBtns: $$('.pl-tabbar__btn'),
  viewFeed: $('#view-feed'),
  viewMap: $('#view-map'),
  calendarInner: $('#calendar-dates-inner'),
  calendarWrap: $('#feed-calendar'),
  dateBtn: $('#feed-date-btn'),
  calOverlay: $('#cal-overlay'),
  calModal: $('#cal-modal'),
  top10Row: $('#top10-row'),
  upcomingRow: $('#upcoming-row'),
  popularRow: $('#popular-row'),
  sliderTop10: $('#slider-top10'),
  sliderUpcoming: $('#slider-upcoming'),
  sliderPopular: $('#slider-popular'),
  upcomingBadge: $('#upcoming-badge'),
  timeline: $('#concert-container'),
  timelineEmpty: $('#timeline-empty'),
  searchInput: $('#search-input'),
  toast: $('#toast'),
  sheet: $('#event-sheet'),
  sheetOverlay: $('#event-sheet-overlay'),
  sheetContent: $('#sheet-content'),
  mapEl: $('#map'),
};

const state = {
  tab: 'feed',
  selectedDate: toISO(new Date()),
  datesWithEvents: new Set(),
  concerts: [],
  filtered: [],
  query: '',
  map: null,
  mapMarkers: [],
  mapMode: 'all', // all | free | foryou
  todayISO: toISO(new Date()),
};

function toISO(d){ return d.toISOString().slice(0,10); }
function parseISO(s){ const [y,m,day]=s.split('-').map(Number); return new Date(y,m-1,day); }
function fmtDay(d){ const m=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']; return `${d.getDate()} ${m[d.getMonth()]}`; }
function fmtWeekday(d){ const w=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']; return w[d.getDay()]; }
function fmtHeaderDate(d){ const today=parseISO(state.todayISO); if(toISO(d)===state.todayISO) return 'Сегодня'; const tmr=new Date(today); tmr.setDate(today.getDate()+1); if(toISO(d)===toISO(tmr)) return 'Завтра'; return `${fmtWeekday(d)}, ${fmtDay(d)}`; }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function toast(msg){
  els.toast.textContent=msg;
  els.toast.classList.add('pl-toast--show');
  setTimeout(()=>els.toast.classList.remove('pl-toast--show'),2200);
}

// Mock generator
function mockConcerts(n=40){
  const places=[
    {name:'Дом культуры',slug:'dk',coords:'58.0105,56.2502',color:'#e8d5c4'},
    {name:'Мичурин',slug:'michurin',coords:'58.0167,56.2833',color:'#d5e8c4'},
    {name:'Ё-бар',slug:'yo-bar',coords:'57.995,56.235',color:'#c4d5e8'},
    {name:'Филармония',slug:'filarmonia',coords:'58.015,56.25',color:'#e8c4d5'},
    {name:'Бирман',slug:'birman',coords:'58.005,56.27',color:'#d8c4e8'},
  ];
  const tags=['рок','поп','джаз','рэп','электроника','инди','метал','фолк'];
  const titles=['Перемотка','Масло черного тмина','Алла Пугачева tribute','Ночные грузчики','Смешарики Live','Jazz de Paris','Три дня дождя','Кис-кис','Баста','Пикник'];
  const pics=[
    'https://picsum.photos/seed/pl1/400/400',
    'https://picsum.photos/seed/pl2/400/400',
    'https://picsum.photos/seed/pl3/400/400',
    'https://picsum.photos/seed/pl4/400/400',
    'https://picsum.photos/seed/pl5/400/400',
  ];
  const arr=[];
  const base=new Date(); base.setHours(19,0,0,0);
  for(let i=0;i<n;i++){
    const d=new Date(base); d.setDate(base.getDate()+ Math.floor(i/3) + (Math.random()<.3? -1:0)); if(d<base) d.setDate(base.getDate()+1);
    const place=places[i%places.length];
    const t=titles[i%titles.length] + (i>9? ` #${i}`:'');
    arr.push({
      id:1000+i,
      title:t,
      slug:`event-${1000+i}`,
      date: toISO(d),
      time: `${19+ (i%3)}:00`,
      place: {name:place.name, slug:place.slug, address:'ул. Ленина 1', coordinates:place.coords},
      place_name: place.name,
      bg_color: place.color,
      main_image: pics[i%pics.length],
      price: Math.random()<.3?0: 500+ Math.floor(Math.random()*2000),
      cached_rating: (3 + Math.random()*2).toFixed(1),
      display_rating: (3 + Math.random()*2).toFixed(1),
      is_paid: i<4,
      tickets: Math.random()<.6? 'https://permlive.ru':'',
      tags:[{name:tags[i%tags.length]},{name:tags[(i+2)%tags.length]}],
      description:'Живой концерт в Перми. Легендарное звучание и атмосфера настоящего праздника музыки.',
    });
  }
  return arr.sort((a,b)=> a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
let MOCK = mockConcerts(48);

// API fetch with fallback
async function fetchJSON(url){
  try{
    const r=await fetch(url,{headers:{'X-Requested-With':'XMLHttpRequest'}});
    if(!r.ok) throw new Error(r.status);
    return await r.json();
  }catch(e){ return null; }
}

async function loadData(){
  // calendar dates
  const cal = await fetchJSON(`${API_BASE}/api/calendar-dates/`);
  if(cal && Array.isArray(cal.dates)){ state.datesWithEvents=new Set(cal.dates); if(cal.today) state.todayISO=cal.today; state.selectedDate=cal.today||state.todayISO; }
  else {
    // mock dates: every date in mock has event
    state.datesWithEvents=new Set(MOCK.map(c=>c.date));
  }
  // map events today
  const mapJson = await fetchJSON(`${API_BASE}/map/events/?date=${state.selectedDate}`);
  if(mapJson && Array.isArray(mapJson.events)){
    state.concerts = mapJson.events.map(normalizeApiEvent);
    if(!state.concerts.length) state.concerts=MOCK;
  }else{
    // fallback: fetch concerts_api or use mock
    const api = await fetchJSON(`${API_BASE}/api/concerts/?limit=60`);
    if(api && Array.isArray(api.results)) state.concerts = api.results.map(normalizeApiConcert);
    else state.concerts = MOCK;
  }
  // sort
  state.concerts.sort((a,b)=> a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  // fill upcoming/popular/top10 from same set
  if(!state.datesWithEvents.size) state.datesWithEvents=new Set(state.concerts.map(c=>c.date));
}

function normalizeApiConcert(c){
  return {
    id:c.id, title:c.title||c.name, slug:c.slug, date: (c.date||'').slice(0,10), time: c.time||'19:00',
    place: c.place||{name:c.place_name||'Площадка', coordinates:'58.0105,56.2502'}, place_name: c.place?.name||c.place_name,
    bg_color: c.bg_color||'#e8e8e8', main_image: c.main_image||c.image||'', price: c.price??500,
    cached_rating: c.cached_rating||c.rating||'4.2', display_rating: c.display_rating||c.rating||'4.2',
    is_paid: !!c.is_paid, tickets:c.tickets||'', tags: c.tags||[], description:c.description||''
  };
}
function normalizeApiEvent(e){
  // map/events returns {title, slug, date, time, place:{name, coordinates}, bg_color, image, price, rating}
  return {
    id:e.id||Math.floor(Math.random()*1e6), title:e.title, slug:e.slug, date:e.date, time:e.time||'19:00',
    place:e.place||{name:e.place_name, coordinates:e.coordinates, address:e.address}, place_name:e.place?.name||e.place_name,
    bg_color:e.bg_color||'#e8e8e8', main_image:e.image||e.main_image||'', price:e.price??'', cached_rating:e.rating||'4.0', display_rating:e.rating||'4.0',
    is_paid:!!e.is_paid, tickets:e.tickets||'', tags:e.tags||[], description:e.description||''
  };
}

// Render calendar strip (30 days)
function renderCalendarStrip(){
  const inner=els.calendarInner;
  inner.innerHTML='';
  const today=parseISO(state.todayISO);
  for(let i=0;i<30;i++){
    const d=new Date(today); d.setDate(today.getDate()+i);
    const iso=toISO(d);
    const has=state.datesWithEvents.has(iso);
    const sel=iso===state.selectedDate;
    const isWeekend=d.getDay()===0||d.getDay()===6;
    const el=document.createElement('button');
    el.className='calendar-date'+(sel?' selected':'')+(has?' has-events':'')+(isWeekend?' calendar-date--weekend':'');
    el.dataset.date=iso;
    el.innerHTML=`<span class="calendar-date__day">${d.getDate()}</span><span class="calendar-date__wd">${['пн','вт','ср','чт','пт','сб','вс'][ (d.getDay()+6)%7 ]}</span><span class="calendar-date__dot"></span>`;
    el.addEventListener('click',()=> selectDate(iso));
    inner.appendChild(el);
  }
  updateDateBtn();
  updateArrowVisibility();
}

function updateDateBtn(){
  const t=parseISO(state.selectedDate);
  const today=parseISO(state.todayISO);
  let label='Сегодня';
  if(state.selectedDate!==state.todayISO){
    const tmr=new Date(today); tmr.setDate(today.getDate()+1);
    if(state.selectedDate===toISO(tmr)) label='Завтра';
    else label=fmtHeaderDate(t);
  }
  els.dateBtn.querySelector('.pl-map-date-btn__text').textContent=label;
  els.dateBtn.classList.toggle('pl-map-date-btn--filtered', state.selectedDate!==state.todayISO);
}

function selectDate(iso){
  state.selectedDate=iso;
  $$('.calendar-date').forEach(el=> el.classList.toggle('selected', el.dataset.date===iso));
  updateDateBtn();
  // re-filter timeline + map
  applyFilter();
  loadMapForDate(iso);
  // close modal if open
  closeCalendar();
  // scroll selected into view
  const sel=document.querySelector(`.calendar-date[data-date="${iso}"]`);
  sel && sel.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
}

function updateArrowVisibility(){
  const inner=els.calendarInner;
  const left=$('#feed-calendar .calendar-arrow.left');
  const right=$('#feed-calendar .calendar-arrow.right');
  function upd(){ left.classList.toggle('hidden', inner.scrollLeft<=4); right.classList.toggle('hidden', inner.scrollLeft+inner.clientWidth >= inner.scrollWidth-4); }
  inner.addEventListener('scroll', upd);
  upd();
  left.onclick=()=> inner.scrollBy({left:-240,behavior:'smooth'});
  right.onclick=()=> inner.scrollBy({left:240,behavior:'smooth'});
}

// Month calendar modal (like map)
let calView=null;
function openCalendar(){
  els.calOverlay.classList.add('pl-map-calendar-overlay--show');
  els.calModal.classList.add('pl-map-calendar-modal--open');
  els.calModal.setAttribute('aria-hidden','false');
  els.dateBtn.classList.add('pl-map-date-btn--open');
  if(!calView){ const sel=parseISO(state.selectedDate)||parseISO(state.todayISO); calView={y:sel.getFullYear(), m:sel.getMonth()}; }
  renderMonth();
}
function closeCalendar(){
  els.calOverlay.classList.remove('pl-map-calendar-overlay--show');
  els.calModal.classList.remove('pl-map-calendar-modal--open');
  els.calModal.setAttribute('aria-hidden','true');
  els.dateBtn.classList.remove('pl-map-date-btn--open');
}
function renderMonth(){
  const host=els.calModal.querySelector('.pl-map-calendar-modal__cal');
  const y=calView.y, m=calView.m;
  const today=parseISO(state.todayISO);
  const maxDate = (()=>{ const s=[...state.datesWithEvents].sort().pop(); return s?parseISO(s):null; })();
  const monthsNom=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const atStart = y < today.getFullYear() || (y===today.getFullYear() && m<=today.getMonth());
  const atEnd = maxDate && (y>maxDate.getFullYear() || (y===maxDate.getFullYear() && m>=maxDate.getMonth()));
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
  const grid=document.createElement('div'); grid.className='pl-map-mcal__grid';
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach((n,i)=>{ const w=document.createElement('div'); w.className='pl-map-mcal__wd'+(i>=5?' pl-map-mcal__wd--weekend':''); w.textContent=n; grid.appendChild(w); });
  const first=new Date(y,m,1); const offset=(first.getDay()+6)%7; const daysIn=new Date(y,m+1,0).getDate();
  for(let i=0;i<offset;i++){ const e=document.createElement('div'); e.style.aspectRatio='1'; grid.appendChild(e); }
  for(let d=1;d<=daysIn;d++){
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const has=state.datesWithEvents.has(ds);
    const wd=new Date(y,m,d).getDay();
    const btn=document.createElement('button'); btn.className='pl-map-mcal__day'; if(wd===0||wd===6) btn.classList.add('pl-map-mcal__day--weekend');
    btn.innerHTML=`<span>${d}</span>`;
    if(!has){ btn.classList.add('pl-map-mcal__day--muted'); btn.disabled=true; }
    else if(ds===state.selectedDate) btn.classList.add('pl-map-mcal__day--selected');
    else if(ds===state.todayISO) btn.classList.add('pl-map-mcal__day--today');
    if(has) btn.onclick=()=> selectDate(ds);
    grid.appendChild(btn);
  }
  // pad to 42
  const filled=offset+daysIn; for(let f=filled; f<42; f++){ const e=document.createElement('div'); grid.appendChild(e); }
  host.innerHTML=''; host.append(head,grid);
}

// Cards
function cardHTML(c, opts={}){
  const rank=opts.rank? `<div class="card-rank">${opts.rank}</div>`:'';
  const rating = c.cached_rating ? `<div class="card-rating-badge"><i class="fas fa-star"></i> ${c.display_rating||c.cached_rating}</div>` : '';
  const priceTag = c.price===0? 'бесплатно' : c.price? `${c.price}₽`: '';
  const tagName = c.tags?.[0]?.name||'';
  const img = c.main_image? `<img class="card-img" src="${esc(c.main_image)}" alt="${esc(c.title)}" loading="lazy">` : `<div class="card-img-placeholder"></div>`;
  return `<a class="concert-card" data-slug="${esc(c.slug)}" style="--card-bg-color:${esc(c.bg_color||'#f0f0f0')}">
    <div class="card-img-wrapper">${img}${rank}${rating}<span class="card-like" data-id="${c.id}"><i class="fa-solid fa-heart"></i></span></div>
    <div class="card-info">
      <h3 class="card-title">${esc(c.title)}</h3>
      <div class="card-meta">${esc(fmtDay(parseISO(c.date)))} · ${esc(c.place_name||c.place?.name||'')} ${priceTag? '· '+priceTag:''}</div>
      <div class="card-footer"><div class="card-tags">${tagName? `<span class="tag">${esc(tagName)}</span>`:''}</div></div>
    </div>
  </a>`;
}

function renderSliders(){
  // Top-10 by rating
  const top10=[...state.concerts].sort((a,b)=> parseFloat(b.cached_rating)-parseFloat(a.cached_rating)).slice(0,10);
  els.top10Row.innerHTML = top10.map((c,i)=> cardHTML(c,{rank:i+1})).join('') || '<p style="padding:12px;color:#999">Нет данных</p>';
  // Upcoming 3 days
  const today=parseISO(state.todayISO);
  const upcoming=state.concerts.filter(c=>{ const d=parseISO(c.date); return d>=today && d<= new Date(today.getFullYear(),today.getMonth(),today.getDate()+3); }).slice(0,12);
  const upcomingToShow = upcoming.length? upcoming : state.concerts.slice(0,10);
  els.upcomingRow.innerHTML = upcomingToShow.map(c=> cardHTML(c)).join('');
  if(upcomingToShow.length>10) { const more=document.createElement('a'); more.className='concert-card see-all-card'; more.style.background='linear-gradient(135deg,#e14425,#ff6b35)'; more.href='https://permlive.ru/timeline/upcoming/'; more.target='_blank'; more.innerHTML='<div class="see-all-wrapper"><div class="see-all-content"><div class="see-all-icon"><i class="fas fa-arrow-right"></i></div><div class="see-all-text">Все ближайшие</div><div class="see-all-count">'+state.concerts.length+' концертов</div></div></div>'; els.upcomingRow.appendChild(more); }
  els.upcomingBadge.textContent=upcomingToShow.length||state.concerts.length; els.upcomingBadge.style.display='inline-flex';
  // Popular (shuffle)
  if(state.concerts.length>6){
    els.sliderPopular.style.display='';
    const sh=[...state.concerts].sort(()=>Math.random()-.5).slice(0,10);
    els.popularRow.innerHTML=sh.map(c=>cardHTML(c)).join('');
    bindSliderArrows(els.sliderPopular);
  }
  bindSliderArrows(els.sliderTop10);
  bindSliderArrows(els.sliderUpcoming);
  // click delegation
  [els.top10Row, els.upcomingRow, els.popularRow].forEach(row=> row.addEventListener('click', e=>{
    const card=e.target.closest('.concert-card'); if(!card) return;
    const slug=card.dataset.slug; if(!slug) return;
    const c=state.concerts.find(x=>x.slug===slug); if(c) openSheet(c);
  }));
}

function bindSliderArrows(slider){
  const row=slider.querySelector('.horizontal-slider-row');
  const left=slider.querySelector('.horizontal-slider-arrow.left');
  const right=slider.querySelector('.horizontal-slider-arrow.right');
  if(!row||!left||!right) return;
  function upd(){ left.classList.toggle('hidden', row.scrollLeft<=4); right.classList.toggle('hidden', row.scrollLeft+row.clientWidth >= row.scrollWidth-4); }
  row.addEventListener('scroll', upd); upd();
  left.onclick=()=> row.scrollBy({left:-260,behavior:'smooth'});
  right.onclick=()=> row.scrollBy({left:260,behavior:'smooth'});
}

// Timeline grouped by date
function renderTimeline(){
  const list = state.filtered;
  els.timeline.innerHTML='';
  if(!list.length){
    els.timelineEmpty.classList.remove('hidden');
    return;
  }
  els.timelineEmpty.classList.add('hidden');
  // group
  const groups={};
  list.forEach(c=>{ (groups[c.date]||(groups[c.date]=[])).push(c); });
  const dates=Object.keys(groups).sort();
  dates.forEach(date=>{
    const d=parseISO(date);
    const dayEl=document.createElement('div'); dayEl.className='schedule-day';
    const title=document.createElement('div'); title.className='schedule-day-title';
    const isToday=date===state.todayISO;
    title.innerHTML=`<i class="fas fa-calendar"></i> ${isToday? 'Сегодня': fmtHeaderDate(d)} <span style="color:#999;font-weight:400;margin-left:6px">${groups[date].length}</span>`;
    dayEl.appendChild(title);
    const events=document.createElement('div'); events.className='schedule-day-events';
    groups[date].forEach(c=>{
      const row=document.createElement('div'); row.className='schedule-event';
      row.innerHTML=`<span class="schedule-time">${esc(c.time||'')}</span>
        <a class="schedule-title" href="https://permlive.ru/event/${esc(c.slug)}/" target="_blank" rel="noopener">${esc(c.title)} ${parseFloat(c.cached_rating)>=4? `<span style="background:#ffc107;border-radius:999px;padding:2px 6px;font-size:10px"><i class="fas fa-star"></i> ${esc(c.display_rating)}</span>`:''}</a>
        <span class="schedule-details">${esc(c.place_name||c.place?.name||'')} ${c.tags?.length? '› '+esc(c.tags[0].name):''} ${c.price===0?'› бесплатно': c.price? `› ${c.price}₽`:''}</span>`;
      row.addEventListener('click', e=>{
        if(e.target.closest('a')) return;
        openSheet(c);
      });
      events.appendChild(row);
    });
    dayEl.appendChild(events);
    els.timeline.appendChild(dayEl);
  });
  // switch to grid on desktop for small lists? keep list for timeline readability
  els.timeline.classList.remove('timeline-grid');
}

function applyFilter(){
  const q=state.query.trim().toLowerCase();
  let list = state.concerts.filter(c=> c.date===state.selectedDate);
  if(!list.length && state.selectedDate===state.todayISO) list = state.concerts.filter(c=> parseISO(c.date) >= parseISO(state.todayISO)).slice(0,30);
  // search
  if(q){
    list = state.concerts.filter(c=> (c.title+c.place_name+(c.tags?.map(t=>t.name).join(' ')||'')).toLowerCase().includes(q));
  }
  state.filtered=list;
  renderTimeline();
  // sliders visibility: hide when search active
  const hasSearch=!!q;
  $('#feed-sliders').style.display = hasSearch? 'none' : '';
  if(!hasSearch) renderSliders();
}

// Sheet
function openSheet(c){
  els.sheetContent.innerHTML=`
    ${c.main_image? `<img class="sheet__img" src="${esc(c.main_image)}" alt="">`:''}
    <h3 class="sheet__title">${esc(c.title)}</h3>
    <div class="sheet__meta"><i class="fas fa-calendar"></i> ${esc(fmtDay(parseISO(c.date)))} в ${esc(c.time||'')} · <i class="fas fa-location-dot"></i> ${esc(c.place_name||c.place?.name||'')} ${c.place?.address? '· '+esc(c.place.address):''}</div>
    ${c.tags?.length? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${c.tags.map(t=> `<span class="tag" style="background:#f0f0f0">${esc(t.name)}</span>`).join('')}</div>`:''}
    <p class="sheet__desc">${esc(c.description||'Подробности на permlive.ru')}</p>
    <div style="display:flex;gap:8px;margin-top:6px;color:#a97c00;font-weight:600">${c.price===0? 'Вход свободный' : c.price? `от ${c.price}₽` : ''} ${c.is_paid? '· <span style="color:#e14425">★ Топ</span>':''}</div>
    <div class="sheet__actions">
      <a class="pl-btn" href="https://permlive.ru/event/${esc(c.slug)}/" target="_blank" rel="noopener"><i class="fas fa-external-link"></i> Открыть на сайте</a>
      <button class="pl-btn pl-btn--secondary" id="sheet-map-btn"><i class="fas fa-map"></i> Показать на карте</button>
    </div>`;
  els.sheet.classList.add('sheet--open');
  els.sheetOverlay.classList.add('sheet-overlay--show');
  $('#sheet-map-btn').onclick=()=>{
    closeSheet();
    switchTab('map');
    // focus map on this place
    if(c.place?.coordinates){ const [lat,lng]=c.place.coordinates.split(',').map(Number); if(state.map && isFinite(lat) && isFinite(lng)) state.map.setView([lat,lng],14); }
    toast('Событие на карте');
  };
}
function closeSheet(){ els.sheet.classList.remove('sheet--open'); els.sheetOverlay.classList.remove('sheet-overlay--show'); }

// Map
let leafletMap=null;
function initMap(){
  if(leafletMap) return;
  const center=[58.0105,56.2502];
  leafletMap = L.map(els.mapEl,{zoomControl:false, attributionControl:false}).setView(center,12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OSM'}).addTo(leafletMap);
  state.map=leafletMap;
  // controls containers
  const dateBtn=document.createElement('button'); dateBtn.className='pl-map-date-btn map-date-btn'; dateBtn.innerHTML='<span class="pl-map-date-btn__text">Сегодня</span> <i class="fas fa-chevron-down" style="font-size:10px"></i>';
  els.mapEl.appendChild(dateBtn);
  const modeBtn=document.createElement('button'); modeBtn.className='pl-map-date-btn map-mode-btn'; modeBtn.style.top='56px'; modeBtn.innerHTML='<span>Все концерты</span> <i class="fas fa-chevron-down" style="font-size:10px"></i>';
  els.mapEl.appendChild(modeBtn);
  const dropdown=document.createElement('div'); dropdown.className='map-dropdown'; dropdown.innerHTML=`<button class="map-dropdown__opt map-dropdown__opt--active" data-mode="all">Все концерты</button><button class="map-dropdown__opt" data-mode="free">Бесплатные</button><button class="map-dropdown__opt" data-mode="paid">Топ</button>`;
  els.mapEl.appendChild(dropdown);
  dateBtn.onclick=openCalendar;
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
  // close dropdown on map click
  leafletMap.on('click',()=> dropdown.classList.remove('map-dropdown--open'));
  refreshMapMarkers();
}

function refreshMapMarkers(){
  if(!leafletMap) return;
  // clear
  state.mapMarkers.forEach(m=> leafletMap.removeLayer(m));
  state.mapMarkers=[];
  let list=state.concerts.filter(c=> c.date===state.selectedDate);
  if(state.mapMode==='free') list=list.filter(c=> c.price===0);
  if(state.mapMode==='paid') list=list.filter(c=> c.is_paid);
  // group by place coordinates
  const byPlace={};
  list.forEach(c=>{
    const key=c.place?.coordinates||'';
    if(!key) return;
    (byPlace[key]||(byPlace[key]=[])).push(c);
  });
  Object.entries(byPlace).forEach(([coords, arr])=>{
    const [lat,lng]=coords.split(',').map(Number);
    if(!isFinite(lat)||!isFinite(lng)) return;
    const el=document.createElement('div');
    const paid=arr.some(a=>a.is_paid);
    el.className='pl-map-pin'+(paid?' pl-map-pin--paid':'');
    const time=arr[0].time||'';
    el.innerHTML=`<span class="pl-map-pin__time">${esc(time)}</span><span class="pl-map-pin__title">${esc(arr.length>1? arr[0].place_name+' +'+(arr.length-1) : arr[0].title.slice(0,18))}</span>`;
    const icon=L.divIcon({className:'', html: el, iconSize:[0,0], iconAnchor:[0,0]});
    const marker=L.marker([lat,lng],{icon}).addTo(leafletMap);
    const popupContent = arr.map(c=> `<div style="margin:6px 0"><b>${esc(c.title)}</b><br><small>${esc(c.time||'')} · ${esc(c.place_name||'')} ${c.price===0?'· бесплатно': c.price? `· ${c.price}₽`:''}</small><br><a href="https://permlive.ru/event/${esc(c.slug)}/" target="_blank" style="color:#e14425">Открыть →</a></div>`).join('<hr style="margin:6px 0;opacity:.2">');
    marker.bindPopup(`<div style="min-width:180px;max-width:260px"><b>${esc(arr[0].place_name||'')}</b>${arr[0].place?.address? `<br><small>${esc(arr[0].place.address)}</small>`:''}<hr style="opacity:.2">${popupContent}</div>`);
    state.mapMarkers.push(marker);
  });
  if(list.length && state.tab==='map'){
    setTimeout(()=> leafletMap.invalidateSize(),120);
  }
}

async function loadMapForDate(iso){
  const j=await fetchJSON(`${API_BASE}/map/events/?date=${iso}`);
  if(j && Array.isArray(j.events)){
    // merge into state.concerts keeping other dates
    const other=state.concerts.filter(c=>c.date!==iso);
    const incoming=j.events.map(normalizeApiEvent);
    state.concerts = [...other, ...incoming].sort((a,b)=> a.date.localeCompare(b.date));
    state.datesWithEvents.add(iso);
    applyFilter();
    refreshMapMarkers();
  }else{
    refreshMapMarkers();
  }
}

// Tabs
function switchTab(tab){
  state.tab=tab;
  els.tabBtns.forEach(b=>{ const active=b.dataset.tab===tab; b.classList.toggle('pl-tabbar__btn--active', active); b.setAttribute('aria-selected', String(active)); });
  els.viewFeed.classList.toggle('view--active', tab==='feed');
  els.viewMap.classList.toggle('view--active', tab==='map');
  if(tab==='map'){
    initMap();
    setTimeout(()=> leafletMap && leafletMap.invalidateSize(), 80);
    refreshMapMarkers();
    try{ bridge && bridge.send('VKWebAppSetViewSettings',{status_bar_style:'light', action_bar_color:'#ffffff'});}catch(e){}
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

// Events wiring
function wire(){
  els.tabBtns.forEach(b=> b.addEventListener('click',()=> switchTab(b.dataset.tab)));
  els.dateBtn.addEventListener('click', openCalendar);
  els.calOverlay.addEventListener('click', closeCalendar);
  els.sheetOverlay.addEventListener('click', closeSheet);
  $('.sheet__close').addEventListener('click', closeSheet);
  $('#btn-show-all').addEventListener('click',()=>{
    state.selectedDate=state.todayISO; renderCalendarStrip(); applyFilter(); window.scrollTo({top:0,behavior:'smooth'});
  });
  els.searchInput.addEventListener('input', e=>{
    state.query=e.target.value;
    applyFilter();
  });
  // header search focus
  // swipe calibration for tab change?
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
}

// Boot
(async function boot(){
  wire();
  renderCalendarStrip();
  await loadData();
  renderCalendarStrip();
  applyFilter();
  // handle launch params
  const params=new URLSearchParams(location.search);
  const tab=params.get('tab')||params.get('vk_tab');
  if(tab==='map') switchTab('map');
  // VK Bridge get launch params
  try{
    const lp = await bridge.send('VKWebAppGetLaunchParams');
    // not used but keeps bridge alive
  }catch(e){}
  console.log('[Permlive Mini App] ready', state);
})();
