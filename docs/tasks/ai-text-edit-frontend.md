# ТЗ frontend: панель AI-чата для правки выбранного текста в редакторе

Исполнитель: frontend-developer. Параллельно backend-developer работает по
[ai-text-edit-backend.md](ai-text-edit-backend.md). Общая спецификация:
[../ai-chat-editing.md](../ai-chat-editing.md). Раздел «API-контракт» во всех трёх документах
совпадает дословно (между маркерами `BEGIN/END:ai-text-edit-contract`); его нельзя менять без
согласования с backend.

## 1. Цель

На странице редактирования (`/studio/editor/?presentation=<id>`) появляется **панель AI-чата**.
Человек одновременно правит презентацию вручную и общается с чатом:

- выбирает текстовый блок на холсте или в панели свойств; чип в чате показывает цель («Слайд 3 ·
  Заголовок»), и её можно сменить, не закрывая чат;
- нажимает быстрые кнопки «Сократить» / «Переформулировать» или пишет свободный запрос («сделай
  формальнее», «добавь энтузиазма», «ещё короче»);
- получает в ленте карточку «было / стало» с кнопками «Применить», «Другой вариант», «Отмена»;
- «Применить» меняет текст блока обычной правкой редактора: один шаг undo, сохранение
  существующим autosave.

ИИ меняет **только текст** выбранного блока. Уточнения («ещё короче») отправляют в модель текущий
предложенный текст, без истории переписки. Лента живёт на клиенте в рамках сессии редактора.
Результат длиннее лимита поля не обрезается: показывается предупреждение, применить можно.
Действия приходят из серверного каталога, поэтому новые появляются без изменения frontend.

## 2. Контекст: что уже есть в коде

Стек: Next.js 16 (`frontend/`), React 19, TypeScript, Tailwind, `@base-ui/react`,
`lucide-react`. Перед кодом прочтите `AGENTS.md`: в этой версии Next.js есть несовместимые
изменения, руководство лежит в `node_modules/next/dist/docs/`.

| Что | Где | Зачем вам |
| --- | --- | --- |
| Страница редактора | `frontend/app/studio/editor/page.tsx` → `frontend/components/studio/editor/editor-page-client.tsx` (загрузка, `version` ref, `save`, `exportPptx`, `reportError`; передаёт `contentOnly` в shell, `:133-146`) | Подключить API |
| Оболочка и раскладка | `frontend/components/studio/editor/editor-shell.tsx`: `useEditorState` (`:68`), `isWide` (`WIDE_LAYOUT_QUERY`, `:77`), `panelOpen`, `activateBlock` (`:164-168`), раскладка rail · холст · свойства (`:414-478`); заглушка `AiAssistantTrigger` только при `!contentOnly` (`:447-451`) | Место панели чата, выбор блока |
| Прототип ассистента | `frontend/components/studio/editor/ai-assistant-trigger.tsx` | Превратить в кнопку открытия панели |
| Панель свойств | `frontend/components/studio/editor/properties-panel.tsx`: на `lg` статична `w-72`/`xl:w-80`, уже — drawer (`:83-92`); `Textarea` текста с `maxLength={block.maxChars}` (`:106-115`) | Вкладки «Свойства / AI-чат», кнопка «AI», мягкий лимит |
| Состояние, undo | `frontend/components/studio/editor/use-editor-state.ts`: `updateBlock(slideId, blockId, patch, coalesceKey)`, `sealHistory`, `saveNow` (`:236`, `:268`, `:279-317`); `updateBlock` меняет текст **во всех блоках с тем же `fieldKey`** (`:55-87`) | Применение предложения |
| Autosave | `frontend/components/studio/editor/autosave-queue.ts`: `saveNow()` → `Promise<boolean>` (`false` при ошибке) | Сохранить перед запросом |
| Типы | `frontend/components/studio/editor/editor-types.ts` (`TextBlock`: `id`, `fieldKey?`, `maxChars?`, `role`, `text`; `BLOCK_ROLE_LABELS`; `CUSTOM_TEXT_MAX_CHARS = 4000`; `Slide.id = slide-<n>`); `frontend/components/studio/editor/editor-document.ts` (`toDeck`) | Чип, цель, `hardMaxChars` |
| API-клиент | `frontend/lib/generation-client.ts` (`request()` с CSRF и таймаутами, `GenerationApiError` с `status`/`code`, `post()`, `generationApi`), `frontend/lib/generation-types.ts` (`EditorDeck`, `AiCall.operation`) | Методы и DTO |
| История AI-вызовов | `frontend/components/studio/ai-call-history.tsx:182` | Подпись для `text_edit` |
| Демо-редактор | `frontend/app/studio/editor-demo/page.tsx` (`EditorShell` без API) | Ручной стенд на моке |
| Тесты | `pnpm test:frontend` (`node --test frontend/lib/*.test.mjs`; образцы `generation-client.test.mjs`, `editor-state.test.mjs`); E2E — `e2e/*.spec.ts`, `playwright.config.ts`, `docs/editor-verification.md` | Требования к тестам |

