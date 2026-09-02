
(function () {
    'use strict';

    function settings() {
        return (window.PermLiveMapSettings && window.PermLiveMapSettings.apiKey)
            ? window.PermLiveMapSettings
            : { apiKey: '' };
    }

    function buildLoaderUrl(apiKey) {
        return 'https://api-maps.yandex.ru/v3/?apikey='
            + encodeURIComponent(apiKey || '')
            + '&lang=ru_RU';
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = resolve;
            s.onerror = function () {
                reject(new Error('Yandex Maps API v3 не загрузился: ' + src));
            };
            document.head.appendChild(s);
        });
    }

    var corePromise = null;

    function loadCore() {
        if (corePromise) return corePromise;
        corePromise = new Promise(function (resolve, reject) {
            if (window.ymaps3) {
                window.ymaps3.ready.then(resolve).catch(reject);
                return;
            }
            loadScript(buildLoaderUrl(settings().apiKey))
                .then(function () {
                    if (!window.ymaps3) {
                        reject(new Error('ymaps3 не найден после загрузки скрипта API'));
                        return;
                    }
                    window.ymaps3.ready.then(resolve).catch(reject);
                })
                .catch(reject);
        });
        return corePromise;
    }

    function importPackage(name) {
        return loadCore().then(function (ymaps3) {
            if (!ymaps3.import) {
                throw new Error('ymaps3.import недоступен');
            }
            if (ymaps3.import.registerCdn && !window.__PermLiveMapsCdn) {
                window.__PermLiveMapsCdn = true;
                ymaps3.import.registerCdn('https://cdn.jsdelivr.net/npm/{package}', [
                    '@yandex/ymaps3-default-ui-theme@0.0',
                    '@yandex/ymaps3-clusterer@0.0'
                ]);
            }
            return ymaps3.import(name);
        });
    }

    window.PermLiveMaps = {
        loadCore: loadCore,
        importPackage: importPackage,

        customization: [
            { tags: { all: ['land'] }, elements: 'geometry', stylers: [{ color: '#f7f4ef' }] },
            { tags: { all: ['water'] }, elements: 'geometry', stylers: [{ color: '#cfe4f0' }] },
            { tags: { any: ['building', 'structure'] }, elements: 'geometry.fill', stylers: [{ color: '#ece7e0' }] },
            { tags: { all: ['park'] }, elements: 'geometry.fill', stylers: [{ color: '#dbe8cd' }] },
            { tags: { all: ['landcover'] }, elements: 'geometry.fill', stylers: [{ color: '#e9efe1' }] },
            { tags: { all: ['road', 'road_1'] }, elements: 'geometry.fill', stylers: [{ color: '#fbeeda' }] },
            { tags: { all: ['road', 'road_1'] }, elements: 'geometry.outline', stylers: [{ color: '#f0d9b8' }] },
            { tags: { all: ['road', 'road_2'] }, elements: 'geometry.fill', stylers: [{ color: '#f9f2e4' }] },
            { tags: { all: ['road_3'] }, elements: 'geometry.fill', stylers: [{ color: '#f6efe3' }] },
            { tags: { all: ['road_4'] }, elements: 'geometry.fill', stylers: [{ color: '#f6efe3' }] },
            { tags: { all: ['road', 'path'] }, elements: 'geometry.fill', stylers: [{ color: '#f2ecdf' }] },
            { tags: { all: ['admin', 'locality'] }, elements: 'label.text.fill', stylers: [{ color: '#55524d' }] },
            { tags: { all: ['admin', 'address'] }, elements: 'label.text.fill', stylers: [{ color: '#7c766c' }] },

            { tags: { any: ['poi'] }, elements: ['geometry', 'label.icon'], stylers: [{ visibility: 'off' }] },
            { tags: { any: ['poi'] }, elements: 'label.text.fill', stylers: [{ color: '#a49f97' }] }
        ]
    };
})();
