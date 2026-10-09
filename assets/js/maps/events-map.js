
(function () {
    'use strict';

    var LOCATION_KEY = 'permlive_user_location';
    var LOCATION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 дней — запоминаем до чистки куки
    var DEFAULT_CENTER = [56.2502, 58.0105];
    // Центры городов [lng, lat] — фолбэк, когда в дне нет событий с координатами.
    // Точный центр текущего города миник кладёт в PermLiveMapData.cityCenter.
    var CITY_CENTERS = {
        perm: [56.2778, 58.0095],
        moscow: [37.6173, 55.7558],
        spb: [30.3351, 59.9343],
        novosibirsk: [82.9204, 55.0302],
        ekb: [60.6057, 56.8389],
        kazan: [49.1221, 55.7887],
        nizhniy: [43.9361, 56.2965],
        chelyabinsk: [61.4368, 55.1644],
        ufa: [55.9721, 54.7388],
        krasnodar: [38.9753, 45.0355],
        rostov: [39.7189, 47.2224],
        samara: [50.1002, 53.1959],
        tyumen: [65.5412, 57.1522],
        izhevsk: [53.2115, 56.8527],
        kirov: [49.6668, 58.6035],
        voronezh: [39.1843, 51.6720],
        volgograd: [44.5133, 48.7080],
        omsk: [73.3242, 55.0084],
        krasnoyarsk: [92.8932, 56.0153],
        saratov: [46.0348, 51.5924],
        sochi: [39.7231, 43.5855],
        irkutsk: [104.2807, 52.2864],
        khabarovsk: [135.0719, 48.4802],
        vladivostok: [131.8855, 43.1155],
        kaliningrad: [20.4522, 54.7104],
        novorossiysk: [37.7689, 44.7239],
        arkhangelsk: [40.5157, 64.5399],
        yakutsk: [129.6755, 62.0355],
        murmansk: [33.0827, 68.9585],
        syktyvkar: [50.8358, 61.6687]
    };

    // Цвета типов событий: music — Музыка (красный), stage — Кино и сцена
    // (синий), talk — Юмор и игры (оранжевый), expo — Выставки и знания
    // (шалфей), other — Прочее (серый). Paid — золото, эмоции — фиолетовый.
    var GENRE_COLORS = {
        'music': '#e14425',
        'stage': '#2f6fed',
        'talk': '#eab308',
        'expo': '#7d8c6f',
        'other': '#94a3b8'
    };

    // Подписи для легенды карты (порядок = порядок строк).
    var GENRE_LABELS = {
        'music': 'Музыка',
        'stage': 'Кино и сцена',
        'talk': 'Юмор и игры',
        'expo': 'Выставки и знания',
        'other': 'Прочее'
    };

    var EMOTION_COLOR = '#8b5cf6';

    var EMOTION_LIFE_MS = 6 * 60 * 60 * 1000;

var CUSTOMIZATION = (window.PermLiveMaps && window.PermLiveMaps.customization) || [];

    var pressedEl = null;
    var pressedXY = null;

    var FILTER_KEY = 'pl_map_filters_v2';
    var FILTER_TYPES = ['music', 'stage', 'talk', 'expo'];
    var MODE_KEY = 'pl_map_mode_v1';

    var state = {
        map: null,
        mapEl: null,
        balloonEl: null,
        balloonOpenId: null,
        balloonOpenedAt: 0,
        activePinEl: null,
        userMarker: null,
        userCoords: null,
        schemeLayer: null,
        YMapDefaultSchemeLayer: null,
        YMapClusterer: null,
        YMapMarker: null,
        clusterMethod: null,
        clusterer: null,
        toastTimer: null,
        events: (window.PermLiveMapData && window.PermLiveMapData.events) || [],
        emotions: [],
        emotionsVisible: true,
        filters: { music: true, stage: true, talk: true, expo: true },
        modeFilter: 'all',
        filterBtns: {},
        emotionPanels: [],
        emotionTimer: null,
        emotionAnchor: null,
        composerScreen: null,

        emotionAnchorCamera: null,
        flowerEl: null,
        flowerOverlayEl: null,
        flowerAnchor: null,
        flowerScreen: null,
        proposeEl: null,
        proposeOverlayEl: null
    };

    function el(tag, className, html) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (html !== undefined) node.innerHTML = html;
        return node;
    }

    function genreColor(event) {
        var type = event.tags && event.tags[0] && event.tags[0].type;
        type = String(type || 'other').toLowerCase();
        if (event.featureType === 'emotion') return EMOTION_COLOR;
        return GENRE_COLORS[type] || GENRE_COLORS.other;
    }

    function getCookie(name) {
        try {
            var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/+^])/g, '\\$1') + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : null;
        } catch (e) { return null; }
    }
    function setCookie(name, value, days) {
        try {
            var d = new Date();
            d.setTime(d.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
            document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
        } catch (e) {}
    }
    function loadFilterPrefs() {
        var raw = null;
        try { raw = localStorage.getItem(FILTER_KEY); } catch (e) {}
        if (!raw) raw = getCookie(FILTER_KEY);
        if (raw) {
            try {
                var data = JSON.parse(raw);
                for (var fi = 0; fi < FILTER_TYPES.length; fi++) {
                    var fk = FILTER_TYPES[fi];
                    if (typeof data[fk] === 'boolean') state.filters[fk] = data[fk];
                }
                if (typeof data.emotions === 'boolean') state.emotionsVisible = data.emotions;
                if (typeof data.mode === 'string' && (data.mode === 'all' || data.mode === 'free' || data.mode === 'foryou')) {
                    state.modeFilter = data.mode;
                }
            } catch (e) {}
        }

        try {
            var rawMode = localStorage.getItem(MODE_KEY) || getCookie(MODE_KEY);
            if (rawMode) {
                var m = String(rawMode).replace(/"/g, '');
                if (m === 'all' || m === 'free' || m === 'foryou') state.modeFilter = m;
            }
        } catch (e) {}
    }
    function saveFilterPrefs() {
        try {
            var data = {
                emotions: !!state.emotionsVisible,
                mode: state.modeFilter
            };
            for (var fi = 0; fi < FILTER_TYPES.length; fi++) {
                data[FILTER_TYPES[fi]] = !!state.filters[FILTER_TYPES[fi]];
            };
            var json = JSON.stringify(data);
            try { localStorage.setItem(FILTER_KEY, json); } catch (e) {}
            setCookie(FILTER_KEY, json, 365);
            try { localStorage.setItem(MODE_KEY, state.modeFilter); } catch (e) {}
            setCookie(MODE_KEY, state.modeFilter, 365);
        } catch (e) {}
    }
    function setModeFilter(mode) {
        if (mode !== 'all' && mode !== 'free' && mode !== 'foryou') return;

        var avail = getModeAvailability();
        if (mode === 'free' && !avail.free) { showToast('На этот день нет бесплатных событий'); return; }
        if (mode === 'foryou' && !avail.foryou) {
            if (!ME.is_auth) { showToast('Войдите, чтобы видеть «Для вас»'); return; }
            showToast('На этот день нет рекомендаций для вас — поставьте лайки');
            return;
        }
        state.modeFilter = mode;
        saveFilterPrefs();
        if (state.balloonOpenId) closeBalloon();
        updateClustererFeatures();

        try { window.dispatchEvent(new CustomEvent('pl:map-mode-changed', { detail: mode })); } catch (e) {}
    }
    function primaryType(ev) {
        if (!ev || !ev.tags || !ev.tags.length) return '';
        return String(ev.tags[0].type || '').toLowerCase();
    }
    function passesTypeFilter(ev) {
        var t = primaryType(ev);
        if (t === 'other' || !t) return true;
        if (GENRE_COLORS.hasOwnProperty(t)) return !!state.filters[t];
        return true;
    }
    function passesModeFilter(ev) {
        if (state.modeFilter === 'free') return Number(ev.price) === 0;
        if (state.modeFilter === 'foryou') return !!(ev.is_foryou || ev.is_liked);
        return true;
    }
    function eventPassesFilters(ev) {
        return passesTypeFilter(ev) && passesModeFilter(ev);
    }

    function getTypeAvailability() {
        var cnt = { music: 0, stage: 0, talk: 0, expo: 0 };
        for (var i = 0; i < state.events.length; i++) {
            var t = primaryType(state.events[i]);
            if (cnt.hasOwnProperty(t)) cnt[t]++;
        }
        var distinct = 0;
        for (var k in cnt) if (cnt[k] > 0) distinct++;
        return { counts: cnt, distinct: distinct };
    }
    function getModeAvailability() {
        var free = 0, foryou = 0;
        for (var i = 0; i < state.events.length; i++) {
            var ev = state.events[i];
            if (Number(ev.price) === 0) free++;
            if (ev.is_foryou || ev.is_liked) foryou++;
        }
        return { free: free > 0, foryou: foryou > 0 && !!ME.is_auth, freeCount: free, foryouCount: foryou };
    }
    function filteredEvents() {
        var out = [];
        for (var i = 0; i < state.events.length; i++) {
            if (eventPassesFilters(state.events[i])) out.push(state.events[i]);
        }
        return out;
    }
    function applyFilterChange() {
        if (state.balloonOpenId && state.balloonOpenId !== 'cluster') {
            var ev = findEvent(state.balloonOpenId);
            if (ev && !eventPassesFilters(ev)) closeBalloon();
        }
        if (state.balloonOpenId === 'cluster') closeBalloon();
        updateClustererFeatures();
        saveFilterPrefs();
        syncFilterButtons();
    }
    function syncFilterButtons() {
        for (var k in state.filterBtns) {
            if (!state.filterBtns.hasOwnProperty(k)) continue;
            var btn = state.filterBtns[k];
            var on = k === 'emotions' ? !!state.emotionsVisible : !!state.filters[k];
            if (btn) {
                btn.classList.toggle('is-active', on);
                if (k === 'emotions') {
                    btn.title = 'Эмоции на карте: ' + (on ? 'включены' : 'выключены');
                } else {
                    var label = GENRE_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1));
                    btn.title = label + ': ' + (on ? 'показаны' : 'скрыты');
                    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                }
            }
        }
    }

    function syncFilterVisibility() {
        var avail = getTypeAvailability();
        var distinct = avail.distinct;
        var cnt = avail.counts;
        var hideAllTypes = distinct <= 1 || state.events.length === 0;

        if (hideAllTypes && state.events.length > 0) {
            var changed = false;
            for (var k in cnt) {
                if (cnt[k] > 0 && !state.filters[k]) {
                    state.filters[k] = true;
                    changed = true;
                }
            }
            if (changed) { saveFilterPrefs(); syncFilterButtons(); }
        }
        for (var key in state.filterBtns) {
            if (key === 'emotions') continue;
            var b = state.filterBtns[key];
            if (!b) continue;
            if (hideAllTypes) {
                b.style.display = 'none';
            } else {
                b.style.display = cnt[key] > 0 ? '' : 'none';
            }
        }

        var modeAvail = getModeAvailability();
        if (state.modeFilter === 'free' && !modeAvail.free) {
            state.modeFilter = 'all';
            saveFilterPrefs();
            try { window.dispatchEvent(new CustomEvent('pl:map-mode-changed', { detail: 'all' })); } catch (e) {}
            updateClustererFeatures();
        } else if (state.modeFilter === 'foryou' && !modeAvail.foryou) {
            state.modeFilter = 'all';
            saveFilterPrefs();
            try { window.dispatchEvent(new CustomEvent('pl:map-mode-changed', { detail: 'all' })); } catch (e) {}
            updateClustererFeatures();
        }

        try {
            window.dispatchEvent(new CustomEvent('pl:map-availability', {
                detail: {
                    typeCounts: cnt,
                    distinct: distinct,
                    hideAllTypes: hideAllTypes,
                    free: modeAvail.free,
                    foryou: modeAvail.foryou,
                    mode: state.modeFilter
                }
            }));
        } catch (e) {}
    }

    loadFilterPrefs();

    var OUTLIER_KM = 10;

    function cityFallbackCenter() {
        // Центр текущего города мини-приложения (не Пермь для всех).
        try {
            var d = window.PermLiveMapData || {};
            if (d.cityCenter && isFinite(d.cityCenter[0]) && isFinite(d.cityCenter[1])) {
                return [Number(d.cityCenter[0]), Number(d.cityCenter[1])];
            }
            var slug = miniCitySlug();
            if (slug && CITY_CENTERS[slug]) return CITY_CENTERS[slug];
        } catch (e) {}
        return DEFAULT_CENTER;
    }

    function averageCoords() {
        var list = filteredEvents();
        if (!list.length) {

            list = state.events;
            if (!list.length) return cityFallbackCenter();
        }
        var center = weightedCenter(list);
        var close = [];
        for (var i = 0; i < list.length; i++) {
            if (coordsDistanceM(list[i].coordinates, center) <= OUTLIER_KM * 1000) {
                close.push(list[i]);
            }
        }
        return close.length ? weightedCenter(close) : center;
    }

    function weightedCenter(list) {
        var sumLng = 0, sumLat = 0, w = 0;
        for (var i = 0; i < list.length; i++) {
            var c = list[i].coordinates;
            var weight = list[i].paid ? 5 : 1;
            sumLng += c[0] * weight;
            sumLat += c[1] * weight;
            w += weight;
        }
        return w ? [sumLng / w, sumLat / w] : cityFallbackCenter();
    }

    function pinScale(rating) {
        var r = Math.min(5, Math.max(3, Number(rating) || 3));
        var t = (r - 3) / 2;
        return 0.92 + (1.16 - 0.92) * Math.sqrt(t);
    }

    function buildPin(event) {
        var time = event.time ? event.time.slice(0, 5) : '';
        var title = event.title || 'Событие';
        var btn = el('button', 'pl-map-pin');
        btn.type = 'button';
        btn.setAttribute('data-id', String(event.id));
        btn.setAttribute('aria-label', (time ? time + ', ' : '') + title);
        btn.style.setProperty('--pin-c', genreColor(event));
        btn.style.setProperty('--pin-scale', pinScale(event.paid ? 5 : event.rating).toFixed(4));
        if (event.paid) btn.classList.add('pl-map-pin--paid');
        btn.innerHTML = (time ? '<span class="pl-map-pin__time">' + escapeHtml(time) + '</span>' : '') +
            '<span class="pl-map-pin__title">' + escapeHtml(title) + '</span>' +
            (event.paid ? '<span class="pl-map-pin__crown" title="Концерт оплачен"><i class="fas fa-crown" aria-hidden="true"></i></span>' : '');
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleBalloon(event, btn);
        });
        return btn;
    }

    function buildClusterPin(count, features, coordinates) {
        var circle = el('button', 'pl-map-cluster');
        circle.type = 'button';
        circle.innerHTML = '<span>' + count + '</span>';
        var counts = {};
        for (var i = 0; i < features.length; i++) {
            var c = genreColor(features[i].properties);
            counts[c] = (counts[c] || 0) + 1;
        }
        var stops = [];
        var acc = 0;
        Object.keys(counts).forEach(function (color) {
            var from = acc;
            acc += counts[color] / features.length;
            stops.push(color + ' ' + (from * 100).toFixed(1) + '% ' + (acc * 100).toFixed(1) + '%');
        });
        circle.style.background = 'conic-gradient(' + stops.join(', ') + ')';
        circle.__features = features;
        circle.__coords = coordinates;
        return circle;
    }

    function findEvent(id) {
        for (var i = 0; i < state.events.length; i++) {
            if (String(state.events[i].id) === String(id)) return state.events[i];
        }
        return null;
    }

    function buildClusterFeatures() {
        var vis = filteredEvents();
        var features = vis.map(function (ev, i) {
            return {
                type: 'Feature',
                id: ev.id || ('e' + i),
                geometry: { type: 'Point', coordinates: ev.coordinates },
                properties: ev
            };
        });
        if (state.emotionsVisible && isTodayView()) {
            for (var i = 0; i < state.emotions.length; i++) {
                var em = state.emotions[i];
                features.push({
                    type: 'Feature',
                    id: 'em' + String(em.id),
                    geometry: { type: 'Point', coordinates: em.coords },
                    properties: {
                        featureType: 'emotion',
                        em: em,
                        id: em.id
                    }
                });
            }
        }
        return features;
    }

    function createClusterer() {
        var clusterer = new state.YMapClusterer({
            method: state.clusterMethod,
            features: buildClusterFeatures(),
            marker: function (feature) {
                if (feature.properties && feature.properties.featureType === 'emotion') {
                    var emEl = buildEmotionMarkerEl(feature.properties.em);
                    var emMarker = new state.YMapMarker({ coordinates: feature.geometry.coordinates, zIndex: markerZIndex(feature.geometry.coordinates) + 50000 }, emEl);
                    emEl._ymarker = emMarker;
                    emEl._lnglat = feature.geometry.coordinates;
                    emEl.addEventListener('mouseenter', function () { setMarkerZIndex(emMarker, feature.geometry.coordinates, true); });
                    emEl.addEventListener('mouseleave', function () { setMarkerZIndex(emMarker, feature.geometry.coordinates, false); });
                    return emMarker;
                }
                var pin = buildPin(feature.properties);
                var m = new state.YMapMarker({ coordinates: feature.geometry.coordinates, zIndex: markerZIndex(feature.geometry.coordinates) }, pin);
                pin._ymarker = m;
                pin._lnglat = feature.geometry.coordinates;
                pin.addEventListener('mouseenter', function () { setMarkerZIndex(m, feature.geometry.coordinates, true); });
                pin.addEventListener('mouseleave', function () { setMarkerZIndex(m, feature.geometry.coordinates, false); });
                pin.addEventListener('focus', function () { setMarkerZIndex(m, feature.geometry.coordinates, true); });
                pin.addEventListener('blur', function () { setMarkerZIndex(m, feature.geometry.coordinates, false); });
                return m;
            },
            cluster: function (coordinates, clusterFeatures) {
                var circle = buildClusterPin(clusterFeatures.length, clusterFeatures, coordinates);
                circle.addEventListener('click', function (e) {
                    e.stopPropagation();
                    handleClusterClick(clusterFeatures, coordinates, circle);
                });
                var cm = new state.YMapMarker({ coordinates: coordinates, zIndex: markerZIndex(coordinates) + 20000 }, circle);
                circle._ymarker = cm;
                circle._lnglat = coordinates;
                circle.addEventListener('mouseenter', function () { setMarkerZIndex(cm, coordinates, true); });
                circle.addEventListener('mouseleave', function () { setMarkerZIndex(cm, coordinates, false); });
                return cm;
            }
        });
        return clusterer;
    }

    function updateClustererFeatures() {
        if (!state.map || !state.clusterer || !state.YMapClusterer) return;
        try {
            state.clusterer.update({ features: buildClusterFeatures() });
        } catch (err) {  }
    }

    function renderEvents(recenter) {
        if (!state.map || !state.YMapClusterer) return;
        closeBalloon();
        updateClustererFeatures();
        if (recenter) recenterForDay();
    }

    function recenterForDay() {
        if (!state.map) return;
        state.map.setLocation({
            center: averageCoords(),
            zoom: 14,
            duration: 300,
            easing: 'ease-in-out'
        });
    }

    var CLUSTER_SEP_PX = 220;

    function zoomToCluster(features) {
        if (!state.map || !state.map.projection || !features || features.length < 2) return;
        var projection = state.map.projection;
        var world = [];
        for (var i = 0; i < features.length; i++) {
            world.push(projection.toWorldCoordinates(features[i].geometry.coordinates));
        }
        var minW = Infinity;
        for (var a = 0; a < world.length; a++) {
            for (var b = a + 1; b < world.length; b++) {
                var dx = world[a].x - world[b].x;
                var dy = world[a].y - world[b].y;
                var d = Math.sqrt(dx * dx + dy * dy);
                if (d < minW) minW = d;
            }
        }
        if (minW <= 0) minW = 1e-12;

        var neededZoom = Math.log2(CLUSTER_SEP_PX / (minW * 128));

        var currentZoom = (typeof state.map.zoom === 'number') ? state.map.zoom : 12;
        var targetZoom = Math.min(neededZoom, currentZoom + 2);
        if (targetZoom <= currentZoom + 0.01) return;
        targetZoom = Math.max(4, Math.min(19, targetZoom));
        state.map.setLocation({
            center: clusterCenter(features),
            zoom: targetZoom,
            duration: 400,
            easing: 'ease-in-out'
        });
    }

    function handleClusterClick(features, coordinates, clusterEl) {
        if (!state.map) return;
        if (coLocated(features, 100)) {
            openClusterList(features, clusterEl);
        } else {
            zoomToCluster(features);
        }
    }

    function coLocated(features, maxM) {
        if (!features || features.length < 2) return false;
        for (var i = 0; i < features.length; i++) {
            for (var j = i + 1; j < features.length; j++) {
                if (coordsDistanceM(features[i].geometry.coordinates, features[j].geometry.coordinates) > maxM) {
                    return false;
                }
            }
        }
        return true;
    }

    function coordsDistanceM(a, b) {
        var R = 6371000;
        var rad = Math.PI / 180;
        var dLat = (b[1] - a[1]) * rad;
        var dLng = (b[0] - a[0]) * rad;
        var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    }

    function clusterItemHtml(ev) {
        var time = ev.time ? '<span class="pl-map-balloon__cluster-time">' +
            escapeHtml(ev.time.slice(0, 5)) + '</span>' : '';
        var price = ev.price > 0 ? '<span class="pl-map-balloon__cluster-price">' +
            ev.price + ' ₽</span>' : '';

        var metaInner = (time ? time : '') +
            ((time && price) ? '<span class="pl-map-balloon__cluster-dot" aria-hidden="true"> · </span>' : '') +
            (price ? price : '');
        var meta = metaInner ? '<span class="pl-map-balloon__cluster-meta">' + metaInner + '</span>' : '';
        return '<p class="pl-map-balloon__cluster-item"><a class="pl-map-balloon__cluster-link" href="' + escapeAttr(ev.url) + '">' +
            escapeHtml(ev.title) + '</a>' + meta + '</p>';
    }

    function groupClusterByPlace(eventsFeats) {
        var groups = [];
        var index = {};
        for (var i = 0; i < eventsFeats.length; i++) {
            var ev = eventsFeats[i].properties || {};
            var place = ev.place ? String(ev.place).trim() : '';
            var address = ev.address ? String(ev.address).trim() : '';
            var key = venueKeyOf(ev);
            if (!index.hasOwnProperty(key)) {
                index[key] = {
                    key: key,
                    place: place || 'Площадка не указана',
                    address: address,
                    avatar: '',
                    url: '',
                    feats: []
                };
                groups.push(index[key]);
            }
            if (!index[key].avatar && ev.place_avatar) index[key].avatar = String(ev.place_avatar);
            if (!index[key].url && ev.place_url) index[key].url = String(ev.place_url);
            index[key].feats.push(eventsFeats[i]);
        }
        var timeOf = function (f) { return (f.properties && f.properties.time) || '99:99'; };
        for (var g = 0; g < groups.length; g++) {
            groups[g].feats.sort(function (a, b) {
                var at = timeOf(a), bt = timeOf(b);
                return at < bt ? -1 : (at > bt ? 1 : 0);
            });
        }
        groups.sort(function (a, b) {
            var at = a.feats.length ? timeOf(a.feats[0]) : '99:99';
            var bt = b.feats.length ? timeOf(b.feats[0]) : '99:99';
            if (at !== bt) return at < bt ? -1 : 1;
            if (a.feats.length !== b.feats.length) return b.feats.length - a.feats.length;
            return a.place < b.place ? -1 : (a.place > b.place ? 1 : 0);
        });
        return groups;
    }

    function venueKeyOf(ev) {
        var place = ev && ev.place ? String(ev.place).trim() : '';
        var address = ev && ev.address ? String(ev.address).trim() : '';
        return place ? (place + '||' + address) : '__novenue__';
    }

    function venueHeadHtml(gr) {
        var letter = gr.place ? String(gr.place).charAt(0).toUpperCase() : '?';
        var inner = '<span class="pl-map-balloon__venue-letter" aria-hidden="true">' +
            escapeHtml(letter) + '</span>';
        if (gr.avatar) {
            inner += '<img class="pl-map-balloon__venue-img" src="' + escapeAttr(gr.avatar) +
                '" alt="" loading="lazy" decoding="async" onerror="this.remove()">';
        }
        var avatar = gr.url
            ? '<a class="pl-map-balloon__venue-avatar" href="' + escapeAttr(gr.url) + '"' +
              ' aria-label="' + escapeAttr(gr.place) + '">' + inner + '</a>'
            : '<span class="pl-map-balloon__venue-avatar" aria-hidden="true">' + inner + '</span>';
        var name = gr.url
            ? '<a class="pl-map-balloon__venue-name" href="' + escapeAttr(gr.url) + '">' +
              escapeHtml(gr.place) + '</a>'
            : '<span class="pl-map-balloon__venue-name">' + escapeHtml(gr.place) + '</span>';
        var addr = gr.address
            ? '<p class="pl-map-balloon__cluster-addr">' + escapeHtml(gr.address) + '</p>'
            : '';
        return '<div class="pl-map-balloon__venue">' + avatar +
            '<div class="pl-map-balloon__venue-main">' + name + addr + '</div></div>';
    }

    function clusterEmotionsHtml(emotionFeats) {
        if (!emotionFeats || !emotionFeats.length) return '';
        return '<div class="pl-map-balloon__cluster-emotions">' + emotionFeats.map(function (f) {
            var em = f.properties.em;
            return '<button type="button" class="pl-map-balloon__cluster-emotion" data-emoid="' +
                escapeAttr(em.id) + '">' + escapeHtml(em.emoji) + ' <span>' +
                escapeHtml(em.user || 'Пользователь') + '</span></button>';
        }).join('') + '</div>';
    }

    function clusterBodyHtml(groups, activeIdx) {
        if (!groups.length) return { html: '', isTabbed: false };
        if (groups.length === 1) {
            var only = groups[0];
            return {
                html: venueHeadHtml(only) + only.feats.map(function (f) {
                    return clusterItemHtml(f.properties);
                }).join(''),
                isTabbed: false
            };
        }
        var tabsHtml = '<div class="pl-map-balloon__tabs" role="tablist">' + groups.map(function (gr, idx) {
            return '<button type="button" role="tab" class="pl-map-balloon__tab' +
                (idx === activeIdx ? ' pl-map-balloon__tab--active' : '') + '" data-tab="' + idx + '"' +
                ' aria-selected="' + (idx === activeIdx ? 'true' : 'false') + '"' +
                ' title="' + escapeAttr(gr.place) + '">' +
                '<span class="pl-map-balloon__tab-name">' + escapeHtml(gr.place) + '</span>' +
                '<span class="pl-map-balloon__tab-count">' + gr.feats.length + '</span></button>';
        }).join('') + '</div>';
        var panelsHtml = '<div class="pl-map-balloon__tabpanels">' + groups.map(function (gr, idx) {
            var list = gr.feats.map(function (f) {
                return clusterItemHtml(f.properties);
            }).join('');
            return '<div class="pl-map-balloon__tabpanel' +
                (idx === activeIdx ? ' pl-map-balloon__tabpanel--active' : '') + '" role="tabpanel" data-panel="' + idx + '">' +
                venueHeadHtml(gr) + list + '</div>';
        }).join('') + '</div>';
        return { html: tabsHtml + panelsHtml, isTabbed: true };
    }

    function bindClusterTabs() {
        var tabs = state.balloonEl.querySelectorAll('.pl-map-balloon__tab');
        var panels = state.balloonEl.querySelectorAll('.pl-map-balloon__tabpanel');
        if (!tabs.length) return;
        var selectTab = function (idx) {
            for (var ti = 0; ti < tabs.length; ti++) {
                var on = ti === idx;
                tabs[ti].classList.toggle('pl-map-balloon__tab--active', on);
                tabs[ti].setAttribute('aria-selected', on ? 'true' : 'false');
            }
            for (var pi = 0; pi < panels.length; pi++) {
                panels[pi].classList.toggle('pl-map-balloon__tabpanel--active', pi === idx);
            }
            try { state.balloonEl.scrollTop = 0; } catch (e) {}
            try {
                if (tabs[idx] && tabs[idx].scrollIntoView) {
                    tabs[idx].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                }
            } catch (e) {}
        };
        for (var ti = 0; ti < tabs.length; ti++) {
            (function (idx) {
                tabs[idx].addEventListener('click', function (e) {
                    e.stopPropagation();
                    selectTab(idx);
                });
            })(ti);
        }
    }

    function bindClusterEmotions(anchorEl) {
        var emoItems = state.balloonEl.querySelectorAll('.pl-map-balloon__cluster-emotion');
        for (var e = 0; e < emoItems.length; e++) {
            emoItems[e].addEventListener('click', function () {
                var id = this.getAttribute('data-emoid');
                var em = null;
                for (var j = 0; j < state.emotions.length; j++) {
                    if (String(state.emotions[j].id) === String(id)) {
                        em = state.emotions[j];
                        break;
                    }
                }
                if (!em) return;
                closeBalloon();
                openEmotionPop(em, anchorEl);
            });
        }
    }

    function fillClusterBalloon(bodyHtml, emotionsHtml, isTabbed, anchorEl) {
        state.balloonEl.innerHTML =
            '<button type="button" class="pl-map-balloon__close" aria-label="Закрыть">&times;</button>' +
            bodyHtml + emotionsHtml;
        state.balloonEl.classList.add('pl-map-balloon--open', 'pl-map-balloon--list');
        state.balloonEl.classList.toggle('pl-map-balloon--tabs', isTabbed);
        try { state.balloonEl.scrollTop = 0; } catch (e) {}
        setBalloonActive(null);
        updateBalloonPosition();
        if (isTabbed) bindClusterTabs();
        bindClusterEmotions(anchorEl);
    }

    function openClusterList(features, clusterEl) {
        if (emotionOpenId) hideEmotionPop();
        state.balloonOpenId = 'cluster';
        state.activePinEl = clusterEl;

        var eventsFeats = features.filter(function (f) {
            return !(f.properties && f.properties.featureType === 'emotion');
        });
        var emotionFeats = features.filter(function (f) {
            return f.properties && f.properties.featureType === 'emotion';
        });

        var groups = groupClusterByPlace(eventsFeats);
        var body = clusterBodyHtml(groups, 0);
        fillClusterBalloon(body.html, clusterEmotionsHtml(emotionFeats), body.isTabbed, clusterEl);
    }

    // Тап по пину: если рядом (в радиусе) есть события РАЗНЫХ заведений —
    // показываем их вкладками сразу, активной — заведение нажатого пина.
    // Одно заведение / одно событие — как раньше, богатая карточка события.
    var PIN_NEARBY_M = 150;

    function openNearbyList(centerEvent, pinEl) {
        if (!centerEvent || !centerEvent.coordinates) return false;
        var feats = [];
        var vis = filteredEvents();
        for (var i = 0; i < vis.length; i++) {
            var ev = vis[i];
            if (ev.coordinates && coordsDistanceM(centerEvent.coordinates, ev.coordinates) <= PIN_NEARBY_M) {
                feats.push({ geometry: { coordinates: ev.coordinates }, properties: ev });
            }
        }
        var groups = groupClusterByPlace(feats);
        if (groups.length < 2) return false;

        var ckey = venueKeyOf(centerEvent);
        var activeIdx = 0;
        for (var g = 0; g < groups.length; g++) {
            if (groups[g].key === ckey) { activeIdx = g; break; }
        }

        var emotionFeats = [];
        if (state.emotionsVisible && isTodayView()) {
            for (var k = 0; k < state.emotions.length; k++) {
                var em = state.emotions[k];
                if (em && em.coords && coordsDistanceM(centerEvent.coordinates, em.coords) <= PIN_NEARBY_M) {
                    emotionFeats.push({ properties: { featureType: 'emotion', em: em } });
                }
            }
        }

        if (emotionOpenId) hideEmotionPop();
        state.balloonOpenId = 'cluster';
        state.activePinEl = pinEl;
        var body = clusterBodyHtml(groups, activeIdx);
        fillClusterBalloon(body.html, clusterEmotionsHtml(emotionFeats), body.isTabbed, pinEl);
        return true;
    }

    function toggleBalloon(event, pinEl) {
        if (state.balloonOpenId === event.id || state.activePinEl === pinEl) {
            closeBalloon();
            return;
        }
        if (openNearbyList(event, pinEl)) return;
        openBalloon(event, pinEl);
    }

    function buildBalloonContent(event) {
        var tags = '';
        if (event.tags && event.tags.length) {
            tags = '<div class="pl-map-balloon__tags">' + event.tags.map(function (t, i) {
                return '<span class="pl-map-balloon__tag" data-type="' +
                    escapeAttr(String(t.type || 'other').toLowerCase()) + '" data-index="' + i + '">' +
                    escapeHtml(t.name) + '</span>';
            }).join('') + '</div>';
        }

        var letter = (event.title && String(event.title).trim())
            ? String(event.title).trim().charAt(0).toUpperCase() : '♪';
        var isLiked = !!event.is_liked;
        var heartClass = isLiked ? 'fas' : 'far';
        var likedCls = isLiked ? ' is_liked' : '';
        var likeBtn = '<button type="button" class="pl-map-balloon__like' + likedCls + '" data-like-id="' + escapeAttr(event.id) + '" aria-label="' + (isLiked ? 'Убрать лайк' : 'Поставить лайк') + '" title="' + (isLiked ? 'Убрать лайк' : 'Поставить лайк') + '"><i class="' + heartClass + ' fa-heart" aria-hidden="true"></i></button>';
        var imgInner = '';
        if (event.image) {
            imgInner = '<img class="pl-map-balloon__img" src="' + escapeAttr(event.image) +
                '" alt="" loading="lazy" decoding="async" onerror="PermLiveMaps.balloonImgError(this)" data-paid="' + (event.paid ? '1' : '0') + '" data-letter="' + escapeAttr(letter) + '">';
        } else if (event.paid) {
            imgInner = '<div class="pl-map-balloon__avatar" title="' + escapeAttr(event.title || '') +
                '">' + escapeHtml(letter) + '</div>';
        } else {
            imgInner = '<div class="pl-map-balloon__avatar" style="background:linear-gradient(135deg,#ececec,#f5f5f5);color:#bbb" title="' + escapeAttr(event.title || '') + '"><i class="fas fa-music" aria-hidden="true"></i></div>';
        }
        var img = '';
        if (imgInner) {
            img = '<div class="pl-map-balloon__avatarwrap">' + imgInner + likeBtn + '</div>';
        }

        var price = event.price > 0 ? '<p class="pl-map-balloon__price">' + event.price + ' ₽</p>' : '';
        var free = event.price === 0 ? '<p class="pl-map-balloon__free">Вход бесплатный!</p>' : '';
        var placeText = event.place ? escapeHtml(event.place) : '';
        if (event.address) placeText += ' <span class="pl-map-balloon__address">(' + escapeHtml(event.address) + ')</span>';

        var timeText = '';
        if (event.time) {
            var todayStr = window.PermLiveMapData && window.PermLiveMapData.today;
            if (event.date && todayStr && event.date !== todayStr) {
                var parts = event.date.split('-');
                var monthGen = window.getMonthName ? window.getMonthName(+parts[1] - 1, false) : '';
                timeText = (+parts[2]) + ' ' + monthGen + ' в ' + escapeHtml(event.time);
            } else {
                timeText = 'Начало в ' + escapeHtml(event.time);
            }
        }

        var lat = event.coordinates[1];
        var lng = event.coordinates[0];
        var routeHref = 'https://yandex.ru/maps/?rtext=~' + lat + ',' + lng + '&rtt=auto';
        var aboutBtn = '<a class="pl-map-balloon__route pl-map-balloon__route--secondary" href="' + escapeAttr(event.url) + '">О событии</a>';
        var routeBtn = '<a class="pl-map-balloon__route" href="' + routeHref + '" target="_blank" rel="noopener">Маршрут</a>';

        var head = '<div class="pl-map-balloon__head">' + img + '<div class="pl-map-balloon__head-main"><h3 class="pl-map-balloon__title"><a href="' + escapeAttr(event.url) + '">' + escapeHtml(event.title) + '</a></h3>' + tags + '</div></div>';

        return '<button type="button" class="pl-map-balloon__close" aria-label="Закрыть">&times;</button>' +
            head +
            (event.place ? '<p class="pl-map-balloon__place">' + placeText + '</p>' : '') +
            price +
            (timeText ? '<p class="pl-map-balloon__time">' + timeText + '</p>' : '') +
            free +
            '<div class="pl-map-balloon__actions">' + aboutBtn + routeBtn + '</div>';
    }

    function openBalloon(event, pinEl) {
        if (emotionOpenId) hideEmotionPop();
        state.balloonOpenId = event.id;

        var livePin = (pinEl && pinEl.isConnected) ? pinEl : null;
        if (!livePin) {
            try {
                livePin = state.mapEl.querySelector('.pl-map-pin[data-id="' + String(event.id).replace(/"/g, '') + '"]');
            } catch (err) { livePin = null; }
        }
        state.activePinEl = livePin;

        state.balloonEl.innerHTML = buildBalloonContent(event);

        var likeBtn = state.balloonEl.querySelector('.pl-map-balloon__like[data-like-id]');
        if (likeBtn) {
            likeBtn.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); toggleMapLike(event, likeBtn); });
        }

        state.balloonEl.classList.add('pl-map-balloon--open');
        state.balloonEl.classList.remove('pl-map-balloon--list');
        state.balloonEl.classList.remove('pl-map-balloon--tabs');
        setBalloonActive(event.id);
        updateBalloonPosition();
        state.balloonOpenedAt = Date.now();
    }

    function getCsrfToken() {
        if (window.PermLiveMapData && window.PermLiveMapData.csrf) return window.PermLiveMapData.csrf;
        try {
            var m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
            if (m) return decodeURIComponent(m[1]);
        } catch (e) {}
        var inp = document.querySelector('[name=csrfmiddlewaretoken]');
        if (inp && inp.value) return inp.value;
        return '';
    }

    function toggleMapLike(event, btn) {
        if (!event || !btn) return;
        var csrf = getCsrfToken();
        if (!csrf) { showToast('Войдите в профиль, чтобы ставить лайки'); return; }
        btn.disabled = true;
        fetch('/like/' + encodeURIComponent(event.id) + '/', {
            method: 'POST',
            headers: { 'X-CSRFToken': csrf, 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin'
        }).then(function (r) {
            if (r.status === 403 || r.status === 401) { window.location.href = '/accounts/login/'; return null; }
            return r.json();
        }).then(function (data) {
            if (!data || typeof data.liked === 'undefined') return;
            event.is_liked = !!data.liked;
            btn.classList.toggle('is_liked', !!data.liked);
            var icon = btn.querySelector('i');
            if (icon) {
                icon.className = (data.liked ? 'fas' : 'far') + ' fa-heart';
                if (data.liked) {
                    btn.classList.remove('liked-burst'); void btn.offsetWidth; btn.classList.add('liked-burst');
                    setTimeout(function(){ btn.classList.remove('liked-burst'); }, 380);
                }
            }
            btn.setAttribute('aria-label', data.liked ? 'Убрать лайк' : 'Поставить лайк');
            btn.title = data.liked ? 'Убрать лайк' : 'Поставить лайк';

            if (typeof data.rating !== 'undefined') {
                event.rating = data.rating;
                try {
                    var newScale = pinScale(event.paid ? 5 : event.rating).toFixed(4);
                    var live = state.activePinEl && String(state.balloonOpenId) === String(event.id) ? state.activePinEl : null;
                    if (live) live.style.setProperty('--pin-scale', newScale);

                    updateClustererFeatures();

                    setTimeout(function(){
                        var fresh = state.mapEl && state.mapEl.querySelector('.pl-map-pin[data-id="' + String(event.id).replace(/"/g,'') + '"]');
                        if (fresh) { fresh.style.setProperty('--pin-scale', newScale); fresh.classList.add('is-active'); state.activePinEl = fresh; updateBalloonPosition(); }
                    }, 80);
                } catch(e){}
            }
        }).catch(function () { showToast('Не удалось поставить лайк'); })
        .then(function(){ btn.disabled = false; });
    }

    function closeBalloon() {
        if (!state.balloonOpenId) return;
        state.balloonEl.classList.remove('pl-map-balloon--open');
        state.balloonEl.classList.remove('pl-map-balloon--anchored');
        state.balloonEl.classList.remove('pl-map-balloon--list');
        state.balloonEl.classList.remove('pl-map-balloon--tabs');
        state.balloonEl.style.left = '';
        state.balloonEl.style.top = '';
        state.balloonEl.style.transform = '';
        setBalloonActive(null);
        state.balloonOpenId = null;
        state.activePinEl = null;
    }

    function setBalloonActive(id) {
        var pins = state.mapEl.querySelectorAll('.pl-map-pin');
        for (var i = 0; i < pins.length; i++) {
            var isAct = pins[i].getAttribute('data-id') === String(id);
            pins[i].classList.toggle('is-active', isAct);
            if (pins[i]._ymarker && pins[i]._lnglat) setMarkerZIndex(pins[i]._ymarker, pins[i]._lnglat, isAct);
        }
    }

    function positionBalloonNear(pinEl) {
        if (!pinEl) return;
        if (window.innerWidth <= 600) {
            state.balloonEl.classList.remove('pl-map-balloon--anchored');
            return;
        }
        var mapRect = state.mapEl.getBoundingClientRect();
        var r = pinEl.getBoundingClientRect();
        var x = r.left + r.width / 2 - mapRect.left;
        var y = r.top - mapRect.top;
        var bw = state.balloonEl.offsetWidth || 300;
        var bh = state.balloonEl.offsetHeight || 220;
        var cw = state.mapEl.clientWidth;
        var xClamped = Math.max(bw / 2 + 8, Math.min(x, cw - bw / 2 - 8));
        state.balloonEl.style.left = Math.round(xClamped) + 'px';
        var above = y - bh - 12 >= 8;
        if (above) {
            state.balloonEl.style.top = Math.round(y - 12) + 'px';
            state.balloonEl.style.transform = 'translate(-50%, -100%)';
            state.balloonEl.classList.remove('pl-map-balloon--below');
        } else {
            state.balloonEl.style.top = Math.round(y + 44) + 'px';
            state.balloonEl.style.transform = 'translate(-50%, 0)';
            state.balloonEl.classList.add('pl-map-balloon--below');
        }
        state.balloonEl.classList.add('pl-map-balloon--anchored');
    }

    function updateBalloonPosition() {
        if (state.balloonOpenId && state.activePinEl) {
            positionBalloonNear(state.activePinEl);
        }
    }

    function balloonCloseListener(e) {
        if (!state.balloonOpenId) return;
        var t = e.target;
        if (t && t.closest && t.closest('.pl-map-balloon, .pl-map-pin, .pl-map-cluster')) return;
        closeBalloon();
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escapeAttr(str) {
        return escapeHtml(str);
    }

    var EMOTION_EMOJIS = [
        { e: '😊', label: 'Радость' },
        { e: '😆', label: 'Смешно' },
        { e: '🤔', label: 'Думаю' },
        { e: '😍', label: 'Красота' },
        { e: '😡', label: 'Злюсь' },
        { e: '😢', label: 'Грустно' }
    ];

    var FLOWER_ITEMS = [
        { id: 'emotion', label: 'Оставить эмоцию', icon: '🙂', cls: 'pl-map-flower__petal--emotion' },
        { id: 'propose', label: 'Предложить событие', icon: '＋', cls: 'pl-map-flower__petal--propose' }
    ];
    var ME = (window.PermLiveMapData && window.PermLiveMapData.emotionMe) || { is_auth: false, name: '', avatar: '', is_staff: false };

    function relativeTime(createdIso) {
        if (!createdIso) return '';
        var t = new Date(createdIso);
        if (isNaN(t.getTime())) return '';
        var minutes = Math.floor((Date.now() - t.getTime()) / 60000);
        if (minutes < 5) return 'только что';
        var plural = function (n, one, few, many) {
            var m10 = n % 10, m100 = n % 100;
            if (m10 === 1 && m100 !== 11) return one;
            if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
            return many;
        };
        if (minutes < 60) {
            return 'добавлена ' + minutes + ' ' + plural(minutes, 'минуту', 'минуты', 'минут') + ' назад';
        }
        var hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return 'добавлена ' + hours + ' ' + plural(hours, 'час', 'часа', 'часов') + ' назад';
        }
        var days = Math.floor(hours / 24);
        return 'добавлена ' + days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
    }
    var emotionSelected = null;
    var emotionComposerEl = null;
    var emotionOverlayEl = null;
    var emotionPopEl = null;
    var emotionOpenId = null;

    var emotionToggleBtn = null;

    function currentDateStr() {
        return window.__PermLiveMapCurrentDate ||
            (window.PermLiveMapData && window.PermLiveMapData.defaultDate) ||
            (window.PermLiveMapData && window.PermLiveMapData.today) || '';
    }

    function getEmotionDate() {
        return (window.PermLiveMapData && window.PermLiveMapData.emotionDate) ||
               (window.PermLiveMapData && window.PermLiveMapData.today) || '';
    }

    function isTodayView() {
        var ed = getEmotionDate();
        return !!ed && currentDateStr() === ed;
    }

    var emotionSeq = 0;

    function miniCitySlug() {
        /* Миник пока одногородный (Пермь), но эмоции уже per-city на бэке:
           тянем только свой город, иначе московская эмоция блокирует пермскую. */
        try {
            var d = window.PermLiveMapData || {};
            if (d.citySlug) return String(d.citySlug);
            if (typeof window.citySlugOf === 'function') return window.citySlugOf() || 'perm';
        } catch (e) {}
        return 'perm';
    }

    function fetchEmotions() {
        var mySeq = ++emotionSeq;
        var slug = miniCitySlug();
        var emoUrl = '/api/map-emotions/?city=' + encodeURIComponent(slug);
        /* VKMINI: для миника добавляем vk_user_id, чтобы backend отдал корректный is_mine */
        try {
            var vkctx = window.PermLiveMapVk;
            if (vkctx && vkctx.vk_user_id) emoUrl += '&vk_user_id=' + encodeURIComponent(vkctx.vk_user_id);
        } catch (e) {}
        fetch(emoUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (mySeq !== emotionSeq) return;
                if (!data || !data.emotions) return;
                var list = data.emotions;
                try {
                    list = list.filter(function (em) {
                        return !em.city_slug || em.city_slug === slug;
                    });
                } catch (e2) {}
                state.emotions = list;
                applyEmotionLayer();
            })
            .catch(function () {});
    }

    function addEmotion(em) {
        if (!em) return;
        /* Ответы GET, ушедших до создания эмоции, устарели — игнорируем их,
           иначе свежая эмоция (is_mine) затрется списком без неё. */
        emotionSeq++;
        em.is_mine = true;
        try {
            var cur = miniCitySlug();
            if (em.city_slug && em.city_slug !== cur) {
                for (var k = 0; k < state.emotions.length; k++) {
                    if (String(state.emotions[k].id) === String(em.id)) {
                        state.emotions.splice(k, 1);
                        break;
                    }
                }
                applyEmotionLayer();
                return;
            }
        } catch (e) {}
        var replaced = false;
        for (var i = 0; i < state.emotions.length; i++) {
            if (String(state.emotions[i].id) === String(em.id)) {
                state.emotions[i] = em;
                replaced = true;
                break;
            }
        }
        if (!replaced) state.emotions.push(em);
        applyEmotionLayer();
    }

    function emotionLife(em) {
        var end = em.expires_at ? Date.parse(em.expires_at) : NaN;
        if (isNaN(end)) return 1;
        return Math.max(0, Math.min(1, (end - Date.now()) / EMOTION_LIFE_MS));
    }

    function emotionLikesCount(em) {
        var n = parseInt(em && (em.likes_count || 0), 10);
        return isNaN(n) || n < 0 ? 0 : n;
    }

    function emotionRepliesCount(em) {
        var n = parseInt(em && (em.replies_count || 0), 10);
        return isNaN(n) || n < 0 ? 0 : n;
    }

    function vkCtx() {
        try { return window.PermLiveMapVk || null; } catch (e) { return null; }
    }

    function vkHasAccount() {
        /* ME.is_auth выставляет app.js только для привязанных (has_user=true) */
        return !!(ME && ME.is_auth);
    }

    function vkReplyPayloadExtra() {
        var v = vkCtx() || {};
        var out = {};
        if (v.vk_user_id) out.vk_user_id = v.vk_user_id;
        if (v.vk_params) out.vk_params = v.vk_params;
        return out;
    }

    function emotionMarkerSize(em) {
        return 40 + Math.min(emotionLikesCount(em), 10) * 3;
    }

    function emotionEmojiSize(em) {
        return 20 + Math.min(emotionLikesCount(em), 10) * 1.5;
    }

    function applyEmotionSize(markerEl, em) {
        if (!markerEl || !em) return;
        var s = emotionMarkerSize(em);
        markerEl.style.width = s + 'px';
        markerEl.style.height = s + 'px';
        var emojiEl = markerEl.querySelector('.pl-map-emotion__emoji');
        if (emojiEl) emojiEl.style.fontSize = emotionEmojiSize(em) + 'px';
        var badge = markerEl.querySelector('.pl-map-emotion__likes-badge');
        var n = emotionLikesCount(em);
        if (n > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'pl-map-emotion__likes-badge';
                markerEl.appendChild(badge);
            }
            badge.textContent = '❤ ' + n;
            badge.style.display = '';
        } else if (badge) {
            badge.style.display = 'none';
        }
        var rbadge = markerEl.querySelector('.pl-map-emotion__replies-badge');
        var rn = emotionRepliesCount(em);
        if (rn > 0) {
            if (!rbadge) {
                rbadge = document.createElement('span');
                rbadge.className = 'pl-map-emotion__replies-badge';
                markerEl.appendChild(rbadge);
            }
            rbadge.textContent = '💬 ' + rn;
            rbadge.style.display = '';
        } else if (rbadge) {
            rbadge.style.display = 'none';
        }
    }

    function refreshRepliesCountUI(em) {
        var markerEl = findEmotionEl(em.id);
        if (markerEl) applyEmotionSize(markerEl, em);
        if (emotionPopEl && emotionOpenId === em.id) {
            var pill = emotionPopEl.querySelector('.pl-map-emotion-pop__replies-count');
            if (pill) {
                var cntBtn = pill.querySelector('span');
                if (cntBtn) cntBtn.textContent = emotionRepliesCount(em);
                pill.classList.toggle('has-replies', emotionRepliesCount(em) > 0);
            }
        }
    }

    function findEmotionEl(id) {
        if (!state.mapEl) return null;
        return state.mapEl.querySelector('.pl-map-emotion[data-id="em' + id + '"]');
    }

    function buildEmotionMarkerEl(em) {
        var markerEl = el('button', 'pl-map-emotion',
            '<span class="pl-map-emotion__emoji" aria-hidden="true">' + escapeHtml(em.emoji) + '</span>');
        markerEl.type = 'button';
        markerEl.setAttribute('data-id', 'em' + String(em.id));
        markerEl.title = (em.user || '') + (em.text ? ': ' + em.text : '');
        markerEl.setAttribute('aria-label', (em.user || 'Пользователь') + (em.text ? ': ' + em.text : ''));
        markerEl.__em = em;
        if (em.is_mine) {
            markerEl.classList.add('pl-map-emotion--mine');
            markerEl.appendChild(el('span', 'pl-map-emotion__mine-badge', 'Вы'));
        } else if (em.user) {
            markerEl.appendChild(el('span', 'pl-map-emotion__user-label', escapeHtml(em.user)));
        }
        markerEl.style.setProperty('--em-life', emotionLife(em).toFixed(3));
        applyEmotionSize(markerEl, em);
        return markerEl;
    }

    function myActiveEmotion() {
        var cur = miniCitySlug();
        for (var i = 0; i < state.emotions.length; i++) {
            var em = state.emotions[i];
            if (!em || !em.is_mine) continue;
            if (em.city_slug && em.city_slug !== cur) continue;
            return em;
        }
        return null;
    }

    function setEmotionsVisible(on) {
        state.emotionsVisible = on;
        saveFilterPrefs();
        syncFilterButtons();
        applyEmotionLayer();
    }

    function applyEmotionLayer(skipUpdate) {
        if (!state.map) return;
        var allowed = isTodayView();
        if (emotionToggleBtn) {
            emotionToggleBtn.style.display = allowed ? '' : 'none';
        }
        hideEmotionPop();
        if (!skipUpdate) updateClustererFeatures();
        if (allowed && state.emotionsVisible && state.emotions.length) startEmotionTimer();
        else stopEmotionTimer();
    }

    function removeEmotionMarker(id) {
        var before = state.emotions.length;
        state.emotions = state.emotions.filter(function (e) { return String(e.id) !== String(id); });
        if (before !== state.emotions.length) {
            if (String(emotionOpenId) === String(id)) hideEmotionPop();
            applyEmotionLayer();
        }
    }

    function startEmotionTimer() {
        if (state.emotionTimer) return;
        state.emotionTimer = setInterval(emotionTick, 30000);
        emotionTick();
    }

    function stopEmotionTimer() {
        if (state.emotionTimer) {
            clearInterval(state.emotionTimer);
            state.emotionTimer = null;
        }
    }

    function emotionTick() {
        if (!state.map) return;
        var any = false;
        for (var i = 0; i < state.emotions.length; i++) {
            var em = state.emotions[i];
            if (!em) continue;
            var life = emotionLife(em);
            if (life <= 0) {
                removeEmotionMarker(em.id);
                continue;
            }
            any = true;

            var liveEl = findEmotionEl(em.id);
            if (liveEl) liveEl.style.setProperty('--em-life', life.toFixed(3));
        }
        if (!any && !state.emotions.length) stopEmotionTimer();
    }

    function openEmotionPop(em, markerEl) {
        if (state.balloonOpenId) closeBalloon();
        if (emotionPopEl && emotionPopEl.parentNode) emotionPopEl.parentNode.removeChild(emotionPopEl);
        emotionPopEl = el('div', 'pl-map-balloon pl-map-emotion-pop');
        var pop = emotionPopEl;
        pop.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.classList) return;
            var likeBtn = t.closest ? t.closest('.pl-map-emotion-pop__like') : null;
            if (likeBtn) {
                toggleEmotionLike(pop.__em, likeBtn);
                return;
            }
            var repliesBtn = t.closest ? t.closest('.pl-map-emotion-pop__replies-count') : null;
            if (repliesBtn) {
                var box0 = pop.querySelector('[data-replies]');
                if (box0 && box0.scrollIntoView) { try { box0.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) {} }
                var inp0 = pop.querySelector('.pl-map-reply__input');
                if (inp0) { try { inp0.focus({ preventScroll: true }); } catch (err2) { try { inp0.focus(); } catch (err3) {} } }
                return;
            }
            if (t.classList.contains('pl-map-balloon__close')) hideEmotionPop();
            else if (t.classList.contains('pl-map-emotion-pop__delete')) {

                hideEmotionPop();
                if (pop.__em) deleteEmotion(pop.__em);
                return;
            }
            var novkBtn = t.closest ? t.closest('[data-reply-novk]') : null;
            if (novkBtn) {
                showToast('Привяжите VK-аккаунт на сайте permlive.ru, чтобы писать комментарии');
                return;
            }
            var sendBtn = t.closest ? t.closest('[data-reply-send]') : null;
            if (sendBtn) { sendEmotionReply(pop); return; }
            var editBtn = t.closest ? t.closest('[data-reply-edit]') : null;
            if (editBtn) {
                startReplyEdit(pop, editBtn.getAttribute('data-reply-edit'));
                return;
            }
            var saveBtn = t.closest ? t.closest('[data-reply-save]') : null;
            if (saveBtn) {
                saveReplyEdit(pop, saveBtn.getAttribute('data-reply-save'));
                return;
            }
            var cancelBtn = t.closest ? t.closest('[data-reply-cancel]') : null;
            if (cancelBtn) { renderEmotionReplies(pop.__em); return; }
            var delBtn2 = t.closest ? t.closest('[data-reply-del]') : null;
            if (delBtn2) {
                deleteEmotionReply(pop, delBtn2.getAttribute('data-reply-del'));
                return;
            }
        });
        pop.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var inp = e.target && e.target.classList && e.target.classList.contains('pl-map-reply__input') ? e.target : null;
                if (inp) { e.preventDefault(); sendEmotionReply(pop); }
                var editInp = e.target && e.target.classList && e.target.classList.contains('pl-map-reply__edit-input') ? e.target : null;
                if (editInp) {
                    e.preventDefault();
                    saveReplyEdit(pop, editInp.getAttribute('data-edit-id'));
                }
            }
        });
        state.mapEl.appendChild(pop);
        pop.__em = em;
        var avatar = em.avatar
            ? '<img class="pl-map-emotion-pop__avatar-img" src="' + escapeAttr(em.avatar) + '" alt="">'
            : '<span class="pl-map-emotion-pop__avatar-letter">' + escapeHtml(String(em.user || '?').charAt(0).toUpperCase()) + '</span>';

        var canDelete = !!(em.is_mine || ME.is_staff);
        var delBtn = canDelete
            ? '<button type="button" class="pl-map-emotion-pop__delete">Удалить эмоцию</button>'
            : '';
        /* VKMINI: имя — ссылкой на страницу VK, если backend отдал vk_uid */
        var userHtml = '<span class="pl-map-emotion-pop__user">' + escapeHtml(em.user || 'Пользователь') + '</span>';
        try{
            if(em.vk_uid){
                var vku = String(em.vk_uid).replace(/^-/, '');
                userHtml = '<a class="pl-map-emotion-pop__user pl-map-emotion-pop__user-link" href="https://vk.com/id' + encodeURIComponent(vku) + '" target="_blank" rel="noopener">' + escapeHtml(em.user || 'Пользователь') + '</a>';
            }
        }catch(e){}
        var likesN = emotionLikesCount(em);
        var repliesN = emotionRepliesCount(em);
        var repliesCls = repliesN > 0 ? ' has-replies' : '';
        var formHtml = vkHasAccount()
            ? '<div class="pl-map-reply__form"><input type="text" class="pl-map-reply__input" maxlength="120" placeholder="Ответить…" autocomplete="off">' +
              '<button type="button" class="pl-map-reply__send" data-reply-send aria-label="Отправить">↑</button></div>'
            : '<button type="button" class="pl-map-reply__login" data-reply-novk>Привяжите VK на сайте, чтобы ответить</button>';
        emotionPopEl.innerHTML =
            '<button type="button" class="pl-map-balloon__close" aria-label="Закрыть">&times;</button>' +
            '<div class="pl-map-emotion-pop__top">' +
            '<div class="pl-map-emotion-pop__avatar">' + avatar + '</div>' +
            '<div><span class="pl-map-emotion-pop__emoji" aria-hidden="true">' + escapeHtml(em.emoji) + '</span>' +
            userHtml + '</div>' +
            '</div>' +
            (em.text ? '<p class="pl-map-emotion-pop__text">' + escapeHtml(em.text) + '</p>' : '') +
            '<p class="pl-map-emotion-pop__meta">' + relativeTime(em.created_at) + '</p>' +
            '<div class="pl-map-emotion-pop__actions">' +
            '<button type="button" class="pl-map-emotion-pop__like' + (em.liked ? ' is-liked' : '') + '" aria-label="Поставить лайк">' +
            '<i class="fa-solid fa-heart" aria-hidden="true"></i>' +
            '<span class="pl-map-emotion-pop__like-count">' + likesN + '</span></button>' +
            '<button type="button" class="pl-map-emotion-pop__replies-count' + repliesCls + '" title="Ответы" aria-label="Ответы">' +
            '<i class="fa-solid fa-comment" aria-hidden="true"></i> <span>' + repliesN + '</span></button>' +
            '</div>' +
            '<div class="pl-map-replies" data-replies><p class="pl-map-replies__loading">Загружаем ответы…</p></div>' +
            formHtml +
            delBtn;
        emotionPopEl.classList.add('pl-map-balloon--open');
        attachSwipeClose(emotionPopEl, hideEmotionPop);
        positionEmotionPop(markerEl);
        emotionOpenId = em.id;
        fetchEmotionReplies(em);
    }

    function replyAvatarHtml(r) {
        if (r.avatar) return '<img class="pl-map-reply__avatar-img" src="' + escapeAttr(r.avatar) + '" alt="" loading="lazy">';
        return '<span class="pl-map-reply__avatar-letter">' + escapeHtml(String(r.user || '?').charAt(0).toUpperCase()) + '</span>';
    }

    function renderEmotionReplies(em) {
        if (!emotionPopEl || emotionOpenId !== em.id) return;
        var box = emotionPopEl.querySelector('[data-replies]');
        if (!box) return;
        var list = em.replies || [];
        if (!list.length) {
            box.innerHTML = '<p class="pl-map-replies__empty">Пока нет ответов — станьте первым</p>';
            return;
        }
        box.innerHTML = list.map(function (r) {
            var mine = r.is_mine ? ' pl-map-reply--mine' : '';
            var edited = r.is_edited ? '<span class="pl-map-reply__edited"> · изм.</span>' : '';
            var tools = r.can_edit
                ? '<span class="pl-map-reply__tools"><button type="button" data-reply-edit="' + r.id + '" title="Редактировать" aria-label="Редактировать">✎</button>' +
                  '<button type="button" data-reply-del="' + r.id + '" title="Удалить" aria-label="Удалить">🗑</button></span>'
                : '';
            if (r._editing) {
                return '<div class="pl-map-reply' + mine + '" data-reply="' + r.id + '">' +
                    '<div class="pl-map-reply__avatar">' + replyAvatarHtml(r) + '</div>' +
                    '<div class="pl-map-reply__body"><input type="text" class="pl-map-reply__edit-input" data-edit-id="' + r.id + '" maxlength="120" value="' + escapeAttr(r.text) + '">' +
                    '<span class="pl-map-reply__edit-btns"><button type="button" data-reply-save="' + r.id + '">Сохранить</button>' +
                    '<button type="button" data-reply-cancel>Отмена</button></span></div></div>';
            }
            return '<div class="pl-map-reply' + mine + '" data-reply="' + r.id + '">' +
                '<div class="pl-map-reply__avatar">' + replyAvatarHtml(r) + '</div>' +
                '<div class="pl-map-reply__body"><div class="pl-map-reply__head"><span class="pl-map-reply__user">' + escapeHtml(r.user || 'Пользователь') + '</span>' + tools + '</div>' +
                '<p class="pl-map-reply__text">' + escapeHtml(r.text) + '</p>' +
                '<span class="pl-map-reply__meta">' + relativeTime(r.created_at) + edited + '</span></div></div>';
        }).join('');
        try { box.scrollTop = box.scrollHeight; } catch (e) {}
    }

    function vkRepliesUrl(em, afterId) {
        var url = '/api/vk/emotion/' + String(em.id) + '/replies/';
        var v = vkCtx();
        var qs = [];
        if (v && v.vk_user_id) qs.push('vk_user_id=' + encodeURIComponent(v.vk_user_id));
        if (afterId) qs.push('after_id=' + encodeURIComponent(afterId));
        if (qs.length) url += '?' + qs.join('&');
        return url;
    }

    function fetchEmotionReplies(em) {
        fetch(vkRepliesUrl(em, 0), {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, d: d }; });
        }).then(function (res) {
            if (!res.ok || !res.d) return;
            if (emotionOpenId !== em.id) return;
            em.replies = res.d.replies || [];
            em.replies_count = (typeof res.d.replies_count !== 'undefined') ? res.d.replies_count : em.replies.length;
            renderEmotionReplies(em);
            refreshRepliesCountUI(em);
        }).catch(function () {
            if (!emotionPopEl || emotionOpenId !== em.id) return;
            var box = emotionPopEl.querySelector('[data-replies]');
            if (box) box.innerHTML = '<p class="pl-map-replies__empty">Не удалось загрузить ответы</p>';
        });
    }

    function sendEmotionReply(pop) {
        var em = pop.__em;
        if (!em) return;
        var v = vkCtx();
        if (!v || !v.vk_user_id || !vkHasAccount()) {
            showToast('Привяжите VK-аккаунт на сайте permlive.ru, чтобы писать комментарии');
            return;
        }
        var input = pop.querySelector('.pl-map-reply__input');
        var sendBtn = pop.querySelector('[data-reply-send]');
        var text = input ? input.value.trim().slice(0, 120) : '';
        if (!text) { if (input) input.focus(); return; }
        if (sendBtn) sendBtn.disabled = true;
        var body = vkReplyPayloadExtra();
        body.text = text;
        fetch('/api/vk/emotion/' + String(em.id) + '/replies/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                showToast((res.d && res.d.error) || 'Не удалось отправить');
                return;
            }
            em.replies = (em.replies || []).concat([res.d]);
            em.replies_count = (typeof res.d.replies_count !== 'undefined') ? res.d.replies_count : em.replies.length;
            if (input) input.value = '';
            renderEmotionReplies(em);
            refreshRepliesCountUI(em);
        }).catch(function () {
            showToast('Сеть недоступна, попробуйте ещё раз');
        }).then(function () {
            if (sendBtn) sendBtn.disabled = false;
        });
    }

    function startReplyEdit(pop, replyId) {
        var em = pop.__em;
        if (!em || !em.replies) return;
        for (var i = 0; i < em.replies.length; i++) em.replies[i]._editing = String(em.replies[i].id) === String(replyId);
        renderEmotionReplies(em);
        var inp = pop.querySelector('.pl-map-reply__edit-input');
        if (inp) { try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { try { inp.focus(); } catch (e2) {} } }
    }

    function saveReplyEdit(pop, replyId) {
        var em = pop.__em;
        if (!em) return;
        var v = vkCtx();
        if (!v || !v.vk_user_id || !vkHasAccount()) {
            showToast('Привяжите VK-аккаунт на сайте permlive.ru');
            return;
        }
        var inp = pop.querySelector('.pl-map-reply__edit-input[data-edit-id="' + String(replyId).replace(/"/g, '') + '"]');
        var text = inp ? inp.value.trim().slice(0, 120) : '';
        if (!text) { showToast('Напишите ответ'); return; }
        var body = vkReplyPayloadExtra();
        body.text = text;
        fetch('/api/vk/emotion-replies/' + String(replyId) + '/', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                showToast((res.d && res.d.error) || 'Не удалось сохранить');
                return;
            }
            for (var i = 0; i < em.replies.length; i++) {
                if (String(em.replies[i].id) === String(replyId)) { em.replies[i] = res.d; break; }
            }
            if (typeof res.d.replies_count !== 'undefined') em.replies_count = res.d.replies_count;
            renderEmotionReplies(em);
            refreshRepliesCountUI(em);
        }).catch(function () {
            showToast('Сеть недоступна, попробуйте ещё раз');
        });
    }

    function deleteEmotionReply(pop, replyId) {
        var em = pop.__em;
        if (!em) return;
        var v = vkCtx();
        if (!v || !v.vk_user_id || !vkHasAccount()) {
            showToast('Привяжите VK-аккаунт на сайте permlive.ru');
            return;
        }
        fetch('/api/vk/emotion-replies/' + String(replyId) + '/', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(vkReplyPayloadExtra())
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                showToast((res.d && res.d.error) || 'Не удалось удалить');
                return;
            }
            em.replies = (em.replies || []).filter(function (x) { return String(x.id) !== String(replyId); });
            if (typeof res.d.replies_count !== 'undefined') em.replies_count = res.d.replies_count;
            else em.replies_count = em.replies.length;
            renderEmotionReplies(em);
            refreshRepliesCountUI(em);
            showToast('Ответ удалён');
        }).catch(function () {
            showToast('Сеть недоступна, попробуйте ещё раз');
        });
    }

    function refreshEmotionLikeUI(em) {
        var markerEl = findEmotionEl(em.id);
        if (markerEl) {
            applyEmotionSize(markerEl, em);
            markerEl.style.setProperty('--em-life', emotionLife(em).toFixed(3));
        }
        if (emotionPopEl && emotionOpenId === em.id) {
            var btn = emotionPopEl.querySelector('.pl-map-emotion-pop__like');
            if (btn) {
                btn.classList.toggle('is-liked', !!em.liked);
                var cnt = btn.querySelector('.pl-map-emotion-pop__like-count');
                if (cnt) cnt.textContent = emotionLikesCount(em);
            }
        }
    }

    function toggleEmotionLike(em, btn) {
        if (!em) return;
        /* VKMINI: лайк через VK-эндпоинт */
        try {
            var vkd = window.PermLiveMapVk;
            if (vkd && vkd.vk_user_id) {
                if (btn) btn.disabled = true;
                fetch('/api/vk/emotion/' + String(em.id) + '/like/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ vk_user_id: vkd.vk_user_id, vk_params: vkd.vk_params || undefined })
                }).then(function (r) {
                    return r.json().then(function (d) { return { ok: r.ok, d: d }; });
                }).then(function (res) {
                    if (!res.ok) {
                        showToast((res.d && res.d.error) || 'Не удалось поставить лайк');
                        return;
                    }
                    em.liked = !!res.d.liked;
                    em.likes_count = res.d.likes_count || 0;
                    if (res.d.expires_at) em.expires_at = res.d.expires_at;
                    refreshEmotionLikeUI(em);
                    if (btn && em.liked) {
                        btn.classList.remove('liked-burst');
                        void btn.offsetWidth;
                        btn.classList.add('liked-burst');
                        setTimeout(function () { btn.classList.remove('liked-burst'); }, 400);
                    }
                    if (em.liked) showToast('Эмоция продлена на час');
                }).catch(function () {
                    showToast('Сеть недоступна, попробуйте ещё раз');
                }).then(function () {
                    if (btn) btn.disabled = false;
                });
                return;
            }
        } catch (e) {}
        if (!ME.is_auth) {
            showToast('Войдите в профиль, чтобы ставить лайки');
            return;
        }
        if (btn) btn.disabled = true;
        fetch('/api/map-emotions/' + String(em.id) + '/like/', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': (window.PermLiveMapData && window.PermLiveMapData.csrf) || ''
            }
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                showToast((res.d && res.d.error) || 'Не удалось поставить лайк');
                return;
            }
            em.liked = !!res.d.liked;
            em.likes_count = res.d.likes_count || 0;
            if (res.d.expires_at) em.expires_at = res.d.expires_at;
            refreshEmotionLikeUI(em);
            if (em.liked) showToast('Эмоция продлена на час');
        }).catch(function () {
            showToast('Сеть недоступна, попробуйте ещё раз');
        }).then(function () {
            if (btn) btn.disabled = false;
        });
    }

    function deleteEmotion(em) {
        /* VKMINI: из миника удаляем через VK-эндпоинт */
        try {
            var vkd = window.PermLiveMapVk;
            if (vkd && vkd.vk_user_id) {
                fetch('/api/vk/emotion/' + String(em.id) + '/', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ vk_user_id: vkd.vk_user_id, vk_params: vkd.vk_params || undefined })
                }).then(function (r) {
                    return r.json().then(function (d) { return { ok: r.ok, d: d }; });
                }).then(function (res) {
                    if (!res.ok) {
                        showToast((res.d && res.d.error) || 'Не удалось удалить эмоцию');
                        return;
                    }
                    removeEmotionMarker(em.id);
                    showToast('Эмоция удалена');
                }).catch(function () {
                    showToast('Сеть недоступна, попробуйте ещё раз');
                });
                return;
            }
        } catch (e) {}
        fetch('/api/map-emotions/' + String(em.id) + '/', {
            method: 'DELETE',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': (window.PermLiveMapData && window.PermLiveMapData.csrf) || ''
            }
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                showToast((res.d && res.d.error) || 'Не удалось удалить эмоцию');
                return;
            }
            removeEmotionMarker(em.id);
            showToast('Эмоция удалена');
        }).catch(function () {
            showToast('Сеть недоступна, попробуйте ещё раз');
        });
    }

    function positionEmotionPop(markerEl) {
        if (!markerEl) return;
        if (window.innerWidth <= 600) {
            emotionPopEl.classList.remove('pl-map-balloon--anchored', 'pl-map-balloon--below');
            return;
        }
        var mapRect = state.mapEl.getBoundingClientRect();
        var r = markerEl.getBoundingClientRect();
        var x = r.left + r.width / 2 - mapRect.left;
        var y = r.top - mapRect.top;
        var bw = emotionPopEl.offsetWidth || 250;
        var bh = emotionPopEl.offsetHeight || 130;
        var cw = state.mapEl.clientWidth;
        var xClamped = Math.max(bw / 2 + 8, Math.min(x, cw - bw / 2 - 8));
        emotionPopEl.style.left = Math.round(xClamped) + 'px';
        var above = y - bh - 12 >= 8;
        emotionPopEl.classList.add('pl-map-balloon--anchored');
        if (above) {
            emotionPopEl.style.top = Math.round(y - 12) + 'px';
            emotionPopEl.style.transform = 'translate(-50%, -100%)';
            emotionPopEl.classList.remove('pl-map-balloon--below');
        } else {
            emotionPopEl.style.top = Math.round(y + 34) + 'px';
            emotionPopEl.style.transform = 'translate(-50%, 0)';
            emotionPopEl.classList.add('pl-map-balloon--below');
        }
    }

    function hideEmotionPop() {
        if (emotionPopEl && emotionPopEl.parentNode) {
            try { emotionPopEl.parentNode.removeChild(emotionPopEl); } catch (err) {}
        }
        emotionPopEl = null;
        emotionOpenId = null;
    }

    function attachSwipeClose(el, onClose) {
        if (!el || el.__plSwipe) return;
        el.__plSwipe = true;

        var startY = null;
        var tracking = false;
        var dragging = false;

        function touchStart(e) {
            if (window.innerWidth > 600) return;
            if (!el.classList.contains('pl-map-balloon--open')) return;
            if (e.touches.length !== 1) return;
            if (el.scrollTop > 0) return;
            startY = e.touches[0].clientY;
            tracking = false;
            dragging = false;
            el.style.transition = 'none';
        }

        function touchMove(e) {
            if (startY === null) return;
            var dy = e.touches[0].clientY - startY;
            if (dy <= 4) {
                if (dy < -2) touchEnd();
                return;
            }
            tracking = true;
            dragging = true;
            if (e.cancelable) e.preventDefault();
            el.style.transform = 'translateY(' + Math.round(dy) + 'px)';
        }

        function touchEnd() {
            if (startY === null) return;
            var dy = dragging ? (parseFloat(el.style.transform.replace(/[^0-9.\-]/g, '')) || 0) : 0;
            var closing = tracking && (dy > 90 || dy > el.offsetHeight * 0.25);
            startY = null;
            tracking = false;
            dragging = false;
            el.style.transition = '';
            el.style.transform = '';
            if (closing) onClose();
        }

        el.addEventListener('touchstart', touchStart, { passive: true });
        el.addEventListener('touchmove', touchMove, { passive: false });
        el.addEventListener('touchend', touchEnd, { passive: true });
        el.addEventListener('touchcancel', touchEnd, { passive: true });
    }

    function buildEmotionComposer() {
        emotionOverlayEl = el('div', 'pl-map-emotion-overlay');
        emotionOverlayEl.addEventListener('click', function (e) {
            if (e) e.stopPropagation();

            if (state.composerOpenedAt && Date.now() - state.composerOpenedAt < 700) return;
            hideEmotionComposer();
        });
        state.mapEl.appendChild(emotionOverlayEl);

        emotionComposerEl = el('div', 'pl-map-emotion-composer');
        emotionComposerEl.setAttribute('role', 'dialog');
        emotionComposerEl.setAttribute('aria-modal', 'true');

        var head = el('div', 'pl-map-emotion-composer__head');
        var title = el('div', 'pl-map-emotion-composer__title', 'Ваша эмоция на карте');
        var closeBtn = el('button', 'pl-map-control-btn pl-map-emotion-composer__close', '&times;');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Закрыть');
        closeBtn.addEventListener('click', function (e) { if (e) e.stopPropagation(); hideEmotionComposer(); });
        head.appendChild(title);
        head.appendChild(closeBtn);

        var grid = el('div', 'pl-map-emotion-composer__emojis');
        EMOTION_EMOJIS.forEach(function (item) {
            var b = el('button', 'pl-map-emotion-opt',
                '<span class="pl-map-emotion-opt__e" aria-hidden="true">' + item.e + '</span>' +
                '<span class="pl-map-emotion-opt__l">' + item.label + '</span>');
            b.type = 'button';
            b.setAttribute('data-pl-emoji', item.e);
            b.addEventListener('click', function () {
                emotionSelected = item.e === emotionSelected ? null : item.e;
                var opts = grid.querySelectorAll('.pl-map-emotion-opt');
                for (var i = 0; i < opts.length; i++) {
                    opts[i].classList.toggle('pl-map-emotion-opt--sel', opts[i].getAttribute('data-pl-emoji') === emotionSelected);
                }
                submitBtn.disabled = !emotionSelected;
            });
            grid.appendChild(b);
        });

        var input = el('input', 'pl-map-emotion-composer__input');
        input.type = 'text';
        input.maxLength = 120;
        input.placeholder = 'Короткая мысль (необязательно)';
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitEmotion();
            }
        });

        var submitBtn = el('button', 'pl-map-emotion-composer__submit', 'Оставить эмоцию');
        submitBtn.type = 'button';
        submitBtn.disabled = true;
        submitBtn.addEventListener('click', submitEmotion);

        var hint = el('div', 'pl-map-emotion-composer__hint', 'Эмоция будет видна на карте 6 часов');

        emotionComposerEl.appendChild(head);
        emotionComposerEl.appendChild(grid);
        emotionComposerEl.appendChild(input);
        emotionComposerEl.appendChild(submitBtn);
        emotionComposerEl.appendChild(hint);
        state.mapEl.appendChild(emotionComposerEl);
    }

    function showEmotionComposer(ll, clientX, clientY) {
        try { hideFlower(); } catch (e) {}
        if (!ME.is_auth) {
            showToast('Войдите в профиль, чтобы оставить эмоцию на карте');
            return;
        }
        if (!isTodayView()) {
            showToast('Эмоции можно оставлять только сегодня');
            return;
        }
        if (myActiveEmotion()) {
            showToast('У вас уже есть эмоция в этом городе. Удалите её, чтобы поставить новую');
            return;
        }
        if (window.__PermLiveMapEmotionOpen) return;
        if (!emotionComposerEl) buildEmotionComposer();
        state.emotionAnchor = ll;
        state.composerScreen = [clientX, clientY];
        state.emotionAnchorCamera = (state.map && state.map.center && typeof state.map.zoom === 'number')
            ? [state.map.center[0], state.map.center[1], state.map.zoom]
            : null;
        emotionSelected = null;
        var opts = emotionComposerEl.querySelectorAll('.pl-map-emotion-opt');
        for (var i = 0; i < opts.length; i++) opts[i].classList.remove('pl-map-emotion-opt--sel');
        var input = emotionComposerEl.querySelector('.pl-map-emotion-composer__input');
        if (input) input.value = '';
        var submit = emotionComposerEl.querySelector('.pl-map-emotion-composer__submit');
        if (submit) submit.disabled = true;
        emotionComposerEl.classList.add('pl-map-emotion-composer--open');
        emotionOverlayEl.classList.add('pl-map-emotion-overlay--show');
        state.composerOpenedAt = Date.now();
        window.__PermLiveMapEmotionOpen = true;
        positionEmotionComposer(clientX, clientY);
    }

    function positionEmotionComposer(clientX, clientY) {
        if (window.innerWidth <= 600) {
            emotionComposerEl.style.left = '';
            emotionComposerEl.style.top = '';
            return;
        }
        var mapRect = state.mapEl.getBoundingClientRect();
        var cw = state.mapEl.clientWidth;
        var ch = state.mapEl.clientHeight;
        var w = emotionComposerEl.offsetWidth || 360;
        var h = emotionComposerEl.offsetHeight || 320;
        var cx = Math.max(w / 2 + 12, Math.min(clientX - mapRect.left, cw - w / 2 - 12));
        var cy = Math.max(h / 2 + 12, Math.min(clientY - mapRect.top, ch - h / 2 - 12));
        emotionComposerEl.style.left = Math.round(cx) + 'px';
        emotionComposerEl.style.top = Math.round(cy) + 'px';
    }

    function hideEmotionComposer() {
        if (!emotionComposerEl) return;
        emotionComposerEl.classList.remove('pl-map-emotion-composer--open');
        emotionOverlayEl.classList.remove('pl-map-emotion-overlay--show');
        window.__PermLiveMapEmotionOpen = false;
    }

    function submitEmotion() {
        if (!emotionSelected) return;

        var anchor = state.emotionAnchor;
        var cam = state.emotionAnchorCamera;
        var cameraStayed = !!(cam && state.map && state.map.center &&
            typeof state.map.zoom === 'number' &&
            Math.abs(state.map.center[0] - cam[0]) < 1e-9 &&
            Math.abs(state.map.center[1] - cam[1]) < 1e-9 &&
            state.map.zoom === cam[2]);
        if (!cameraStayed && state.composerScreen && screenToLngLat) {
            var fresh = screenToLngLat(state.composerScreen[0], state.composerScreen[1]);
            if (fresh) anchor = fresh;
        }
        if (!anchor) return;
        var input = emotionComposerEl.querySelector('.pl-map-emotion-composer__input');
        var text = (input && input.value ? input.value : '').trim().slice(0, 120);
        /* VKMINI: из миника постим через VK-эндпоинт (сессии нет, только vk_user_id) */
        try {
            var vkm = window.PermLiveMapVk;
            if (vkm && vkm.vk_user_id) {
                fetch('/api/vk/emotion/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ vk_user_id: vkm.vk_user_id, vk_params: vkm.vk_params || undefined, emoji: emotionSelected, text: text, coords: anchor, vk_name: vkm.vk_name || '', vk_avatar: vkm.vk_avatar || '' })
                }).then(function (r) {
                    return r.text().then(function (t) {
                        var d = null;
                        try { d = JSON.parse(t); } catch (err) {}
                        return { ok: r.ok, status: r.status, d: d };
                    });
                }).then(function (res) {
                    if (!res.ok) {
                        showToast((res.d && res.d.error) || 'Ошибка сервера (' + res.status + '), попробуйте ещё раз');
                        hideEmotionComposer();
                        return;
                    }
                    addEmotion(res.d);
                    hideEmotionComposer();
                    showToast('Готово! Эмоция появится на карте на 6 часов');
                }).catch(function () {
                    showToast('Сеть недоступна, попробуйте ещё раз');
                });
                return;
            }
        } catch (e) {}
        fetch('/api/map-emotions/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': (window.PermLiveMapData && window.PermLiveMapData.csrf) || ''
            },
            body: JSON.stringify({ emoji: emotionSelected, text: text, coords: anchor })
        }).then(function (r) {

            return r.text().then(function (t) {
                var d = null;
                try { d = JSON.parse(t); } catch (err) {  }
                return { ok: r.ok, status: r.status, d: d };
            });
        }).then(function (res) {
            if (!res.ok) {
                showToast((res.d && res.d.error) || 'Ошибка сервера (' + res.status + '), попробуйте ещё раз');
                hideEmotionComposer();
                return;
            }
            addEmotion(res.d);
            hideEmotionComposer();
            showToast('Готово! Эмоция появится на карте на 6 часов');
        }).catch(function () {
            showToast('Сеть недоступна, попробуйте ещё раз');
        });
    }

    function handleEmotionClick(el_) {
        var em = el_.__em;
        if (!em) return;

        if (emotionOpenId === em.id && emotionPopEl && emotionPopEl.parentNode) {
            hideEmotionPop();
            return;
        }
        openEmotionPop(em, el_);
    }

    function screenToLngLat(clientX, clientY) {
        if (!state.map) return null;
        var map = state.map;
        var zoom = map.zoom;
        var center = map.center;
        var projection = map.projection;
        if (typeof zoom !== 'number' || !center || !projection || !projection.toWorldCoordinates) return null;
        var rect = state.mapEl.getBoundingClientRect();
        var cw = rect.width > 0 ? rect.width : state.mapEl.clientWidth;
        var ch = rect.height > 0 ? rect.height : state.mapEl.clientHeight;
        if (cw <= 0 || ch <= 0) return null;
        try {
            var centerWorld = projection.toWorldCoordinates(center);
            var worldPerPx = 1 / (128 * Math.pow(2, zoom));
            var ll = projection.fromWorldCoordinates({
                x: centerWorld.x + (clientX - rect.left - cw / 2) * worldPerPx,
                y: centerWorld.y - (clientY - rect.top - ch / 2) * worldPerPx
            });
            return [
                Math.round(ll[0] * 1000000) / 1000000,
                Math.round(ll[1] * 1000000) / 1000000
            ];
        } catch (err) {
            return null;
        }
    }

    function closeSiteOverlays() {
        var closed = false;
        try {
            if (typeof window.__plMapSiteCloseOverlays === 'function') {
                if (window.__plMapSiteCloseOverlays()) closed = true;
            }
        } catch (e) {}
        try {
            var roots = [];
            if (state.mapEl && state.mapEl.querySelector) roots.push(state.mapEl);
            roots.push(document);
            var dd = null, mb = null, cm = null, co = null, db = null;
            for (var ri = 0; ri < roots.length; ri++) {
                var root = roots[ri];
                if (!dd) dd = root.querySelector('.pl-map-mode-dropdown--open');
                if (!mb) mb = root.querySelector('.pl-map-mode-btn--open');
                if (!cm) cm = root.querySelector('.pl-map-calendar-modal--open');
                if (!co) co = root.querySelector('.pl-map-calendar-overlay--show');
                if (!db) db = root.querySelector('.pl-map-date-btn--open');
            }
            if (dd) { dd.classList.remove('pl-map-mode-dropdown--open'); closed = true; }
            if (mb) { mb.classList.remove('pl-map-mode-btn--open'); closed = true; }
            if (cm) {
                cm.classList.remove('pl-map-calendar-modal--open');
                try { cm.setAttribute('aria-hidden', 'true'); } catch (e2) {}
                closed = true;
            }
            if (co) { co.classList.remove('pl-map-calendar-overlay--show'); closed = true; }
            if (db && cm) { db.classList.remove('pl-map-date-btn--open'); }
        } catch (e) {}
        return closed;
    }

    function closeMapPopups() {
        var any = false;
        if (state.balloonOpenId) { closeBalloon(); any = true; }
        if (emotionOpenId && emotionPopEl && emotionPopEl.parentNode) { hideEmotionPop(); any = true; }
        if (isLegendOpen()) { closeLegend(); any = true; }
        if (isFlowerOpen()) { hideFlower(); any = true; }
        if (state.proposeEl && state.proposeEl.classList.contains('pl-map-emotion-composer--open')) { hideProposeComposer(); any = true; }
        if (window.__PermLiveMapEmotionOpen) { hideEmotionComposer(); any = true; }
        clearFlowerTap();
        return any;
    }

    function getMapZoom(fallback) {
        try {
            var m = state.map;
            if (!m) return fallback;
            if (typeof m.getZoom === 'function') return m.getZoom();
            if (typeof m.zoom === 'number') return m.zoom;
            if (m.camera && typeof m.camera.zoom === 'number') return m.camera.zoom;
        } catch (e) {}
        return fallback;
    }

    function changeZoomBy(delta) {
        if (!state.map || !state.map.setLocation) return;
        var cur = getMapZoom(14);
        if (typeof cur !== 'number' || isNaN(cur)) cur = 14;
        var nz = Math.max(4, Math.min(19, cur + delta));
        try { state.map.setLocation({ zoom: nz, duration: 200 }); } catch (e) {}
    }

    function isMapUI(e) {
        var t = document.elementFromPoint(e.clientX, e.clientY);
        if (!t || !t.closest) return false;
        if (t.closest('.pl-map-pin, .pl-map-cluster, .pl-map-emotion, .pl-map-balloon, ' +
            '.pl-map-emotion-pop, .pl-map-emotion-composer, .pl-map-emotion-overlay, ' +
            '.pl-map-flower, .pl-map-flower-overlay, .pl-map-propose-composer, .pl-map-propose-overlay, ' +
            '.pl-map-date-btn, .pl-map-mode-btn, .pl-map-mode-dropdown, .pl-map-legend-modal, .pl-map-legend-overlay, ' +
            '.pl-map-controls, .pl-map-calendar-modal, .pl-map-calendar-overlay')) return true;

        if (t.closest('[class*="controls"], [class*="copyright"], [class*="logo"], a[href*="yandex"]')) return true;

        if (t.closest('#map button, #map a') ) {
            if (!t.closest('.pl-map-pin, .pl-map-cluster, .pl-map-emotion')) return true;
        }
        return false;
    }

    /* Селектор интерфейса поверх карты: календарь, кнопки, балуны, композеры.
       Тап по нему не должен уходить пинам/кластерам, даже если те геометрически
       под интерфейсом (elementsFromPoint их находит сквозь модалку). */
    var MAP_UI_SEL = '.pl-map-balloon, .pl-map-emotion-pop, .pl-map-emotion-composer, .pl-map-emotion-overlay, ' +
        '.pl-map-flower, .pl-map-flower-overlay, .pl-map-propose-composer, .pl-map-propose-overlay, ' +
        '.pl-map-controls, .pl-map-date-btn, .pl-map-mode-btn, .pl-map-mode-dropdown, ' +
        '.pl-map-calendar-modal, .pl-map-calendar-overlay, .pl-map-legend-modal, .pl-map-legend-overlay';
    function overlayTarget(t) {
        if (!t || !t.closest) return false;
        if (t.closest('.pl-map-pin, .pl-map-cluster, .pl-map-emotion')) return false;
        return !!t.closest(MAP_UI_SEL);
    }

    var flowerTap = null;
    function clearFlowerTap() { flowerTap = null; }

    function buildFlower() {
        if (state.flowerOverlayEl) return;
        state.flowerOverlayEl = el('div', 'pl-map-flower-overlay');
        state.flowerOverlayEl.addEventListener('click', function (e) { e.stopPropagation(); hideFlower(); });
        state.mapEl.appendChild(state.flowerOverlayEl);
        state.flowerEl = el('div', 'pl-map-flower');
        state.flowerEl.setAttribute('role', 'menu');
        var center = el('div', 'pl-map-flower__center');
        center.setAttribute('aria-hidden', 'true');
        state.flowerEl.appendChild(center);
        FLOWER_ITEMS.forEach(function (item) {
            var btn = el('button', 'pl-map-flower__petal ' + (item.cls || ''));
            btn.type = 'button';
            btn.setAttribute('role', 'menuitem');
            btn.setAttribute('data-flower-id', item.id);
            btn.setAttribute('aria-label', item.label);
            btn.innerHTML = '<span class="pl-map-flower__petal-icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>' +
                '<span class="pl-map-flower__petal-label">' + escapeHtml(item.label) + '</span>';
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = this.getAttribute('data-flower-id');
                handleFlowerPick(id);
            });
            state.flowerEl.appendChild(btn);
        });
        state.mapEl.appendChild(state.flowerEl);
    }

    function handleFlowerPick(id) {
        var ll = state.flowerAnchor && state.flowerAnchor.slice();
        var sx = state.flowerScreen ? state.flowerScreen[0] : 0;
        var sy = state.flowerScreen ? state.flowerScreen[1] : 0;
        hideFlower();
        if (id === 'emotion') {
            if (!ll) return;

            if (!ME.is_auth) { showToast('Войдите в профиль, чтобы оставить эмоцию на карте'); return; }
            if (!isTodayView()) { showToast('Эмоции можно оставлять только сегодня'); return; }
            if (myActiveEmotion()) { showToast('У вас уже есть эмоция на карте. Удалите её, чтобы поставить новую'); return; }
            if (window.__PermLiveMapEmotionOpen) return;
            var fresh = ll;
            showEmotionComposer(fresh, sx, sy);
        } else if (id === 'propose') {
            showProposeComposer(ll, sx, sy);
        }
    }

    function showFlower(ll, clientX, clientY) {
        if (!state.mapEl || !ll) return;
        buildFlower();
        state.flowerAnchor = ll.slice();
        state.flowerScreen = [clientX, clientY];

        var rect = state.mapEl.getBoundingClientRect();
        var cx = clientX - rect.left;
        var cy = clientY - rect.top;

        var radius = window.innerWidth <= 600 ? 64 : 78;
        var pad = radius + 48;
        var cw = state.mapEl.clientWidth, ch = state.mapEl.clientHeight;
        cx = Math.max(pad, Math.min(cx, cw - pad));
        cy = Math.max(pad, Math.min(cy, ch - pad));
        state.flowerEl.style.left = Math.round(cx) + 'px';
        state.flowerEl.style.top = Math.round(cy) + 'px';

        var petals = state.flowerEl.querySelectorAll('.pl-map-flower__petal');
        var n = petals.length;
        var step = n ? 360 / n : 0;
        var start = -90;
        for (var i = 0; i < petals.length; i++) {
            var ang = (start + step * i) * Math.PI / 180;
            var fx = Math.cos(ang) * radius;
            var fy = Math.sin(ang) * radius;
            petals[i].style.setProperty('--fx', Math.round(fx) + 'px');
            petals[i].style.setProperty('--fy', Math.round(fy) + 'px');

            petals[i].style.transform = 'translate(calc(-50% + var(--fx)), calc(-50% + var(--fy))) scale(0.6)';
        }
        state.flowerOverlayEl.classList.add('pl-map-flower-overlay--show');
        state.flowerEl.classList.add('pl-map-flower--open');

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var petals2 = state.flowerEl.querySelectorAll('.pl-map-flower__petal');
                for (var j = 0; j < petals2.length; j++) {
                    petals2[j].style.transform = 'translate(calc(-50% + var(--fx)), calc(-50% + var(--fy))) scale(1)';
                    petals2[j].style.opacity = '1';
                }
            });
        });

        setTimeout(function () {
            document.addEventListener('keydown', flowerEsc, { once: false });
        }, 0);
    }

    function flowerEsc(e) {
        if (e.key === 'Escape') { hideFlower(); hideProposeComposer(); hideEmotionComposer(); }
    }

    function hideFlower() {
        if (state.flowerEl) {
            state.flowerEl.classList.remove('pl-map-flower--open');
            var petals = state.flowerEl.querySelectorAll('.pl-map-flower__petal');
            for (var i = 0; i < petals.length; i++) {
                petals[i].style.opacity = '';
                petals[i].style.transform = '';
            }
        }
        if (state.flowerOverlayEl) state.flowerOverlayEl.classList.remove('pl-map-flower-overlay--show');
        state.flowerAnchor = null;
        state.flowerScreen = null;
        document.removeEventListener('keydown', flowerEsc);
    }

    function isFlowerOpen() {
        return !!(state.flowerEl && state.flowerEl.classList.contains('pl-map-flower--open'));
    }

    function buildProposeComposer() {
        if (state.proposeEl) return;
        state.proposeOverlayEl = el('div', 'pl-map-emotion-overlay pl-map-propose-overlay');
        state.proposeOverlayEl.addEventListener('click', function (e) { e.stopPropagation(); hideProposeComposer(); });
        state.mapEl.appendChild(state.proposeOverlayEl);
        state.proposeEl = el('div', 'pl-map-emotion-composer pl-map-propose-composer');
        state.proposeEl.setAttribute('role', 'dialog');
        state.proposeEl.setAttribute('aria-modal', 'true');
        var head = el('div', 'pl-map-emotion-composer__head');
        var title = el('div', 'pl-map-emotion-composer__title', 'Предложить событие');
        var closeBtn = el('button', 'pl-map-control-btn pl-map-emotion-composer__close', '&times;');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Закрыть');
        closeBtn.addEventListener('click', function (e) { if (e) e.stopPropagation(); hideProposeComposer(); });
        head.appendChild(title);
        head.appendChild(closeBtn);
        var input = el('input', 'pl-map-emotion-composer__input pl-map-propose-input');
        input.type = 'text';
        input.placeholder = 'Ссылка на событие (VK, Яндекс Афиша и т.д.)';
        input.setAttribute('inputmode', 'url');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submitPropose(); }
            if (e.key === 'Escape') hideProposeComposer();
        });
        var submitBtn = el('button', 'pl-map-emotion-composer__submit pl-map-propose-submit', 'Отправить на проверку');
        submitBtn.type = 'button';
        submitBtn.addEventListener('click', function (e) { if (e) e.stopPropagation(); submitPropose(); });
        var hint = el('div', 'pl-map-propose-composer__hint', 'Скинь ссылку — проверим и добавим в афишу');
        var alt = el('div', 'pl-map-propose-composer__hint');
        alt.innerHTML = '<a href="/add/" style="color:#e14425;text-decoration:none">Открыть полную форму &rarr;</a>';
        state.proposeEl.appendChild(head);
        state.proposeEl.appendChild(input);
        state.proposeEl.appendChild(submitBtn);
        state.proposeEl.appendChild(hint);
        state.proposeEl.appendChild(alt);
        state.mapEl.appendChild(state.proposeEl);
        attachSwipeClose(state.proposeEl, hideProposeComposer);
    }

    function showProposeComposer(ll, clientX, clientY) {
        buildProposeComposer();

        state.flowerAnchor = ll ? ll.slice() : null;
        var input = state.proposeEl.querySelector('.pl-map-propose-input');
        if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 80); }
        state.proposeEl.classList.add('pl-map-emotion-composer--open');
        state.proposeOverlayEl.classList.add('pl-map-emotion-overlay--show');
        positionProposeComposer(clientX, clientY);
    }

    function positionProposeComposer(clientX, clientY) {
        if (!state.proposeEl || window.innerWidth <= 600) {
            if (state.proposeEl) { state.proposeEl.style.left = ''; state.proposeEl.style.top = ''; }
            return;
        }
        var mapRect = state.mapEl.getBoundingClientRect();
        var cw = state.mapEl.clientWidth, ch = state.mapEl.clientHeight;
        var w = state.proposeEl.offsetWidth || 360, h = state.proposeEl.offsetHeight || 260;
        var cx = clientX ? clientX - mapRect.left : cw / 2;
        var cy = clientY ? clientY - mapRect.top : ch / 2;
        cx = Math.max(w / 2 + 12, Math.min(cx, cw - w / 2 - 12));
        cy = Math.max(h / 2 + 12, Math.min(cy, ch - h / 2 - 12));
        state.proposeEl.style.left = Math.round(cx) + 'px';
        state.proposeEl.style.top = Math.round(cy) + 'px';
    }

    function hideProposeComposer() {
        if (!state.proposeEl) return;
        state.proposeEl.classList.remove('pl-map-emotion-composer--open');
        if (state.proposeOverlayEl) state.proposeOverlayEl.classList.remove('pl-map-emotion-overlay--show');
    }

    function submitPropose() {
        if (!state.proposeEl) return;
        var input = state.proposeEl.querySelector('.pl-map-propose-input');
        var link = input ? input.value.trim() : '';
        if (!link) { showToast('Вставь ссылку на событие'); if (input) input.focus(); return; }
        /* VKMINI: из миника отправляем через VK propose (только привязанные); /add/ с github.io не сработает */
        try {
            if (window.vkBridge) {
                var vkp = window.PermLiveMapVk;
                if (!vkp || !vkp.vk_user_id) {
                    showToast('Войдите на permlive.ru через VK, чтобы предлагать события');
                    return;
                }
                var pbtn = state.proposeEl.querySelector('.pl-map-propose-submit');
                if (pbtn) { pbtn.disabled = true; pbtn.textContent = 'Отправляем…'; }
                fetch('/api/vk/propose/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ link: link, vk_user_id: vkp.vk_user_id, vk_name: vkp.vk_name || '', vk_params: vkp.vk_params || undefined })
                }).then(function (r) {
                    return r.text().then(function (t) {
                        var d = null;
                        try { d = JSON.parse(t); } catch (err) {}
                        return { ok: r.ok, d: d };
                    });
                }).then(function (res) {
                    if (res.ok && res.d && (res.d.ok || res.d.error === 'duplicate' || res.d.error === 'in_db')) {
                        hideProposeComposer();
                        showToast(res.d.error ? 'Такое событие уже предложили — скоро проверим' : 'Спасибо! Проверим и добавим событие в афишу');
                    } else {
                        showToast((res.d && (res.d.message || res.d.error)) || 'Не удалось отправить. Проверь ссылку');
                    }
                }).catch(function () {
                    showToast('Сеть недоступна, попробуй ещё раз');
                }).then(function () {
                    if (pbtn) { pbtn.disabled = false; pbtn.textContent = 'Отправить на проверку'; }
                });
                return;
            }
        } catch (e) {}
        var btn = state.proposeEl.querySelector('.pl-map-propose-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
        var csrf = (window.PermLiveMapData && window.PermLiveMapData.csrf) || '';
        var body = new URLSearchParams();
        body.set('link', link);
        body.set('hp_website', '');
        body.set('csrfmiddlewaretoken', csrf);
        fetch('/add/', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrf,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString(),
            credentials: 'same-origin'
        }).then(function (r) {
            var url = r.url || '';
            var ok = r.ok;

            if (url.indexOf('result=added') !== -1) {
                hideProposeComposer();
                showToast('Спасибо! Проверим и добавим событие в афишу');
            } else if (url.indexOf('result=duplicate') !== -1) {
                hideProposeComposer();
                showToast('Это событие уже предложили — скоро проверим');
            } else if (url.indexOf('result=in_db') !== -1) {
                hideProposeComposer();
                showToast('Это событие уже в базе, скоро опубликуем');
            } else if (url.indexOf('result=published') !== -1) {
                hideProposeComposer();
                showToast('Это событие уже опубликовано на сайте');
            } else if (url.indexOf('result=error') !== -1) {
                var m = url.match(/[?&]code=([^&]+)/);
                var code = m ? decodeURIComponent(m[1]) : '';
                var msgs = { empty: 'Вставь ссылку на событие', invalid: 'Похоже, это не ссылка. Проверь её', rate: 'Можно не более 3 ссылок в час. Попробуй позже' };
                showToast(msgs[code] || 'Не удалось отправить. Проверь ссылку');
            } else if (!ok) {
                showToast('Ошибка сервера (' + r.status + '), попробуй ещё раз');
            } else {
                hideProposeComposer();
                showToast('Спасибо! Ссылка отправлена');
            }
        }).catch(function () {
            showToast('Сеть недоступна, попробуй ещё раз');
        }).then(function () {
            if (btn) { btn.disabled = false; btn.textContent = 'Отправить на проверку'; }
        });
    }

    function showToast(msg) {
        if (!state.mapEl) return;
        var toast = state.mapEl.querySelector('.pl-map-toast');
        if (!toast) {
            toast = el('div', 'pl-map-toast');
            state.mapEl.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('pl-map-toast--show');
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(function () {
            toast.classList.remove('pl-map-toast--show');
        }, 4500);
    }

    function saveUserLocation(ll) {
        try {
            localStorage.setItem(LOCATION_KEY, JSON.stringify({ coords: ll, ts: Date.now() }));
        } catch (e) {}
    }

    function loadUserLocation() {
        try {
            var raw = localStorage.getItem(LOCATION_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || !data.coords || !data.ts) return null;
            if (Date.now() - data.ts > LOCATION_TTL) return null;
            return data.coords;
        } catch (e) { return null; }
    }

    function addUserMarker(ll) {
        state.userCoords = ll;
        if (state.userMarker) {
            state.userMarker.update({ coordinates: ll });
            return;
        }
        var markerEl = el('div', 'pl-map-user-marker');
        markerEl.innerHTML = '<div class="pl-map-user-dot"></div><div class="pl-map-user-pulse"></div>';
        markerEl.title = 'Вы здесь';
        state.userMarker = new window.PermLiveMaps.YMapMarker({
            coordinates: ll,
            draggable: true,
            onDragEnd: function () {
                var pos = state.userMarker && state.userMarker.coordinates;
                if (pos && pos.length === 2) {
                    state.userCoords = pos;
                    saveUserLocation(pos);
                }
            }
        }, markerEl);
        state.map.addChild(state.userMarker);
    }

    function requestUserLocation(center, silent) {
        function notify(msg) {
            if (!silent) showToast(msg);
        }
        function centerAt(ll) {
            if (center && state.map) {
                state.map.setLocation({ center: ll, zoom: 15, duration: 400, easing: 'ease-in-out' });
            }
        }
        var cached = loadUserLocation();
        if (cached) {
            addUserMarker(cached);
            centerAt(cached);
            return;
        }
        if (!navigator.geolocation) {
            notify('Геолокация не поддерживается этим браузером');
            return;
        }
        if (window.isSecureContext === false) {
            notify('Геолокация работает только по HTTPS (защищённое соединение)');
            return;
        }
        notify('Определяем местоположение…');
        navigator.geolocation.getCurrentPosition(function (pos) {
            var ll = [pos.coords.longitude, pos.coords.latitude];
            addUserMarker(ll);
            saveUserLocation(ll);
            centerAt(ll);
            notify('Вы здесь');
        }, function (err) {
            var msg = 'Не удалось определить местоположение';
            if (err && err.code === 1) {
                msg = 'Доступ к геолокации запрещён — разрешите его в настройках браузера';
            } else if (err && err.code === 2) {
                msg = 'Геолокация недоступна (нет сигнала GPS/сети)';
            } else if (err && err.code === 3) {
                msg = 'Не удалось определить местоположение (таймаут)';
            }
            notify(msg);
        }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 600000 });
    }

    function svhHeight() {
        try {
            var probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;pointer-events:none;z-index:-1';
            document.body.appendChild(probe);
            var h = probe.offsetHeight;
            probe.parentNode.removeChild(probe);
            return h || 0;
        } catch (err) {
            return 0;
        }
    }

    function safeAreaInsetBottom() {
        try {
            var probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;padding-bottom:env(safe-area-inset-bottom,0px)';
            document.body.appendChild(probe);
            var v = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
            probe.parentNode.removeChild(probe);
            return v;
        } catch (err) {
            return 0;
        }
    }

    function setMapHeight() {
        var mapEl = document.getElementById('map');
        if (!mapEl) return;
        var headerHeight = 64;
        var isFs = document.body.classList.contains('pl-map-fs');
        var headEl = document.querySelector('.map-page-head');
        var headHeight = headEl ? headEl.offsetHeight : 0;
        var topOffset = isFs ? 0 : headerHeight;

        var svh = svhHeight();
        var layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
        var vv = window.visualViewport;
        var bottomReserve = safeAreaInsetBottom();

        if (svh > 0 && layoutH > svh) {
            bottomReserve += (layoutH - svh);
        }
        var vh;
        if (svh > 0) {

            vh = svh;
        } else if (vv && vv.height) {

            vh = (vv.offsetTop || 0) + vv.height;
        } else {
            vh = layoutH;
        }

        var top = topOffset + headHeight;
        var mapHeight = Math.max(vh - top - bottomReserve, 240);
        document.body.style.setProperty('--header-height', headerHeight + 'px');

        if (mapEl.style.height !== mapHeight + 'px' ||
            mapEl.style.top !== top + 'px' ||
            mapEl.style.getPropertyValue('--pl-map-bottom') !== bottomReserve + 'px') {
            mapEl.style.height = mapHeight + 'px';
            mapEl.style.top = top + 'px';

            mapEl.style.setProperty('--pl-map-bottom', bottomReserve + 'px');
        }

        document.documentElement.style.height = '100%';
        if (document.body.style.height !== vh + 'px') document.body.style.height = vh + 'px';
        document.body.style.overflow = 'hidden';
    }

    /* ---------- Легенда карты (только просмотр, фильтры не трогает) ---------- */
    var legendModal = null;
    var legendOverlay = null;

    function isLegendOpen() {
        return !!(legendModal && legendModal.classList.contains('pl-map-legend-modal--open'));
    }

    function legendRow(color, label, count, extraCls) {
        var cnt = (typeof count === 'number' && count > 0)
            ? '<span class="pl-map-legend__count">' + count + '</span>' : '';
        return '<div class="pl-map-legend__row' + (extraCls ? ' ' + extraCls : '') + '">' +
            '<span class="pl-map-legend__dot" style="background:' + escapeAttr(color) + '"></span>' +
            '<span class="pl-map-legend__label">' + escapeHtml(label) + '</span>' + cnt + '</div>';
    }

    function openLegend() {
        closeBalloon();
        if (emotionOpenId) hideEmotionPop();
        if (!legendModal) {
            legendOverlay = el('div', 'pl-map-legend-overlay');
            legendOverlay.addEventListener('click', function () { closeLegend(); });
            legendModal = el('div', 'pl-map-legend-modal');
            legendModal.setAttribute('role', 'dialog');
            legendModal.setAttribute('aria-label', 'Легенда карты');
            document.body.appendChild(legendOverlay);
            document.body.appendChild(legendModal);
        }
        var avail = getTypeAvailability();
        var emotionCount = (state.emotionsVisible && isTodayView()) ? state.emotions.length : 0;
        var rows = '';
        for (var k = 0; k < FILTER_TYPES.length; k++) {
            var key = FILTER_TYPES[k];
            rows += legendRow(GENRE_COLORS[key], GENRE_LABELS[key], avail.counts[key]);
        }
        rows += legendRow(GENRE_COLORS.other, GENRE_LABELS.other, null);
        rows += legendRow('#8b5cf6', 'Эмоции', emotionCount, 'pl-map-legend__row--emotion');
        legendModal.innerHTML =
            '<button type="button" class="pl-map-legend-modal__close" aria-label="Закрыть легенду">&times;</button>' +
            '<div class="pl-map-legend-modal__title">Что означают цвета</div>' + rows;
        var closeBtn = legendModal.querySelector('.pl-map-legend-modal__close');
        if (closeBtn) closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            closeLegend();
        });
        legendOverlay.classList.add('pl-map-legend-overlay--show');
        legendModal.classList.add('pl-map-legend-modal--open');
        legendModal.setAttribute('aria-hidden', 'false');
    }

    function closeLegend() {
        var closed = false;
        if (legendModal && legendModal.classList.contains('pl-map-legend-modal--open')) {
            legendModal.classList.remove('pl-map-legend-modal--open');
            legendModal.setAttribute('aria-hidden', 'true');
            closed = true;
        }
        if (legendOverlay && legendOverlay.classList.contains('pl-map-legend-overlay--show')) {
            legendOverlay.classList.remove('pl-map-legend-overlay--show');
            closed = true;
        }
        return closed;
    }

    function buildControls() {
        var controls = el('div', 'pl-map-controls');

        var geoBtn = el('button', 'pl-map-control-btn', '<i class="fas fa-location-crosshairs" aria-hidden="true"></i>');
        geoBtn.type = 'button';
        geoBtn.title = 'Моё местоположение';
        geoBtn.setAttribute('aria-label', 'Показать моё местоположение');
        geoBtn.addEventListener('click', function () {
            requestUserLocation(true);
        });
        controls.appendChild(geoBtn);

        var fsBtn = el('button', 'pl-map-control-btn', '<i class="fas fa-expand" aria-hidden="true"></i>');
        fsBtn.type = 'button';
        fsBtn.title = 'Полноэкранный режим';
        fsBtn.setAttribute('aria-label', 'Полноэкранный режим');
        fsBtn.addEventListener('click', function () {
            var isFs = document.body.classList.toggle('pl-map-fs');
            fsBtn.innerHTML = isFs ? '<i class="fas fa-compress" aria-hidden="true"></i>' : '<i class="fas fa-expand" aria-hidden="true"></i>';
            setMapHeight();
        });
        controls.appendChild(fsBtn);

        var filterDefs = [
            { key: 'music', label: 'Музыка', cls: 'pl-map-filter-btn--music', icon: '<i class="fas fa-guitar" aria-hidden="true"></i>' },
            { key: 'stage', label: 'Кино и сцена', cls: 'pl-map-filter-btn--stage', icon: '<i class="fas fa-clapperboard" aria-hidden="true"></i>' },
            { key: 'talk', label: 'Юмор и игры', cls: 'pl-map-filter-btn--talk', icon: '<i class="fas fa-microphone" aria-hidden="true"></i>' },
            { key: 'expo', label: 'Выставки и знания', cls: 'pl-map-filter-btn--expo', icon: '<i class="fas fa-landmark" aria-hidden="true"></i>' }
        ];
        for (var fi = 0; fi < filterDefs.length; fi++) {
            (function (def) {
                var btn = el('button', 'pl-map-control-btn pl-map-filter-btn ' + def.cls, def.icon);
                btn.type = 'button';
                btn.setAttribute('aria-label', def.label + ' — фильтр событий');
                btn.setAttribute('aria-pressed', state.filters[def.key] ? 'true' : 'false');
                if (state.filters[def.key]) btn.classList.add('is-active');
                btn.title = def.label + ': ' + (state.filters[def.key] ? 'показаны' : 'скрыты');
                btn.addEventListener('click', function () {
                    var on = !state.filters[def.key];
                    state.filters[def.key] = on;
                    applyFilterChange();
                });
                state.filterBtns[def.key] = btn;
                controls.appendChild(btn);
            })(filterDefs[fi]);
        }

        var emoBtn = el('button', 'pl-map-control-btn pl-map-emotions-toggle', '<span aria-hidden="true">🙂</span>');
        emoBtn.type = 'button';
        emoBtn.title = 'Эмоции на карте: включены';
        emoBtn.setAttribute('aria-label', 'Показать/скрыть эмоции на карте');
        if (state.emotionsVisible) emoBtn.classList.add('is-active');
        emotionToggleBtn = emoBtn;
        state.filterBtns['emotions'] = emoBtn;
        emoBtn.addEventListener('click', function () {
            var on = !state.emotionsVisible;
            setEmotionsVisible(on);
        });
        controls.appendChild(emoBtn);

        // Легенда карты: только просмотр (фильтры — отдельными кнопками выше).
        var legendBtn = el('button', 'pl-map-control-btn pl-map-legend-btn', '<i class="fas fa-circle-question" aria-hidden="true"></i>');
        legendBtn.type = 'button';
        legendBtn.title = 'Легенда карты: что означает каждый цвет';
        legendBtn.setAttribute('aria-label', 'Открыть легенду карты');
        legendBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (isLegendOpen()) closeLegend();
            else openLegend();
        });
        controls.appendChild(legendBtn);

        var zoomIn = el('button', 'pl-map-control-btn pl-map-zoom-btn pl-map-zoom-btn--in', '<i class="fas fa-plus" aria-hidden="true"></i>');
        zoomIn.type = 'button';
        zoomIn.title = 'Приблизить';
        zoomIn.setAttribute('aria-label', 'Приблизить карту');
        zoomIn.addEventListener('click', function () { changeZoomBy(1); });
        controls.appendChild(zoomIn);

        var zoomOut = el('button', 'pl-map-control-btn pl-map-zoom-btn pl-map-zoom-btn--out', '<i class="fas fa-minus" aria-hidden="true"></i>');
        zoomOut.type = 'button';
        zoomOut.title = 'Отдалить';
        zoomOut.setAttribute('aria-label', 'Отдалить карту');
        zoomOut.addEventListener('click', function () { changeZoomBy(-1); });
        controls.appendChild(zoomOut);
        syncFilterButtons();

        return controls;
    }

    function buildBalloon() {
        var balloon = el('div', 'pl-map-balloon');
        balloon.addEventListener('click', function (e) {
            if (e.target && e.target.classList && e.target.classList.contains('pl-map-balloon__close')) {
                closeBalloon();
            }
        });
        return balloon;
    }

    function clusterBounds(features) {
        var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (var i = 0; i < features.length; i++) {
            var c = features[i].geometry.coordinates;
            if (c[0] < minLng) minLng = c[0];
            if (c[0] > maxLng) maxLng = c[0];
            if (c[1] < minLat) minLat = c[1];
            if (c[1] > maxLat) maxLat = c[1];
        }
        return [[minLng, minLat], [maxLng, maxLat]];
    }

    function clusterCenter(features) {
        var sum = [0, 0];
        for (var i = 0; i < features.length; i++) {
            var c = features[i].geometry.coordinates;
            sum[0] += c[0];
            sum[1] += c[1];
        }
        return [sum[0] / features.length, sum[1] / features.length];
    }

    function pixelRadiusForZoom(zoom) {
        if (zoom >= 15) return 70;
        if (zoom >= 14) return 85;
        if (zoom >= 13) return 95;
        if (zoom >= 12) return 110;
        if (zoom >= 11) return 115;
        return 120;
    }

    function markerZIndex(lnglat) {
        var lat = lnglat[1], lng = lnglat[0];
        return Math.round((90 - lat) * 1e4 + (lng + 180) * 10);
    }
    function setMarkerZIndex(marker, lnglat, boost) {
        if (!marker) return;
        try {
            var z = markerZIndex(lnglat) + (boost ? 100000 : 0);
            if (marker.update) marker.update({ zIndex: z });

            if (marker.element) marker.element.style.zIndex = String(z);
        } catch (e) {}
    }

    function pickElAtPoint(x, y, selector) {
        var els;
        try { els = document.elementsFromPoint(x, y); } catch (e) { els = []; }
        var candidates = [];
        for (var i = 0; i < els.length; i++) {
            if (els[i].matches && els[i].matches(selector)) {
                if (candidates.indexOf(els[i]) === -1) candidates.push(els[i]);
            } else if (els[i].closest) {
                var c = els[i].closest(selector);
                if (c && candidates.indexOf(c) === -1) candidates.push(c);
            }
        }
        if (!candidates.length) {
            try {
                var single = document.elementFromPoint(x, y);
                if (single) {
                    var sc = single.closest ? single.closest(selector) : null;
                    if (sc) candidates = [sc];
                    else if (single.matches && single.matches(selector)) candidates = [single];
                }
            } catch (e) {}
        }
        if (!candidates.length) return null;
        if (candidates.length === 1) return candidates[0];
        var best = candidates[0], bestD = Infinity;
        for (var k = 0; k < candidates.length; k++) {
            var r = candidates[k].getBoundingClientRect();
            var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            var dx = cx - x, dy = cy - y;
            var d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = candidates[k]; }
        }
        return best;
    }

    function clusterByPixelDistance(px) {
        return {
            render: function (ctx) {
                var map = ctx.map;
                var features = ctx.features;
                // Эмоции — всегда отдельными маркерами, вне кластеров.
                var soloEmotions = [];
                var pool = [];
                for (var fi = 0; fi < features.length; fi++) {
                    var fpr = features[fi].properties || {};
                    if (fpr.featureType === 'emotion') soloEmotions.push(features[fi]);
                    else pool.push(features[fi]);
                }
                features = pool;
                var projection = map.projection;
                var worldPerPx = 1 / (128 * Math.pow(2, map.zoom));
                var r = (typeof px === 'function' ? px(map.zoom) : px) * worldPerPx;
                var r2 = r * r;
                var cellSize = Math.max(r, 1e-9);

                var pts = [];
                for (var i = 0; i < features.length; i++) {
                    var w = projection.toWorldCoordinates(features[i].geometry.coordinates);
                    pts.push({ feature: features[i], x: w.x, y: w.y, idx: i });
                }

                var parent = pts.map(function (p) { return p.idx; });
                function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
                function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

                var grid = {};
                for (var k = 0; k < pts.length; k++) {
                    var p = pts[k];
                    var cx = Math.floor(p.x / cellSize);
                    var cy = Math.floor(p.y / cellSize);
                    for (var nx = cx - 1; nx <= cx + 1; nx++) {
                        for (var ny = cy - 1; ny <= cy + 1; ny++) {
                            var list = grid[nx + ':' + ny];
                            if (!list) continue;
                            for (var m = 0; m < list.length; m++) {
                                var o = list[m];
                                var dx = o.x - p.x;
                                var dy = o.y - p.y;
                                if (dx * dx + dy * dy <= r2) union(p.idx, o.idx);
                            }
                        }
                    }
                    (grid[cx + ':' + cy] = grid[cx + ':' + cy] || []).push(p);
                }

                var groups = {};
                for (var g = 0; g < pts.length; g++) {
                    var root = find(pts[g].idx);
                    (groups[root] = groups[root] || []).push(pts[g]);
                }

                var out = [];
                // Эмоции вне кластера — отдельными маркерами как есть
                for (var se = 0; se < soloEmotions.length; se++) {
                    out.push({ lnglat: soloEmotions[se].geometry.coordinates, clusterId: String(soloEmotions[se].id), features: [soloEmotions[se]] });
                }
                Object.keys(groups).forEach(function (root) {
                    var group = groups[root];
                    if (group.length === 1) {
                        var single = group[0].feature;
                        out.push({ lnglat: single.geometry.coordinates, clusterId: String(single.id), features: [single] });
                        return;
                    }
                    var sx = 0, sy = 0, ids = [];
                    for (var s = 0; s < group.length; s++) {
                        sx += group[s].x;
                        sy += group[s].y;
                        ids.push(group[s].feature.id);
                    }
                    ids.sort(function (a, b) { return String(a).localeCompare(String(b)); });
                    var feats = group.map(function (pt) { return pt.feature; });
                    out.push({
                        lnglat: projection.fromWorldCoordinates({ x: sx / group.length, y: sy / group.length }),
                        clusterId: 'c' + ids.join('-'),
                        features: feats
                    });
                });
                return out;
            }
        };
    }

    function initMap(ymaps3, YMapMarker, YMapClusterer, clusterByGrid, YMapZoomControl, YMapControls) {
        window.PermLiveMaps.YMapMarker = YMapMarker;
        window.PermLiveMaps.YMap = ymaps3.YMap;

        state.mapEl = document.getElementById('map');
        if (!state.mapEl) return;

        if (state.map) {
            try { state.map.destroy(); } catch (e) {  }
            state.map = null;
        }
        state.flowerEl = null;
        state.flowerOverlayEl = null;
        state.flowerAnchor = null;
        state.flowerScreen = null;
        state.proposeEl = null;
        state.proposeOverlayEl = null;

        var map = new ymaps3.YMap(state.mapEl, {
            location: { center: averageCoords(), zoom: 14 },

            mode: 'raster',
            theme: 'light',
            behaviors: ['drag', 'scrollZoom', 'pinchZoom', 'dblClick']
        });
        state.map = map;
        window.Perm = map;
        try { window.PermLiveMaps._map = map; } catch (e) {}

        state.YMapDefaultSchemeLayer = ymaps3.YMapDefaultSchemeLayer;
        state.YMapClusterer = YMapClusterer;
        state.YMapMarker = YMapMarker;
        state.clusterMethod = clusterByPixelDistance(pixelRadiusForZoom);
        state.schemeLayer = new ymaps3.YMapDefaultSchemeLayer({
            theme: 'light',
            customization: CUSTOMIZATION
        });
        map.addChild(state.schemeLayer);
        map.addChild(new ymaps3.YMapDefaultFeaturesLayer({ zIndex: 1800 }));

        state.clusterer = createClusterer();
        map.addChild(state.clusterer);

        /* Зум — свои кнопки +/- в общем вертикальном ряду справа
           (как в мини-приложении); штатный YMapZoomControl не используем,
           чтобы не было дубля. На всякий случай прячем его и через CSS. */

        state.balloonEl = buildBalloon();
        attachSwipeClose(state.balloonEl, closeBalloon);
        state.mapEl.appendChild(state.balloonEl);
        state.mapEl.appendChild(buildControls());

        applyEmotionLayer();
        syncFilterVisibility();

        if (!window.__plMapDocBound) {
            window.__plMapDocBound = true;
            document.addEventListener('pointerdown', function (e) {
            var top = null;
            try { top = document.elementFromPoint(e.clientX, e.clientY); } catch (err) { top = e.target; }
            if (overlayTarget(top) || overlayTarget(e.target)) {
                pressedEl = null;
                pressedXY = null;
                return;
            }
            var pick = pickElAtPoint(e.clientX, e.clientY, '.pl-map-pin, .pl-map-cluster, .pl-map-emotion');
            if (pick) {
                pressedEl = pick;
                pressedXY = [e.clientX, e.clientY];
                e.stopPropagation();
            } else {
                pressedEl = null;
                pressedXY = null;
            }
        }, true);

        document.addEventListener('pointermove', function (e) {
            if (!pressedEl || !pressedXY) return;
            var dx = e.clientX - pressedXY[0];
            var dy = e.clientY - pressedXY[1];
            if (dx * dx + dy * dy > 100) {
                pressedEl = null;
                pressedXY = null;
            }
        }, true);

        document.addEventListener('mousedown', function (e) {
            var top2 = null;
            try { top2 = document.elementFromPoint(e.clientX, e.clientY); } catch (err) { top2 = e.target; }
            if (overlayTarget(top2) || overlayTarget(e.target)) return;
            var pick2 = pickElAtPoint(e.clientX, e.clientY, '.pl-map-pin, .pl-map-cluster, .pl-map-emotion');
            if (pick2) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
        }

        var mapBound = state.mapEl.__plMapBound;
        state.mapEl.__plMapBound = true;
        if (!mapBound) {

        state.mapEl.addEventListener('pointerdown', function (e) {
            if (e.button !== undefined && e.button !== 0 && e.button !== -1) return;
            if (isMapUI(e)) { clearFlowerTap(); return; }
            flowerTap = [e.clientX, e.clientY, Date.now()];
        }, true);
        state.mapEl.addEventListener('pointermove', function (e) {
            if (!flowerTap) return;
            var dx = e.clientX - flowerTap[0], dy = e.clientY - flowerTap[1];
            if (dx * dx + dy * dy > 144) clearFlowerTap();
        }, true);
        state.mapEl.addEventListener('pointerup', function (e) {

            if (flowerTap && (e.type === 'pointercancel')) clearFlowerTap();
        }, true);
        state.mapEl.addEventListener('pointercancel', clearFlowerTap, true);
        state.mapEl.addEventListener('click', function (e) {
            var target = document.elementFromPoint(e.clientX, e.clientY);

            if (target && target.closest) {
                var closeBtn = target.closest('.pl-map-balloon__close');
                if (closeBtn) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (closeBtn.closest('.pl-map-emotion-pop')) hideEmotionPop();
                    else closeBalloon();

                    if (emotionOpenId && !closeBtn.closest('.pl-map-emotion-pop')) hideEmotionPop();
                    pressedEl = null;
                    pressedXY = null;
                    return;
                }
                /* Клик по интерфейсу поверх карты (календарь, кнопки, балуны):
                   отдаём его владельцевым обработчикам, пины под ним не трогаем. */
                if (overlayTarget(target)) {
                    pressedEl = null;
                    pressedXY = null;
                    return;
                }
            }

            var pressed = pressedEl;
            pressedEl = null;
            pressedXY = null;

            if (pressed && target && target.closest && target.closest('.pl-map-balloon, .pl-map-emotion-pop')) {
                pressed = null;
            }

            if (pressed) {
                var pressedPin = pressed.closest('.pl-map-pin');
                if (pressedPin) {
                    e.preventDefault();
                    e.stopPropagation();
                    var pev = findEvent(pressedPin.getAttribute('data-id'));
                    if (pev) toggleBalloon(pev, pressedPin);
                    return;
                }
                var pressedCluster = pressed.closest('.pl-map-cluster');
                if (pressedCluster) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClusterClick(pressedCluster.__features, pressedCluster.__coords, pressedCluster);
                    return;
                }
                var pressedMood = pressed.closest('.pl-map-emotion');
                if (pressedMood) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleEmotionClick(pressedMood);
                    return;
                }
            }

            var pinEl = pickElAtPoint(e.clientX, e.clientY, '.pl-map-pin');
            if (pinEl) {
                e.preventDefault();
                e.stopPropagation();
                var event = findEvent(pinEl.getAttribute('data-id'));
                if (event) toggleBalloon(event, pinEl);
                return;
            }
            var clusterEl = pickElAtPoint(e.clientX, e.clientY, '.pl-map-cluster');
            if (clusterEl) {
                e.preventDefault();
                e.stopPropagation();
                handleClusterClick(clusterEl.__features, clusterEl.__coords, clusterEl);
                return;
            }
            var moodEl = pickElAtPoint(e.clientX, e.clientY, '.pl-map-emotion');
            if (moodEl) {
                e.preventDefault();
                e.stopPropagation();
                handleEmotionClick(moodEl);
                return;
            }
            if (!target || !target.closest) return;

            if (target.closest && (
                target.closest('.pl-map-balloon, .pl-map-emotion-pop, .pl-map-emotion-composer, .pl-map-emotion-overlay, .pl-map-flower, .pl-map-flower-overlay, .pl-map-propose-composer, .pl-map-propose-overlay, .pl-map-controls, .pl-map-date-btn, .pl-map-mode-btn, .pl-map-mode-dropdown, .pl-map-calendar-modal, .pl-map-calendar-overlay, .pl-map-legend-modal, .pl-map-legend-overlay') ||
                target.closest('[class*="controls"], [class*="copyright"], [class*="logo"], a[href*="yandex"]') ||
                (target.closest('#map button, #map a') && !target.closest('.pl-map-pin, .pl-map-cluster, .pl-map-emotion'))
            )) return;

            var wasBalloon = !!state.balloonOpenId;
            var wasEmotionPop = !!(emotionOpenId && emotionPopEl && emotionPopEl.parentNode);
            var wasLegend = isLegendOpen();
            var wasFlower = isFlowerOpen();
            var wasPropose = !!(state.proposeEl && state.proposeEl.classList.contains('pl-map-emotion-composer--open'));
            var wasComposer = !!(window.__PermLiveMapEmotionOpen);
            var wasSiteUI = closeSiteOverlays();
            if (wasFlower) hideFlower();
            if (wasPropose) hideProposeComposer();
            if (wasEmotionPop) hideEmotionPop();
            if (wasComposer) hideEmotionComposer();
            if (wasBalloon) closeBalloon();
            if (wasLegend) closeLegend();
            if (wasBalloon || wasEmotionPop || wasFlower || wasPropose || wasComposer || wasSiteUI || wasLegend) {
                clearFlowerTap();
                return;
            }

            if (!flowerTap) return;
            var tapDx = e.clientX - flowerTap[0], tapDy = e.clientY - flowerTap[1];
            if (tapDx * tapDx + tapDy * tapDy > 144) { clearFlowerTap(); return; }
            clearFlowerTap();

            var ll = screenToLngLat(e.clientX, e.clientY);
            if (ll) {
                e.preventDefault();
                e.stopPropagation();
                showFlower(ll, e.clientX, e.clientY);
            } else {
                balloonCloseListener(e);
            }
        }, true);

        state.mapEl.addEventListener('contextmenu', function (e) {
            if (isMapUI(e)) return;
            e.preventDefault();
            e.stopPropagation();

            var wasBalloon2 = !!state.balloonOpenId;
            var wasEmotionPop2 = !!(emotionOpenId && emotionPopEl && emotionPopEl.parentNode);
            var wasFlower2 = isFlowerOpen();
            var wasPropose2 = !!(state.proposeEl && state.proposeEl.classList.contains('pl-map-emotion-composer--open'));
            var wasSiteUI2 = closeSiteOverlays();
            if (wasFlower2) hideFlower();
            if (wasPropose2) hideProposeComposer();
            if (wasEmotionPop2) hideEmotionPop();
            if (wasBalloon2) closeBalloon();
            if (wasBalloon2 || wasEmotionPop2 || wasFlower2 || wasPropose2 || wasSiteUI2) return;
            var ll2 = screenToLngLat(e.clientX, e.clientY);
            if (ll2) showFlower(ll2, e.clientX, e.clientY);
        }, true);
        }

        try {
            if (map.camera && map.camera.onUpdate && map.camera.onUpdate.addListener) {
                map.camera.onUpdate.addListener(function () {

                    if (state.balloonOpenId && Date.now() - state.balloonOpenedAt > 600) closeBalloon();
                    if (emotionOpenId) hideEmotionPop();
                    if (isLegendOpen()) closeLegend();
                    if (isFlowerOpen()) hideFlower();
                    if (state.proposeEl && state.proposeEl.classList.contains('pl-map-emotion-composer--open')) hideProposeComposer();
                });
            }
        } catch (err) {  }

        // не запрашивать геопозицию автоматом — только по клику на кнопку, запоминаем до чистки куки
        // requestUserLocation(false, true);
        fetchEmotions();

        window.__PermLiveMapReady = true;
        try {
            state.mapEl.dispatchEvent(new CustomEvent('pl:map-ready', { detail: state.mapEl }));
        } catch (err) {  }

        setTimeout(function () {
            try {
                setMapHeight();
                window.dispatchEvent(new Event('resize'));
            } catch (err) {  }
        }, 350);
    }

    function fail() {
        var mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.innerHTML = '<div class="map-noscript"><p>Карта не загрузилась. Проверьте соединение и перезагрузите страницу.</p></div>';
        }
    }

    function run() {
        var maps = window.PermLiveMaps;
        if (!maps) {
            fail();
            return;
        }

        var attempts = 0;
        function attempt() {
            attempts++;
            maps.loadCore().then(function (ymaps3) {
                var uiP = maps.importPackage('@yandex/ymaps3-default-ui-theme');
                var clusterP = maps.importPackage('@yandex/ymaps3-clusterer');
                return Promise.all([uiP, clusterP]).then(function (res) {
                    return [ymaps3, res[0], res[1]];
                });
            }).then(function (parts) {
                var ymaps3 = parts[0];
                var uiTheme = parts[1];
                var clusterer = parts[2];
                initMap(
                    ymaps3,
                    ymaps3.YMapMarker,
                    clusterer.YMapClusterer,
                    clusterer.clusterByGrid,
                    uiTheme.YMapZoomControl,
                    ymaps3.YMapControls || uiTheme.YMapControls
                );
            }).catch(function () {
                if (attempts < 3) {
                    setTimeout(attempt, 600 * attempts);
                } else {
                    fail();
                }
            });
        }
        attempt();
    }

    window.__plEventsMapBoundCleanup = function () {
        try { hideFlower(); } catch (e) {}
        try { hideProposeComposer(); } catch (e) {}
        if (state.emotionTimer) {
            clearInterval(state.emotionTimer);
            state.emotionTimer = null;
        }
        document.body.style.removeProperty('height');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('--header-height');
        document.documentElement.style.removeProperty('height');
        var m = document.getElementById('map');
        if (m) {
            m.style.removeProperty('height');
            m.style.removeProperty('top');
            m.style.removeProperty('--pl-map-bottom');
        }
        document.body.classList.remove('map-fullscreen', 'pl-map-fs');
    };

    document.addEventListener('permlive:nav-start', function () {  });

    function eventsMapInit() {
        document.body.classList.add('map-fullscreen');

        setMapHeight();
        setTimeout(setMapHeight, 50);

        if (!window.__plEventsMapBound) {
            window.__plEventsMapBound = true;
            var resizeTimer = null;
            window.addEventListener('resize', function () {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(setMapHeight, 150);
            });
            window.addEventListener('orientationchange', function () {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(setMapHeight, 200);
            });

            if (window.visualViewport) {
                var vvListener = function () {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(setMapHeight, 150);
                };
                window.visualViewport.addEventListener('resize', vvListener);
                window.visualViewport.addEventListener('scroll', vvListener);
            }
        }
        run();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', eventsMapInit);
    } else {
        eventsMapInit();
    }

    if (window.PermlivePjax) {
        window.PermlivePjax.onPageLoad(function () {
            setTimeout(eventsMapInit, 100);
        });
    }

    /* VKMINI: миник перечитывает эмоции после резолва пользователя (is_mine) */
    window.PermLiveMaps.refreshEmotions = fetchEmotions;
    window.PermLiveMaps.setEvents = function (events, opts) {
        state.events = Array.isArray(events) ? events : [];
        renderEvents(!opts || opts.recenter !== false);

        applyEmotionLayer(true);
        syncFilterVisibility();
    };

    window.PermLiveMaps.setModeFilter = setModeFilter;
    window.PermLiveMaps.getModeFilter = function () { return state.modeFilter; };
    window.PermLiveMaps.getTypeAvailability = getTypeAvailability;
    window.PermLiveMaps.getModeAvailability = getModeAvailability;
    window.PermLiveMaps.syncFilterVisibility = syncFilterVisibility;
    window.PermLiveMaps.closePopups = closeMapPopups;

    window.PermLiveMaps.balloonImgError = function (img) {
        if (!img) return;
        var paid = img.getAttribute('data-paid') === '1';
        var letter = img.getAttribute('data-letter') || '♪';
        var wrap = img.closest ? img.closest('.pl-map-balloon__avatarwrap') : null;
        if (wrap) {
            if (paid) {
                var avatar = document.createElement('div');
                avatar.className = 'pl-map-balloon__avatar';
                avatar.textContent = letter;
                img.parentNode.replaceChild(avatar, img);
            } else {
                img.remove();
                if (!wrap.querySelector('.pl-map-balloon__avatar') && !wrap.querySelector('.pl-map-balloon__img')) {
                    wrap.style.display = 'none';
                }
            }
            return;
        }
        var link = img.closest ? img.closest('.pl-map-balloon__imglink') : null;
        if (!link || !link.parentNode) return;
        paid = link.getAttribute('data-paid') === '1';
        if (paid) {
            var av2 = document.createElement('div');
            av2.className = 'pl-map-balloon__avatar';
            av2.title = link.getAttribute('aria-label') || '';
            av2.textContent = link.getAttribute('data-letter') || '♪';
            link.parentNode.replaceChild(av2, link);
        } else {
            link.remove();
        }
    };
})();