## 3. API-контракт

<!-- BEGIN:ai-text-edit-contract (дословно совпадает в docs/tasks/ai-text-edit-*.md) -->

Общее для всех маршрутов:

- Нужна сессия пользователя (или локальный `AUTH_BYPASS`). Изменяющие запросы требуют CSRF-токен
  от `/api/auth/csrf`, как остальные `/api/generation/**`. Без сессии — 401, без CSRF — 403.
- JSON в `snake_case`. Ошибки в существующем формате `{"error":{"code":"…","message":"…"}}`;
  `message` на русском и пригоден для показа пользователю.
- Ответы содержат приватные данные: `Cache-Control: no-store`.
- Длина текста везде считается в UTF-16 code units (`String.length()` в Java, `length` в JS).
- Жёсткий предел поля шаблона: `hard_max_chars = min(4000, max(2 × max_chars, max_chars + 100))`.
  Для пользовательского блока `max_chars = hard_max_chars = 4000`.

### `GET /api/generation/v1/editor/ai/actions` — каталог действий

Ответ `200`:

```json
{
  "actions": [
    { "id": "shorten", "label": "Сократить", "description": "Короче, с сохранением главной мысли",
      "ui": "quick", "targets": ["template_field", "custom_block"], "params": [] },
    { "id": "rephrase", "label": "Переформулировать", "description": "Другими словами, примерно той же длины",
      "ui": "quick", "targets": ["template_field", "custom_block"], "params": [] },
    { "id": "custom", "label": "Своя просьба", "description": "Например: сделай формальнее, добавь энтузиазма, ещё короче",
      "ui": "input", "targets": ["template_field", "custom_block"],
      "params": [ { "name": "instruction", "type": "string", "required": true, "max_length": 300,
        "options": [] } ] }
  ],
  "variants": { "default": 1, "max": 3 },
  "limits": { "custom_block_max_input_chars": 2000 },
  "enabled": true
}
```

- `ui`: `quick` — кнопка быстрого действия в чате; `input` — действие, которое отправляет поле
  свободного ввода (в каталоге ровно одно такое; его `string`-параметр получает текст сообщения).
  Неизвестное значение `ui` клиент показывает как `quick`.
- `params[].type` ∈ {`enum`, `string`}. У `enum` заполнен `options` (`[{ "id", "label" }]`), у
  `string` — `max_length`. Клиент обязан корректно показывать действия и параметры, которых не
  знает заранее (у `quick`-действия с `enum` — выбор значения перед отправкой).
- `enabled: false`, если AI не настроен. Каталог при этом возвращается, а UI показывает действия
  неактивными.

### `POST /api/generation/v1/presentations/{id}/editor/ai/text-edits` — предложить новый текст

Запрос:

```json
{
  "request_id": "3f6c2a8e-1b7d-4c1e-9a52-6f0d2b7c9e11",
  "action": "custom",
  "params": { "instruction": "сделай формальнее" },
  "target": { "kind": "template_field", "slide_id": "slide-3", "field_key": "STATEMENT", "block_id": null },
  "text": "Мы делаем презентации быстро и без лишней головной боли",
  "refines_edit_id": null,
  "variants": 1,
  "model": null
}
```

