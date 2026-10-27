# Проверка и отладка редактора

Цель — защитить четыре основных пользовательских процесса перед выпуском MVP. Тесты работают с настоящими Next.js, Java API, PostgreSQL, загрузкой изображений и экспортом Apache POI. Ответы приложения не подменяются.

## Одна команда перед выпуском

Первоначальная настройка:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm infra:up
```

Нужны Node.js 22.18+ (или 24+), pnpm 10.10.0, JDK 26 и Docker для локального PostgreSQL. Проектный JDK в `.tools/` подхватывается автоматически.

```sh
pnpm verify
```

Команда последовательно проверяет frontend-тесты, TypeScript приложения и E2E, backend unit/integration tests, production-сборку Next.js и четыре browser-сценария в Chromium и WebKit.

| Сценарий | Что проверяется |
| --- | --- |
| Создать и открыть | Вставить детерминированный ответ в студии, собрать PPTX, открыть редактор, загрузить настоящий фон, убедиться, что пять абзацев списка не пересекаются, сравнить screenshot |
| Изменить текст и положение | Изменить третий пункт, передвинуть общий text shape мышью, дождаться autosave, перезагрузить и проверить сохранённые текст и координаты |
| Добавить изображение | Загрузить PNG через UI, изменить описание, дождаться autosave, перезагрузить, проверить доступность изображения и его включение в экспорт |
| Экспортировать | Изменить текст и координаты, скрыть и переставить слайд, скачать PPTX, прочитать ZIP/XML, проверить абзацы, bullets, геометрию, отсутствие маркеров и новую версию |

Дополнительно два сценария RG-1 задерживают ответ настоящего autosave дольше debounce. Во время
ожидания тесты вносят новые правки, вызывают ручное сохранение или экспорт и проверяют, что запросы
идут последовательно с обновлённой `draft_revision`, промежуточный текст пропускается, а последний
восстанавливается после reload и попадает в PPTX. Очередь держит только последний immutable snapshot.
При ошибке она останавливается без бесконечного retry; защита локального документа при ошибке (RG-2)
и безопасный выход (RG-3) остаются отдельными задачами.

Каждый запуск создаёт отдельную временную схему `editor_e2e_<random>` и отдельный каталог файлов. После остановки тестовых серверов они удаляются. Рабочие презентации и схемы `public`, `auth_test`, `generation_test` не очищаются. Тестовые серверы занимают `127.0.0.1:13000` и `127.0.0.1:18081`; существующий сервер на этих портах вызывает понятную ошибку вместо повторного использования.

После каждого сценария удаляются только созданные им записи презентаций в изолированной схеме.
Это сохраняет независимость тестов при расширении suite; реальные лимиты генерации не отключаются.

На другой машине можно задать `E2E_DATABASE_URL` в формате `postgresql://user:password@host:port/database`. Учётная запись должна иметь право создавать и удалять схемы в тестовой БД. Эта переменная не влияет на рабочий `DATABASE_URL`.

## Посмотреть процесс по шагам

```sh
pnpm test:e2e:debug --project=chromium
```

Откроется браузер и Playwright Inspector. Кнопками Step/Resume можно пройти клики, ввод, autosave и экспорт. В DevTools → Network видны настоящие запросы:

```mermaid
sequenceDiagram
    participant UI as React editor
    participant API as PresentationEditorController
    participant Draft as PresentationEditorService
    participant DB as PostgreSQL
    participant PPTX as PresentationTemplateService
    UI->>API: GET /editor
    API->>Draft: get(user, presentation)
    Draft->>DB: опубликованный content или draft
    Draft->>PPTX: editorDeck(template, content)
    PPTX-->>UI: shape, paragraphs, background_url
    UI->>API: PUT /editor/draft
    API->>Draft: save(user, snapshot)
    Draft->>DB: draft + optimistic revision
    UI->>API: POST /editor/commit
    Draft->>PPTX: render(content)
    Draft->>DB: новая revision + очистка draft
    UI->>API: GET download_url
    API-->>UI: PPTX
```

Для совместной отладки Java и браузера:

```sh
E2E_JAVA_DEBUG=1 pnpm test:e2e:debug --project=chromium
```

В IntelliJ создайте Remote JVM Debug с host `127.0.0.1`, port `15005`, Attach. Поставьте breakpoint в `PresentationEditorController.save`, `PresentationEditorService.save`, `PresentationTemplateService.editorDeck` или `PresentationTemplateService.render`. Это позволяет проследить одно действие от UI до сохранённой модели и PPTX. При длительной остановке Java сетевые ожидания теста могут истечь; после изучения продолжите или перезапустите выбранный сценарий.

## Разобрать падение

```sh
pnpm test:e2e:report
```

HTML-отчёт содержит шаг, на котором возникла ошибка. Для упавшего сценария сохраняются screenshot, видео и `trace.zip` в `test-results/`. Trace показывает DOM до/после действий, сетевые запросы и ответы. В GitLab эти файлы доступны в artifacts job `editor_e2e` в течение семи дней.

Чтобы записать trace успешного процесса и спокойно изучить его позже:

```sh
pnpm test:e2e --project=chromium --trace=on
```

```sh
pnpm exec playwright show-trace test-results/<scenario>/trace.zip
```

Эталонные screenshots находятся в `e2e/snapshots/{darwin,linux}/{chromium,webkit}/`.
macOS и Linux используют отдельные эталоны: сглаживание шрифтов отличается между ОС. Обновляйте
эталоны только после визуальной проверки ожидаемого изменения:

```sh
pnpm test:e2e --update-snapshots
```

Screenshot допускает небольшую разницу сглаживания внутри одной ОС; отсутствие перекрытия абзацев
проверяется отдельно по реальной DOM-геометрии. WebKit проверяет тот же движок, что используется Safari,
но не заменяет финальный короткий smoke test в установленном Safari. GitLab job использует официальный
Playwright Linux-образ, согласованный с версией в lockfile.

## Почему появился настоящий фон

Раньше canvas выбирал только условный цвет `paper/navy`; фон и декоративные shapes из PPTX не передавались браузеру. Теперь `TemplateSlideBackgrounds` рисует статическое оформление исходного слайда через POI, предварительно убрав текстовые маркеры. PNG кешируется в памяти процесса, URL содержит hash шаблона. Canvas и миниатюры используют один и тот же фон; semantic fields остаются отдельными редактируемыми слоями.

Рендер фона не обращается к Google Fonts, OpenAI или LibreOffice. При недоступности PNG основной canvas показывает ошибку с повторной загрузкой. Font colors извлекаются из PPTX, чтобы светлый текст оставался читаемым на тёмном фоне. Масштаб шрифтов и paragraph spacing рассчитывается относительно ширины слайда 960 px.

На Linux серверу Java нужны `fontconfig` и установленные шрифты (например, пакет `fonts-dejavu-core`). Это локальные системные ресурсы: браузер и сборка не скачивают шрифты Google. Подготовка сервера описана в [deployment.md](deployment.md#фоны-слайдов-в-java-api).

Проверки не обещают полного совпадения всех метрик PowerPoint: шрифты шаблонов могут отсутствовать в браузере или на сервере, а сложные эффекты POI может рисовать иначе. Четыре сценария также не вызывают платный OpenAI API и не тестируют оплату. Перед выпуском используется [короткий checklist](release-checklist.md).
