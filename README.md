# Permlive VK Mini App — GitHub Pages

Валидное мини-приложение ВКонтакте, стилизованное как текущий сайт permlive.ru.

## Что внутри

- **Вкладка «Афиша»**
  - Поиск как на сайте
  - Горизонтальный календарь на 30 дней + модальный календарь по месяцам (как на `/map/`)
  - Слайдеры: **Топ-10**, **Ближайшие события** (3 дня), **Интересуются прямо сейчас**
    - на десктопе — стрелки, на мобилках — свайп (как `horizontal-slider.css`)
  - Таймлайн, сгруппированный по датам (как `timeline.html`)
- **Вкладка «Карта»**
  - Leaflet-карта Перми (без API-ключа, совместима с GitHub Pages). При наличии ключа Яндекса легко заменить на `api-maps.yandex.ru`
  - Кнопка даты + модальный календарь (копия логики `map.html`)
  - Фильтр режима: Все / Бесплатные / Топ
  - Кластеризация по площадке, балуны как на сайте, кнопка «Маршрут»
- **VK Bridge** (`@vkontakte/vk-bridge`) — `VKWebAppInit`, обработка `vk_*` launch params, `VKWebAppSetViewSettings`
- Стиль 1-в-1: `#e14425`, `Jost`, скругления `20px`, карточки, бейджи, `--card-bg-color`

## Структура

```
vkminiapp_new/
  index.html          # SPA, 2 вкладки
  404.html            # fallback для GH Pages SPA routing
  .nojekyll           # отключает Jekyll
  assets/css/style.css
  assets/js/app.js    # вся логика
```

Все пути относительные (`./assets/...`) — работает с любого base path:

- `https://USERNAME.github.io/permlive/` 
- `https://USERNAME.github.io/repo/vkminiapp_new/`

## Деплой на GitHub Pages

**Вариант A — папка `vkminiapp_new` как отдельный репозиторий/ветка:**

Settings → Pages → Source: `Deploy from a branch` → Branch: `main` → Folder: `/vkminiapp_new`

**Вариант B — корень репозитория:**

Скопировать содержимое `vkminiapp_new` в корень или в `docs/` и выбрать его в Pages.

**Вариант C — `gh-pages` ветка:**

```bash
git subtree push --prefix vkminiapp_new origin gh-pages
# или
npx gh-pages -d vkminiapp_new
```

## Настройка в VK

1. https://dev.vk.com → Создать Mini App → тип **VK Mini Apps**
2. В поле **Адрес** указать URL GitHub Pages, например:
   `https://USERNAME.github.io/permlive/vkminiapp_new/`
3. Добавить в **Базовый URL** и **Мобильную версию** тот же адрес.
4. Сохранить, установить через «Добавить» и тестировать.

CORS: приложение пробует `https://permlive.ru/api/calendar-dates/` и `/map/events/?date=YYYY-MM-DD`.
Если CORS закрыт — автоматически подставляется мок (48 концертов, рандом по датам Перми).

## Локальный запуск

```bash
# любой статический сервер
python3 -m http.server 5173 --directory vkminiapp_new
# открыть http://localhost:5173/?vk_platform=desktop_web&vk_app_id=1
```

## Замена Leaflet на Яндекс.Карты (как на сайте)

В `index.html` замените Leaflet на:

```html
<script src="https://api-maps.yandex.ru/3.0/?apikey=YOUR_KEY&lang=ru_RU"></script>
```

и адаптируйте `initMap()` / `refreshMapMarkers()` под `ymaps3` (см. `static/js/maps/*` в основном проекте).

## TODO

- Подключить `VKWebAppStorage` для лайков из mini app
- Добавить `VKWebAppOpenApp` deep-link на `permlive.ru/event/<slug>`
- PWA-манифест при необходимости