| Поле | Правила |
| --- | --- |
| `request_id` | UUID, обязателен. Ключ идемпотентности: новый для каждого сообщения или нажатия, тот же — только при сетевом повторе |
| `action` | `id` из каталога |
| `params` | объект строк строго по `params` действия; для действий без параметров `{}` |
| `target.kind` | `template_field` (обязательны `slide_id`, `field_key`; `block_id = null`) или `custom_block` (обязательны `slide_id`, `block_id`; `field_key = null`) |
| `target.slide_id` | id слайда редактора `slide-<номер исходного слайда>`; слайд включён в документ |
| `target.field_key` | поле шаблона, которое есть на этом слайде |
| `target.block_id` | id пользовательского текстового блока на этом слайде в сохранённом на сервере документе (клиент вызывает `saveNow()` перед запросом) |
| `text` | источник: текущий текст блока или, при уточнении, текст текущего предложения. Не пустой и не только пробелы, без `{{`/`}}`; длина ≤ `hard_max_chars` для `template_field`, ≤ `limits.custom_block_max_input_chars` для `custom_block` |
| `refines_edit_id` | `null` или `edit_id` предыдущего ответа для той же цели, если `text` — его вариант. Сохраняется в журнале для аналитики, в модель не передаётся. Неизвестный или чужой id → `invalid_input` |
| `variants` | 1…`variants.max`; по умолчанию `variants.default` |
| `model` | `null` или id из `GET /api/generation/v1/models` |

Ответ `200`:

```json
{
  "edit_id": "9c1d7b52-0f7e-4c55-8f3e-2d4b1a6e7c90",
  "request_id": "3f6c2a8e-1b7d-4c1e-9a52-6f0d2b7c9e11",
  "refines_edit_id": null,
  "status": "ok",
  "message": null,
  "action": "custom",
  "target": { "kind": "template_field", "slide_id": "slide-3", "field_key": "STATEMENT", "block_id": null },
  "source_text": "Мы делаем презентации быстро и без лишней головной боли",
  "max_chars": 46,
  "hard_max_chars": 146,
  "variants": [
    { "text": "Мы готовим презентации оперативно и без лишних затрат усилий", "length": 60,
      "over_by": 14, "warnings": ["over_limit"] }
  ],
  "model": "gpt-5.4-mini",
  "usage": { "input_tokens": 512, "cached_input_tokens": 0, "output_tokens": 41, "reasoning_tokens": 0 },
  "quota": { "limit": 100, "remaining": 87, "resets_at": "2026-10-30T09:12:00Z" },
  "replayed": false
}
```

| Поле | Значение |
| --- | --- |
| `status` | `ok` — есть хотя бы один вариант; `unchanged` — модель не нашла, что изменить (`variants: []`, `message` объясняет); `unsupported` — просьба выходит за рамки правки текста (`variants: []`, `message`, например «Я могу менять только текст выбранного блока») |
| `source_text` | эхо `text` запроса |
| `max_chars`, `hard_max_chars` | мягкий лимит цели (вёрстка) и жёсткий предел (сохранение) |
| `variants[].length` | длина `text` |
| `variants[].over_by` | `max(0, length − max_chars)` |
| `variants[].warnings` | подмножество {`over_limit`, `exceeds_hard_limit`, `not_shorter`, `line_breaks_removed`}. Текст **никогда не обрезается**. С `exceeds_hard_limit` вариант применить нельзя |
| `usage` | токены этого вызова; поля могут быть `null`, если провайдер их не вернул |
| `quota` | состояние после этой правки; `resets_at` — когда освободится ближайшая единица квоты |
| `replayed` | `true`, если ответ взят из сохранённого результата по тому же `request_id` (квота не расходуется) |

Ошибки:

| HTTP | `code` | Когда |
| --- | --- | --- |
| 401 / 403 | (формат Spring Security) | нет сессии / нет CSRF |
| 404 | `presentation_not_found` | презентации нет или она чужая (существование не раскрывается) |
| 409 | `presentation_not_ready` | статус презентации не `draft` и не `succeeded` |
| 409 | `idempotency_conflict` | тот же `request_id` с другим телом запроса |
| 409 | `ai_edit_in_progress` | правка с этим `request_id` ещё выполняется |
| 409 | `content_unavailable` | у презентации нет сохранённого содержимого (старые презентации); как в редакторе |
| 422 | `invalid_input` | нарушена структура тела: нет обязательных полей, не UUID, `variants` вне диапазона, неверная комбинация полей `target`, неизвестный или чужой `refines_edit_id` |
| 422 | `unsupported_action` | `action` нет в каталоге или действие недоступно для `target.kind` |
| 422 | `invalid_params` | неизвестный или отсутствующий параметр, значение не из `options`, строка длиннее `max_length` |
| 422 | `invalid_target` | слайд не включён или отсутствует, поля нет на слайде, блока нет в сохранённом документе |
| 422 | `invalid_text` | пустой текст или текст содержит `{{`/`}}` |
| 422 | `text_too_long` | `text` длиннее допустимого для цели |
| 422 | `unsupported_model` | модель не из каталога |
| 429 | `ai_edit_limit` | исчерпана дневная квота (100 правок за скользящие 24 часа) |
| 502 | `ai_edit_failed` | ошибка или таймаут провайдера, неполный или не соответствующий схеме ответ; при повторе с тем же `request_id` возвращается та же ошибка |
| 503 | `openai_disabled` | AI не настроен |

### Изменение существующего `GET /api/generation/v1/presentations/{id}/editor`

Аддитивно: каждый элемент `slides[].blocks[]` получает `hard_max_chars` (integer) по формуле выше.
Сохранение черновика (`PUT …/editor/draft`), загрузка (`GET …/editor`) и экспорт
(`POST …/editor/commit`) **принимают и сохраняют без обрезки** текст поля длиной до
`hard_max_chars`. Длиннее — 422 `invalid_content`, как сейчас для невалидного документа. PPTX
экспорта содержит текст полностью. Первичная генерация, ручная сборка и тестовый чат студии по-прежнему
обрезают текст до `max_chars`.

<!-- END:ai-text-edit-contract -->

## 4. Что НЕ делать

- Не менять студию и первичную генерацию (`generation-studio.tsx`, вставку ответа LLM) и тестовый
  чат на вкладке «Недавние» (`presentation-card.tsx`, `generationApi.chat`).
- Не применять AI-результат в обход редактора (никаких прямых `PUT /editor/draft`); патч — только
  `{ text }`.
- Не обрезать текст варианта на клиенте и не делать автоматический повторный запрос при превышении
  длины.
- Не отправлять историю ленты на сервер и не хранить ленту в `localStorage`/`sessionStorage`.
- Не блокировать редактор (`inert`) на время AI-запроса: ручная правка должна работать.
- Не рендерить тексты AI как HTML или markdown (`dangerouslySetInnerHTML` запрещён); не логировать
  тексты в консоль.
- Не прописывать список действий или тонов в UI: они из каталога. Локально допустимы только иконки
  по `id` и запасная иконка.
- Не делать структурные операции, правку части текста, стриминг. Не менять backend.

## 5. Устройство и шаги реализации

Новая папка `frontend/components/studio/editor/ai/`.

1. **Типы и клиент.**
   - В `frontend/lib/generation-types.ts` — DTO контракта: `AiActionCatalog`, `AiAction`
     (`ui: 'quick' | 'input' | string`), `AiActionParam`, `TextEditRequest`, `TextEditTarget`,
     `TextEditResponse`, `TextVariant` (`text`, `length`, `over_by`, `warnings`), `AiUsage`,
     `AiQuota`.
   - В блоках `EditorDeck` — `hard_max_chars`; `AiCall.operation` дополняется `'text_edit'`.
   - В `toDeck` — `hardMaxChars: block.hard_max_chars ?? block.max_chars`, чтобы работать со
     старым backend.
   - В `generationApi`:
     - `aiActions(signal?)` → `GET /v1/editor/ai/actions`;
     - `textEdit(id, body, signal?)` → `POST /v1/presentations/{id}/editor/ai/text-edits` через
       `request()` (CSRF), таймаут 45 000 мс.
   - В `ai-call-history.tsx` — подпись «Правка текста».
2. **Порт API и мок.** `ai/ai-edit-port.ts`:
   `interface AiEditPort { actions(signal?): Promise<AiActionCatalog>; textEdit(presentationId, body, signal?): Promise<TextEditResponse> }`.
   - `createHttpAiEditPort()` — поверх `generationApi`;
   - `createMockAiEditPort(options?)` — фикстуры из примеров контракта, задержка 600 мс,
     сценарии `over_limit`, `exceeds_hard_limit`, `unsupported`, `unchanged`, `ai_edit_limit`,
     `ai_edit_failed`.

   Мок используется в unit-тестах и на демо-странице, в реальный редактор он не подключается.
3. **Мягкий лимит в панели свойств** (`properties-panel.tsx`):
   - `maxLength` = `block.hardMaxChars` (раньше `maxChars`);
   - под полем — счётчик `длина / maxChars`; при превышении он становится акцентным с текстом
     «Длиннее лимита поля на N символов — может не поместиться в блок»;
   - для пользовательских блоков (лимит 4000) счётчик показывается после 90 % лимита.

   Так пользователь может довести текст после AI до нужного размера вручную.
4. **Цель и чип.** `ai/ai-target.ts` — чистые функции:
   - `targetFor(slide, block)`: блок с `fieldKey` → `{kind:'template_field', slide_id, field_key,
     block_id: null}`, иначе `{kind:'custom_block', slide_id, field_key: null, block_id}`;
   - `targetKey(target)` — стабильная строка;
   - `chipLabel(deck, target)` → «Слайд {позиция+1} · {BLOCK_ROLE_LABELS[role]}» или «Слайд N ·
     Текстовый блок»;
   - `inputLimit(block, catalog)` — `hardMaxChars` для поля, `custom_block_max_input_chars` для
     блока;
   - `disabledReason(block, catalog)` → `null` | «Выберите текст на слайде» | «Пустой текст» |
     «Текст длиннее N символов — сократите вручную» | «AI не настроен»;
   - `sharedFieldSlides(deck, block)` — число слайдов с тем же `fieldKey`.
5. **Состояние чата.** `ai/chat-reducer.ts` (чистый, покрывается тестами) и хук
   `ai/use-ai-chat.ts`. Состояние:
   - `messages[]` — `user` | `proposal` | `reply` | `error`; у каждого `targetKey` и `chipLabel`;
   - `pending` — `Map<targetKey, {editId, text, sourceText, baseText}>`, текущее неприменённое
     предложение для цели; `sourceText` — текст, от которого строился запрос; `baseText` — исходный
     текст блока до цепочки уточнений;
   - `inFlight` — `Map<targetKey, AbortController>`, не больше одного запроса на цель;
   - `quota` — из последнего ответа.

   Состояние живёт в памяти `EditorShell` до размонтирования. При reload страницы и при
   `reloadServer` (новая `epoch`) лента очищается.
6. **Отправка** `send(action, params)` для текущей цели:
   1. Нет цели или есть `disabledReason` → отправка недоступна.
   2. **Источник:** есть `pending` для цели → `text = pending.text`, `refines_edit_id =
      pending.editId`. Иначе `text = block.text`, `refines_edit_id = null`.
   3. В ленту добавляется сообщение пользователя: подпись действия или текст запроса и чип.
   4. Если передан `ensureSaved` (реальный редактор) — `await ensureSaved()`, то есть
      `editor.saveNow()`. Результат `false` → реплика-ошибка «Не удалось сохранить изменения,
      повторите», без запроса.
   5. Запрос с новым `request_id = crypto.randomUUID()` и `AbortController`. При сетевом обрыве или
      таймауте — одна автоматическая повторная попытка **с тем же `request_id`**.
   6. Результат:
      - `ok` → карточка `proposal` (`baseText = pending?.baseText ?? text`, `sourceText = text`), и
        она становится `pending` для цели (прежняя карточка этой цели помечается «Заменено
        уточнением»);
      - `unchanged` / `unsupported` → реплика с `message`;
      - ошибка → реплика по коду (п. 9) с кнопкой «Повторить» (новый `request_id`).
   7. Быстрое действие отправляет его `id` с пустыми `params`. Если у `quick`-действия есть
      `enum`-параметр — сначала выбор значения в меню. Поле ввода отправляет действие с
      `ui: 'input'`, его единственный `string`-параметр получает текст (≤ `max_length`, счётчик).
7. **Карточка предложения** (`ai/ai-proposal-card.tsx`):
   - «Было» — `baseText`, «Стало» — `variants[i].text`, счётчик `length / max_chars`, чип цели;
   - предупреждения:
     - `over_limit` — «Длиннее лимита поля на {over_by} символов — может не поместиться, после
       применения можно подвинуть или увеличить блок»;
     - `exceeds_hard_limit` — «Слишком длинно для этого поля — попросите короче», и «Применить»
       недоступно;
     - `not_shorter` — «Короче не получилось»;
     - `line_breaks_removed` — «Переносы строк убраны»;
     - `sharedFieldSlides > 1` — «Поле используется на N слайдах, изменится везде»;
   - **«Применить»:**
     1. Найти блок цели в текущем `deck`; блока нет → «Блок удалён».
     2. `block.text !== sourceText` → подтверждение «Текст изменился, пока работал AI. Заменить?».
     3. `editor.updateBlock(slideId, blockId, { text }, 'ai:' + edit_id)`, затем
        `editor.sealHistory()`.
     4. Карточка → «Применено» с кнопкой «Вернуть исходный» (новая правка `{ text: baseText }`, тоже
        с проверкой изменений). `pending` цели очищается.
   - **«Другой вариант»** — повтор того же действия и параметров от того же `sourceText`, с новым
     `request_id`. Новая карточка заменяет текущую как `pending`.
   - **«Отмена»** — карточка «Отклонено», `pending` цели очищается (следующее сообщение пойдёт от
     текста блока).
   - Карточка привязана к своей цели и применяется к своему блоку, даже если выбран другой.
   - Несколько вариантов (если сервер вернул больше одного) — переключатель вариантов.
8. **Панель чата** (`ai/ai-chat-panel.tsx`) и раскладка:

   | Ширина | Поведение |
   | --- | --- |
   | ≥ 1440 px | Отдельная колонка 360 px справа от панели свойств: rail · холст · свойства · чат. Кнопка свернуть/развернуть |
   | 1024–1439 px | Правая колонка с вкладками «Свойства» и «AI-чат». Выбор блока при открытом чате меняет только чип. `activateBlock` (двойной клик) переключает на «Свойства». Состояние чата при переключении сохраняется |
   | < 1024 px | Нижний лист до 60 % высоты, холст сверху остаётся кликабельным; лист и drawer свойств взаимоисключающие |

   - Медиазапросы — через существующий `useMediaQuery` в `editor-shell.tsx`; новую константу
     `CHAT_COLUMN_QUERY = '(min-width: 1440px)'` положить рядом с `WIDE_LAYOUT_QUERY`.
   - Открытие:
     - кнопка «AI-помощник» на холсте (`ai-assistant-trigger.tsx` становится кнопкой-переключателем
       панели и видна всегда, когда передан `aiEdit`);
     - кнопка «AI» в строке поля «Текст» панели свойств (открывает чат с этим блоком и фокусирует
       ввод);
     - Ctrl/Cmd + J.

     Состояние открытия хранится в `EditorShell` на время сессии.
   - Состав сверху вниз:
     - заголовок «AI-чат» и кнопка закрытия;
     - лента (автопрокрутка к новому, `aria-live="polite"` для новых ответов);
     - строка квоты;
     - чип цели с подсказкой «Выберите текст на слайде, чтобы сменить»;
     - быстрые действия;
     - поле ввода (Enter — отправить, Shift+Enter — перенос; плейсхолдер «Например: сделай
       формальнее»).

     Индикатор «AI готовит вариант…» показывается в ленте у сообщения.
   - Пустое состояние ленты: короткая подсказка, что умеет чат: сократить, переформулировать,
     изменить тон своими словами.
9. **Тексты ошибок по коду** (если сервер прислал `message`, показывать его; ниже — запасные
   тексты):
   - `ai_edit_limit` — «Дневной лимит AI-правок исчерпан. Попробуйте после {resets_at}»;
   - `ai_edit_failed` — «AI не ответил. Повторите попытку»;
   - `openai_disabled` — «AI не настроен»;
   - `invalid_target` — «Блок ещё не сохранён или удалён. Повторите через секунду»;
   - `text_too_long`, `invalid_text`, `invalid_params` — по `message`;
   - 401/403 — существующая обработка сессии (`isAuthenticationError`);
   - остальное — `message`.
10. **Встраивание.**
    - `editor-shell.tsx`: проп `aiEdit?: { port: AiEditPort; presentationId: string }` и
      `ensureSaved` из `editor.saveNow`; раскладка из п. 8.
    - `editor-page-client.tsx`: `aiEdit={{ port: createHttpAiEditPort(), presentationId }}`.
    - `app/studio/editor-demo/page.tsx`: мок-порт, `presentationId: 'demo'`, без `ensureSaved`.
11. **Доступность.** Вся панель работает с клавиатуры (Tab, Enter, Esc закрывает лист или
    вкладку). У кнопок карточки — понятные `aria-label` с указанием блока. Ошибки — `role="alert"`.
    Тексты на русском.

## 6. Требования к тестам

Команды: `pnpm test:frontend`, `pnpm typecheck`, `pnpm test:e2e:types`, `pnpm test:e2e` (Chromium
и WebKit). Перед выпуском — `pnpm verify`.

Unit:

- `generationApi.aiActions` и `textEdit`: URL, метод, CSRF у POST, тело точно по контракту
  (`refines_edit_id`, snake_case), таймаут, разбор ошибок.
- `toDeck`: `hardMaxChars` из `hard_max_chars`; если поля нет — значение `max_chars`.
- `ai-target`: обе цели, `chipLabel`, лимиты, `disabledReason`, `sharedFieldSlides`.
- `chat-reducer`:
  - отправка без `pending` берёт текст блока;
  - с `pending` — текст предложения и `refines_edit_id`;
  - «Другой вариант» — тот же `sourceText`, новый `request_id`;
  - «Отмена» и «Применить» очищают `pending`;
  - карточка-уточнение показывает `baseText`;
  - смена цели не трогает чужие `pending`;
  - сетевой повтор — тот же `request_id`;
  - `exceeds_hard_limit` запрещает применение;
  - `reloadServer` очищает ленту.
- Применение через `applyDeckAction`: меняется только `text`; поле с тем же `fieldKey` меняется на
  всех слайдах; один шаг undo; «Вернуть исходный» — новый шаг.
- Мок-порт отдаёт фикстуры, совпадающие с примерами контракта.

E2E (`e2e/ai-text-edit.spec.ts`). Нужен backend с профилем `e2e` и `ScriptedTextEditLlm`; его
делает backend-developer, переменные окружения добавить в `playwright.config.ts` по
договорённости. Сценарии:

- открыть чат кнопкой «AI-помощник»;
- выбрать поле → «Сократить» → «Применить»: текст на холсте и в панели изменился; Ctrl+Z
  возвращает; после перезагрузки сохранён новый текст;
- уточнение «ещё короче» по неприменённой карточке → новая карточка; по телу запроса в
  `GET /ai-calls` видно, что `text` — предыдущий вариант;
- выбор другого блока при открытом чате: чип сменился, лента на месте, старая карточка
  применяется к своему блоку;
- ручная правка во время запроса → подтверждение перед заменой;
- текст `__LONG__`: предупреждение `over_limit`, «Применить» → autosave без ошибки, после
  перезагрузки и в экспортированном PPTX (чтение XML, как в `e2e/editor.spec.ts`) текст полный;
  `__HUGE__` — «Применить» недоступно;
- «добавь слайд» → реплика `unsupported`, документ не изменился;
- `__FAIL__` → реплика об ошибке, редактор и autosave работают;
- раскладка на 1440, 1280 и 390 px: колонка, вкладки, нижний лист;
- существующие сценарии `editor.spec.ts`, `autosave.spec.ts`, `editor-protection.spec.ts`
  проходят. Эталонные скриншоты обновляются только после визуальной проверки, если на холсте
  появилась кнопка «AI-помощник».

## 7. Критерии приёмки (frontend)

1. **Панель рядом с холстом.** Дано: редактор на ширине 1440 px. Когда: «AI-помощник». Тогда:
   справа от панели свойств открыт чат, холст и свойства видны и работают. На 1280 px — вкладка
   «AI-чат» в правой колонке. На 390 px — нижний лист, холст сверху кликабелен.
2. **Чип цели.** Дано: чат открыт. Когда: пользователь выбирает поле заголовка третьего слайда.
   Тогда: чип «Слайд 3 · Заголовок». Когда: выбран другой блок. Тогда: чип сменился, чат не
   закрылся, лента сохранена.
3. **Сократить.** Дано: выбрано поле шаблона. Когда: «Сократить» → «Применить». Тогда: меняется
   только текст поля (и его копий с тем же `fieldKey`); оформление и геометрия прежние; autosave
   проходит «сохраняется» → «сохранено»; Ctrl+Z возвращает исходный текст одним шагом.
4. **Тон свободным запросом.** Дано: выбран пользовательский блок. Когда: «сделай формальнее» →
   «Применить». Тогда: изменился только текст блока.
5. **Уточнение без истории.** Дано: неприменённая карточка для блока. Когда: «ещё короче». Тогда:
   в запросе `text` — текст карточки и `refines_edit_id` — её `edit_id`; новая карточка
   показывает «Было» — исходный текст блока; предыдущая помечена «Заменено уточнением».
6. **Карточка привязана к блоку.** Дано: карточка для блока A, выбран блок B. Когда: «Применить» в
   карточке A. Тогда: меняется блок A, блок B не тронут.
7. **Одновременная правка.** Дано: идёт запрос. Тогда: холст и панель свойств доступны для ручной
   правки. Если текст целевого блока изменился, «Применить» требует подтверждения.
8. **Длинный результат.** Дано: вариант длиннее `max_chars` на 14 символов. Тогда: показан полный
   текст и предупреждение «длиннее лимита поля на 14 символов»; «Применить» меняет текст целиком;
   счётчик в панели свойств показывает превышение; autosave без ошибки; после перезагрузки текст
   полный. Дано: `exceeds_hard_limit`. Тогда: «Применить» недоступно, подсказка «попросите
   короче».
9. **Каталог управляет кнопками.** Дано: каталог с новым `quick`-действием неизвестного `id`.
   Тогда: оно показано кнопкой с запасной иконкой и отправляет свой `action`.
10. **Вне рамок.** Сообщение «добавь слайд про цены» → реплика с `message`, без карточки, документ
    не изменён.
11. **Ошибки.** `ai_edit_limit`, `ai_edit_failed`, `openai_disabled`, `invalid_target` → понятная
    реплика из п. 5.9; редактор работает, документ не изменён.
12. **Недоступно.** Выбрано изображение или ничего не выбрано → ввод и быстрые действия
    неактивны с подсказкой «Выберите текст на слайде».
13. **Безопасный вывод.** Вариант `<b>x</b>` или `**x**` показан как обычный текст.
14. **Лента в сессии.** После перезагрузки страницы лента пуста. В `localStorage` и
    `sessionStorage` нет текстов ленты.
15. **Демо.** На `/studio/editor-demo` панель работает на моке без сети.
16. **Регрессия.** `pnpm verify` зелёный; студия, тестовый чат, autosave, экспорт и восстановление
    работают как раньше.

## 8. Порядок работы

1. Контракт (раздел 3) — источник истины. Правки согласуются с backend-developer, и все три
   документа обновляются одновременно.
2. Не ждите backend. Шаги 1–9 делаются на `createMockAiEditPort` и unit-тестах, демо-страница
   служит ручным стендом.
3. Подключение к реальному API (шаг 10) и E2E — когда backend выложит endpoint,
   `ScriptedTextEditLlm` и сохранение длинного текста. Сверьте реальные ответы с фикстурами.
4. Рекомендуемый порядок PR:
   1. типы, клиент, порт, мок, `ai-target`, `chat-reducer` с тестами, мягкий лимит в панели;
   2. панель, карточки, раскладка на демо-странице;
   3. встраивание в реальный редактор и E2E.
5. Готово, когда выполнены критерии раздела 7 и `pnpm verify` зелёный.
