# ТЗ backend: AI-чат для правки выбранного текста в редакторе

Исполнитель: backend-developer. Параллельно frontend-developer работает по
[ai-text-edit-frontend.md](ai-text-edit-frontend.md). Общая спецификация:
[../ai-chat-editing.md](../ai-chat-editing.md). Раздел «API-контракт» во всех трёх документах
совпадает дословно (между маркерами `BEGIN/END:ai-text-edit-contract`); его нельзя менять без
согласования с frontend.

## 1. Цель

На странице редактирования появляется панель AI-чата. Пользователь выбирает текстовый блок (поле
шаблона или свой текстовый блок) и нажимает «Сократить» или «Переформулировать». Либо пишет
свободный запрос: «сделай формальнее», «ещё короче». ИИ предлагает новый текст только для этого
блока, браузер применяет его обычной правкой редактора.

Backend должен:

1. Отдавать каталог действий и endpoint, который по тексту блока возвращает предложение модели.
   Документ презентации endpoint **не меняет**.
2. Тратить минимум токенов: в модель уходят только текст-источник, лимит поля, роль поля и два
   коротких заголовка. Истории переписки и повторных вызовов нет.
3. **Не обрезать** длинный результат: возвращать полный текст с предупреждением.
4. Разрешить редактору сохранять, загружать и экспортировать текст поля длиннее `max_chars` (до
   жёсткого предела) без обрезки. Первичная генерация, ручная сборка и тестовый чат студии при этом
   должны работать как раньше.
5. Заложить расширяемость: новое действие добавляется одним `@Component`. Позже на том же ядре
   появятся структурные операции (раздел 12 спецификации).

## 2. Контекст: что уже есть в коде

Стек: Java 26, Spring Boot 4.1.1, Spring Data JPA, PostgreSQL, Flyway. Слои и транзакции описаны в
`docs/backend-architecture.md`. Корень — `backend/src/main/java/ru/godeck/presentation/`.

| Что | Где | Зачем вам |
| --- | --- | --- |
| Семантическая модель | `model/PresentationContent.java:273` — `fields: Map<String,String>`, `slides[]` с `slide` (номер исходного слайда), `include`, `hidden`, `textBlocks` (`id`, `text`, …) | Поиск цели и контекста |
| Черновик редактора | `model/PresentationEditorDraft.java`, колонка `editor_json` (V8); `service/PresentationEditorService.java:345-357` (`currentDraft`), `mapper/PresentationEditorDraftCodec.java` | Цель ищется в черновике, если он актуален, иначе в `content_json` |
| Id слайда в редакторе | `template/PresentationTemplateService.java:519-520`: `"slide-" + номер` | Разбор `target.slide_id` |
| Поля и лимиты | `PresentationTemplateService.fields(id)` → `Map<поле, max_chars>`; `slideManifest(id)` → `[{slide, fields[]}]`; `description(id)` → sidecar с `field_hints.<FIELD>.description` (у `aurora` sidecar нет) | Лимит, роль, заголовок слайда |
| Нормализация с обрезкой | `template/PresentationContentValidator.java:46-87` (`normalize`), `:197-230` (`normalizeValues` → `limit()`: обрезка с «…») | Нужен режим без обрезки (раздел 6, шаг 1) |
| Где сейчас режется длинный текст в редакторе | `PresentationEditorService.java:323-330` (draft: `length() > limit` → 422 `invalid_content`), `:332-335` (`normalize`), `:353` (`currentDraft`), `:224` (commit); `PresentationTemplateService.java:394` (`editorDeck`), `:317` (`render` нормализует ещё раз); `storage/PresentationFiles.java:67-73` (`write` → `render`) | Изменить пути редактора (раздел 6, шаг 1) |
| Пути, которые должны продолжать обрезать | `worker/PresentationWorker.java:109` (генерация), `service/PresentationService.java:210` (ручная сборка), `:295-308` (тестовый чат) | Не менять |
| DTO редактора | `dto/EditorDeckView.java` (`TextBlock.maxChars`), `dto/SaveEditorDraftRequest.java` (`CustomTextBlock.text @Size(max = 4000)`) | Добавить `hardMaxChars` |
| Владение | `repository/PresentationRepository.findByIdAndUserId`; пример — `PresentationService.java:366-370` | 404 для чужих |
| Пользователь | `auth/security/AuthPrincipal`; пример — `controller/PresentationEditorController.java:147-149` | — |
| Ошибки | `exception/GenerationError.java`; `controller/GenerationExceptionHandler.java` — `@RestControllerAdvice(assignableTypes = {...})`, формат `{"error":{"code","message"}}`; тексты — `resources/messages.properties` | Новый контроллер **нужно добавить** в `assignableTypes` |
| Модели | `ai/PresentationModelCatalog.java` (`resolve` → 422 `unsupported_model`) | Проверка `model` |
| Аудит AI | `service/PresentationAiCallHistory` (`start` до HTTP, `complete`), `entity/PresentationAiCall.java`, `model/AiOperation` (`GENERATION`, `CHAT`), V7 `CHECK (operation IN ('GENERATION','CHAT'))` | Запись каждого вызова |
| Образец HTTP-вызова | `ai/PresentationContentGenerator.java:84-141`, `ai/OpenAiResponseReader.java:176-192` | Скопировать подход; эти файлы **не менять** |
| HTTP-клиент | `config/OpenAiClientConfig.java` (bean `openAiClient`, read timeout 2 мин) | Нужен отдельный bean с таймаутом 30 с |
| Включение AI | `godeck.generation.enabled`, `godeck.generation.api-key` | 503 `openai_disabled`, `enabled` в каталоге |
| Безопасность | `config/SecurityConfig.java:78-83` (всё, кроме `/api/auth/**`, требует аутентификации; CSRF включён) | Новые маршруты защищены автоматически |
| Тесты | `backend/src/test/java/ru/godeck/presentation/...`, `service/PresentationGenerationIntegrationTest.java`, `template/PresentationContentValidatorTest.java`, `template/PresentationTemplateServiceTest.java`; `docs/backend-testing.md` | Образцы |

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
| 409 | `presentation_not_ready` | статус презентации не `succeeded` |
| 409 | `idempotency_conflict` | тот же `request_id` с другим телом запроса |
| 409 | `ai_edit_in_progress` | правка с этим `request_id` ещё выполняется |
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

- Не менять первичную генерацию: `PresentationRequestFactory`, `PresentationPrompts`,
  `PresentationContentGenerator`, `OpenAiResponseReader`, `prompts/presentation-*.txt`,
  `PresentationWorker`. Тело запроса генерации и её обрезка по лимитам остаются прежними.
- Не менять `OpenAiClientConfig` и таймауты `openAiClient`.
- Не менять тестовый чат студии (`POST /v1/presentations/{id}/chat`, `PresentationService.chat`,
  `preserveEditorBlocks`) и не исправлять его известные ограничения.
- Не менять сигнатуры и поведение существующих `normalize(...)`, `render(...)`,
  `PresentationFiles.write(...)` — только добавлять перегрузки.
- Не обрезать AI-результат и не делать повторный вызов модели при превышении длины.
- Не изменять документ презентации из AI-endpoint (`content_json`, `editor_json`, ревизии, PPTX) и
  не брать lease `edit_id`.
- Не хранить ленту чата на сервере и не передавать в модель историю, `topic`, описание шаблона,
  другие поля и слайды, геометрию.
- Не делать структурные операции, правку части текста, стриминг, фиксированный список тонов.
- Не писать тексты слайдов и запросов в обычные логи.
- Не менять `frontend/`.

## 5. Данные: миграция `V9__presentation_ai_edits.sql`

```sql
CREATE TABLE presentation_ai_edits (
    id UUID PRIMARY KEY,
    presentation_id UUID NOT NULL REFERENCES generated_presentations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('TEXT_EDIT')),
    request_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    refines_edit_id UUID REFERENCES presentation_ai_edits(id) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL,
    params_json TEXT NOT NULL,
    target_kind VARCHAR(16) NOT NULL,
    target_ref VARCHAR(200) NOT NULL,          -- "slide-3/STATEMENT" или "slide-3/<block_id>"
    source_length INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('running','ok','unchanged','unsupported','failed')),
    result_json TEXT,                          -- тело ответа 200 для повтора по request_id
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER, cached_input_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    UNIQUE (user_id, request_id)
);
CREATE INDEX presentation_ai_edits_user_day_idx ON presentation_ai_edits(user_id, created_at);
CREATE INDEX presentation_ai_edits_presentation_idx ON presentation_ai_edits(presentation_id, created_at DESC);

ALTER TABLE presentation_ai_calls DROP CONSTRAINT presentation_ai_calls_operation_check;
ALTER TABLE presentation_ai_calls ADD CONSTRAINT presentation_ai_calls_operation_check
    CHECK (operation IN ('GENERATION', 'CHAT', 'TEXT_EDIT'));
ALTER TABLE presentation_ai_calls
    ADD COLUMN input_tokens INTEGER,
    ADD COLUMN cached_input_tokens INTEGER,
    ADD COLUMN output_tokens INTEGER,
    ADD COLUMN reasoning_tokens INTEGER;
CREATE INDEX presentation_ai_calls_retention_idx ON presentation_ai_calls(operation, started_at);
```

- Имя ограничения V7 перед миграцией проверьте в схеме: PostgreSQL генерирует
  `presentation_ai_calls_operation_check`.
- Колонки usage допускают `NULL`; генерация и тестовый чат работают без изменений.
- `request_hash` — SHA-256 (`common/security/Hashing`) от нормализованного тела без `request_id`.
- **Хранение 90 дней.** Ежедневная `@Scheduled`-задача `AiEditRetention` удаляет строки
  `presentation_ai_edits` и `presentation_ai_calls` с `operation = 'TEXT_EDIT'` старше
  `AiEditPolicy.RETENTION = 90 дней`, пачками по 1000. Записи генерации и тестового чата задача
  не трогает: это решение Q2 спецификации (подтверждено владельцем).

## 6. Устройство и шаги реализации

Пакет `ru.godeck.presentation.aiedit`, в существующем стиле: один публичный DTO в файле, сущности
не выходят в HTTP, промпты — в `resources/prompts/`, пользовательские тексты — в
`messages.properties`.

1. **Длинный текст в редакторе (без влияния на генерацию).**
   1. `template/TextLengthMode { TRUNCATE, ALLOW_OVERFLOW }` и `template/EditorTextLimits.hard(int
      max) = min(4000, max(2 * max, max + 100))`.
   2. `PresentationContentValidator`: новая перегрузка `normalize(content, fields, slideCount,
      TextLengthMode)` и `normalizeValues(values, fields, mode)`.
      - `TRUNCATE` — текущее поведение байт-в-байт; существующие методы делегируют в этот режим.
      - `ALLOW_OVERFLOW` — текст поля не обрезается; `length > hard(max)` →
        `IllegalArgumentException` → `INVALID_CONTENT`; остальные проверки те же.
   3. `PresentationTemplateService`:
      - `normalizeEditor(id, content)` — режим `ALLOW_OVERFLOW`;
      - перегрузка `render(id, content, imageResolver, TextLengthMode)`; существующие `render`
        вызывают её с `TRUNCATE`;
      - `editorDeck(...)` нормализует через `normalizeEditor` и заполняет новое поле
        `EditorDeckView.TextBlock.hardMaxChars` (JSON `hard_max_chars`): `hard(maxChars)` для полей,
        4000 для пользовательских блоков.
   4. `PresentationFiles.write(id, version, templateId, content, TextLengthMode)` — новая
      перегрузка; существующая вызывает её с `TRUNCATE`.
   5. `PresentationEditorService`:
      - в `apply` проверка `field.getValue().length() > limit` (`:330`) заменяется на `>
        EditorTextLimits.hard(limit)`; `templates.normalize` (`:332`) — на `normalizeEditor`;
      - в `currentDraft` (`:353`) — `normalizeEditor`;
      - в `commit` (`:224`) — `normalizeEditor` и `files.write(..., ALLOW_OVERFLOW)`.
   6. Генерация (`PresentationWorker`), ручная сборка (`PresentationService.submitManual`) и
      тестовый чат не меняются: они вызывают старые методы с `TRUNCATE`.
2. **Политика и ошибки.** `policy/AiEditPolicy`:
   - `MAX_TEXT_EDITS_PER_DAY = 100`, `QUOTA_WINDOW = 24h`;
   - `MAX_VARIANTS = 3`, `DEFAULT_VARIANTS = 1`;
   - `CUSTOM_BLOCK_MAX_INPUT_CHARS = 2000`, `CUSTOM_BLOCK_MAX_CHARS = 4000`;
   - `MAX_INSTRUCTION_LENGTH = 300`;
   - `CONTEXT_TITLE_MAX = 80`, `ROLE_MAX = 160`;
   - `STALE_AFTER = 2 min`, `READ_TIMEOUT = 30 s`, `RETENTION = 90 days`.

   В `GenerationError` добавить: `AI_EDIT_IN_PROGRESS` (409), `AI_EDIT_LIMIT` (429),
   `AI_EDIT_FAILED` (502), `UNSUPPORTED_ACTION`, `INVALID_PARAMS`, `INVALID_TARGET`,
   `INVALID_TEXT`, `TEXT_TOO_LONG` (422) — с кодами из контракта и сообщениями в
   `messages.properties`. `AiOperation.TEXT_EDIT`.
3. **Миграция V9**, сущность `entity/PresentationAiEdit`, `repository/PresentationAiEditRepository`
   (`findByUserIdAndRequestId`, `countByUserIdAndCreatedAtAfter`, минимальный `created_at` в окне —
   для `resets_at`, проверка `refines_edit_id` по `(id, user_id, presentation_id)`). Usage — в
   `PresentationAiCall` и в новую перегрузку `PresentationAiCallHistory.complete`; старая
   сигнатура остаётся. Задача хранения `AiEditRetention`.
4. **Реестр действий.**
   - Интерфейс `action/TextEditAction` — сигнатура в спецификации, раздел 4.2.
   - `ActionUi { QUICK, INPUT }`, `ActionParam(name, type ENUM|STRING, required, maxLength,
     options)`.
   - `TextEditActionRegistry` проверяет при старте уникальность `id` и наличие ровно одного
     `INPUT`-действия, валидирует `params` (→ `invalid_params`), строит каталог.
   - Встроенные действия:
     - `ShortenAction` (`QUICK`): `targetLength = min(maxChars, ceil(len × 0.7))`, предупреждение
       `not_shorter`;
     - `RephraseAction` (`QUICK`): длина ≈ исходной, ≤ `maxChars`;
     - `CustomAction` (`INPUT`, параметр `instruction` ≤ 300): передаётся модели в поле `request`,
       им же задаётся тон. Действия `change_tone` и списка тонов нет.
5. **Цель.** `core/AiEditTarget` (sealed: `TemplateFieldTarget`, `CustomBlockTarget`) и
   `TargetResolver`:
   - владение (404), статус `SUCCEEDED` (409);
   - документ — актуальный черновик или `content_json`, по той же логике, что `currentDraft`;
   - слайд включён; поле есть в manifest слайда; блок есть в `textBlocks` слайда (иначе
     `invalid_target`);
   - лимиты:
     - поле — `max_chars = fields(templateId).get(field)`, `hard_max_chars = EditorTextLimits.hard`,
       допустимый `text` ≤ `hard_max_chars`;
     - пользовательский блок — `max_chars = hard_max_chars = 4000`, допустимый `text` ≤ 2000;

     нарушение — `text_too_long`; пустой текст или маркеры — `invalid_text`;
   - контекст:
     - `role` — `field_hints.<FIELD>.description`, обрезка до `ROLE_MAX` (это обрезка
       контекста, а не результата); `null` для пользовательских блоков и шаблонов без sidecar;
     - `deck_title` — значение `TITLE`;
     - `slide_title` — первое поле слайда по manifest, в имени которого есть `TITLE` (иначе
       первое поле), или `null`, если это сама цель.

     Оба заголовка — до `CONTEXT_TITLE_MAX`, пустые → `null`.
6. **Клиент LLM.**
   - `ai/AiResponsesClient` — аудируемый POST в `https://api.openai.com/v1/responses` через новый
     bean `RestClient openAiTextEditClient` (read 30 с, connect 10 с; новый `@Configuration` в
     `aiedit`). Запись `presentation_ai_calls` (`TEXT_EDIT`) — строго до HTTP; без неё вызов не
     выполняется. Ключ маскируется. Usage берётся из `usage.input_tokens`,
     `usage.input_tokens_details.cached_tokens`, `usage.output_tokens`,
     `usage.output_tokens_details.reasoning_tokens`.
   - Интерфейс `TextEditLlm`, реализации `OpenAiTextEditLlm` и `ScriptedTextEditLlm`. Заглушка
     детерминирована:
     - `shorten` → первые слова источника;
     - `rephrase` → слова в другом порядке;
     - `custom` со словом «слайд» → `unsupported`;
     - текст `__LONG__` → вариант длиннее `max_chars`, но не длиннее `hard_max_chars`;
     - текст `__HUGE__` → вариант длиннее `hard_max_chars`;
     - текст `__FAIL__` → ошибка провайдера.

     Она активна только в профилях `test`/`e2e` (свойство `godeck.ai-edit.llm=scripted`); в другом
     профиле приложение не стартует. Сделайте её **первой**, вместе с каталогом и endpoint: она
     нужна frontend для E2E.
7. **Запрос и разбор.**
   - `ai/TextEditRequestFactory` (чистый класс):
     - `instructions` из `prompts/text-edit-instructions.txt` (≤ 900 символов, содержание — в
       спецификации, раздел 5.2);
     - `input` — компактный JSON `{task, max_chars, role, deck_title, slide_title, request,
       variants, text}`; лимит `max_chars` передаётся всегда;
     - strict schema `{status: enum[ok, unsupported], message: string, variants: [{text: string}]}`,
       все поля required, `additionalProperties: false`;
     - `store: false`, `max_output_tokens = min(2048, 256 + variants × ceil(max_chars / 2))`;
     - модель — `GODECK_AI_EDIT_MODEL` (`godeck.ai-edit.model`, по умолчанию `gpt-5.4-mini`) через
       `PresentationModelCatalog.resolve`; точка конфигурации reasoning effort по модели, включается
       только для моделей, которые его поддерживают.
   - `ai/TextEditResponseParser`: `status: completed`, сборка `output_text`, строгий JSON. Ответ
     `ok` без вариантов — невалидный.
8. **Очистка.** `text/TextResultSanitizer` по спецификации, раздел 5.3:
   - кавычки и markdown; переносы (`line_breaks_removed`); удаление `{{`/`}}`;
   - `over_limit` + `over_by` при `length > max_chars`, `exceeds_hard_limit` при `length >
     hard_max_chars`;
   - `not_shorter` — от действия;
   - пустые варианты и дубликаты отбрасываются, все равны источнику → `unchanged`.

   **Без обрезки и без повторного вызова.**
9. **Оркестратор.** `service/AiTextEditService.edit(userId, presentationId, request)`:
   1. Проверки без записи: каталог и параметры, модель, `TargetResolver`, `refines_edit_id`,
      `enabled` (503).
   2. `AiEditTransactions.start` (короткая транзакция) — поиск по `(user_id, request_id)`:
      - есть и хеш другой → `idempotency_conflict`;
      - `running` и моложе `STALE_AFTER` → `ai_edit_in_progress`;
      - `running` и старше `STALE_AFTER` → пометить `failed`, вернуть `ai_edit_failed`;
      - завершённый `ok`/`unchanged`/`unsupported` → `result_json` с `replayed: true`;
      - `failed` → `ai_edit_failed`.

      Затем квота (≥ 100 строк за окно → `ai_edit_limit`) и вставка `running`. Гонку решает
      `UNIQUE (user_id, request_id)`: проигравший после rollback перечитывает строку победителя.
   3. Один вызов LLM **без открытой транзакции**, затем очистка.
   4. `AiEditTransactions.complete` / `fail` — короткие транзакции: статус, `result_json`, usage,
      `error_code`, `completed_at`.
   5. Ответ по контракту; квота считается после вставки.
10. **Контроллер.** `controller/AiEditController`:
    - `GET /api/generation/v1/editor/ai/actions`;
    - `POST /api/generation/v1/presentations/{id}/editor/ai/text-edits`.

    `@Valid` DTO строго по контракту (`@JsonNaming(SnakeCaseStrategy)`), `Cache-Control: no-store`.
    Добавить в `assignableTypes` `GenerationExceptionHandler`.
11. **Логи** — одна строка на правку: id правки и презентации, действие, модель, статус, usage,
    длительность, код ошибки. Без текстов.
12. **Документация:**
    - `docs/presentation-generation.md` — маршруты, квота, «редактор сохраняет текст длиннее
      лимита до жёсткого предела»;
    - `docs/backend-architecture.md` — пакет `aiedit`, `AiEditPolicy`, `TextLengthMode`;
    - `docs/backend-testing.md` — новые сценарии;
    - `docs/application-processes-uml.md` — диаграмма из спецификации (раздел 4.1).

## 7. Требования к тестам

Команды: `pnpm backend:test:unit`, `pnpm backend:test:integration`, `pnpm backend:test` (нужен
`pnpm infra:up`). Платный API не вызывается: используется `ScriptedTextEditLlm`.

Unit:

- `TextEditActionRegistry`: уникальность id, ровно одно `INPUT`-действие, каталог совпадает с JSON
  контракта (snapshot), валидация параметров.
- `TextEditRequestFactory`: snapshot для каждого действия. Есть `max_chars`; нет `topic`, описания
  шаблона, других полей, истории; `store: false`; формула `max_output_tokens`.
- `TextEditResponseParser`: `completed`/`incomplete`, несколько частей `output_text`, неверный
  JSON, лишние поля, `ok` без вариантов.
- `TextResultSanitizer`: кавычки, markdown, переносы, маркеры, `over_limit`/`over_by`,
  `exceeds_hard_limit`, `not_shorter`, `unchanged`. Проверить, что текст **ни в одном случае не
  обрезается**.
- `PresentationContentValidator`:
  - `TRUNCATE` даёт тот же результат, что до изменения (существующие тесты без правок);
  - `ALLOW_OVERFLOW` сохраняет текст до `hard(max)` целиком и отклоняет `hard(max) + 1`;
  - граница `EditorTextLimits.hard` для `max` = 7, 46, 170, 3000.
- `TargetResolver`: заголовки, цель-заголовок, `aurora` без sidecar, исключённый слайд, поле не со
  своего слайда, блок только в черновике или только в опубликованном документе, лимиты входа.
- **Golden-тест генерации:** тело `PresentationRequestFactory.create(...)` для фиксированного
  входа совпадает со снимком. `PresentationRequestFactoryTest` и
  `PresentationContentGeneratorTest` проходят без изменений.

Integration (PostgreSQL, MockMvc с настоящим Spring Security):

- 200 для поля и пользовательского блока; запись `TEXT_EDIT` с usage в `presentation_ai_calls`;
  строка `ok` в `presentation_ai_edits`.
- AI-endpoint не меняет `content_json`, `editor_json`, `editor_revision`, `current_version`,
  ревизии и файлы.
- Уточнение: `refines_edit_id` предыдущей правки → 200, связь сохранена; чужой или неизвестный id →
  422 `invalid_input`; `text` длиной до `hard_max_chars` принимается.
- `__LONG__` → вариант полной длины с `over_limit` и `over_by`, ровно один вызов LLM.
- `__HUGE__` → `exceeds_hard_limit`.
- **Длинный текст в редакторе:**
  - `PUT /editor/draft` с полем длиной `max_chars + 10` → 200;
  - затем `GET /editor` отдаёт полный текст и `hard_max_chars`;
  - затем `POST /editor/commit` → PPTX (чтение XML) и `content_json` содержат полный текст;
  - поле длиной `hard_max_chars + 1` → 422 `invalid_content`.
- **Генерация по-прежнему обрезает:** очередь со слишком длинным ответом тестового генератора →
  PPTX и `content_json` обрезаны по `max_chars`, как в существующих тестах; ручная сборка тоже.
- Чужая презентация → 404; без сессии → 401; без CSRF → 403; не `succeeded` → 409.
- Каждый код 422 контракта — без вызова LLM.
- Квота: 101-й запрос за 24 часа → 429 без вызова LLM.
- Идемпотентность: повтор → `replayed: true` без второго вызова и без расхода квоты; другое тело →
  409; два параллельных одинаковых запроса → один вызов LLM.
- Ошибка провайдера или таймаут → 502 `ai_edit_failed`, строка `failed`.
- Во время AI-правки autosave и экспорт работают (lease не берётся); транзакция БД не открыта во
  время вызова `TextEditLlm`.
- `openai_disabled` → 503, а каталог отдаёт `enabled: false`.
- `AiEditRetention` удаляет записи `TEXT_EDIT` старше 90 дней и не трогает `GENERATION`/`CHAT`.
- Регрессия: `PresentationGenerationIntegrationTest` (включая тестовый чат) проходит без изменений.

Аутентификацию задача не меняет, поэтому auth-smoke-тест из AGENTS.md не обязателен. Integration-
тесты 401/403/404 обязательны.

## 8. Критерии приёмки (backend)

1. **Каталог.** Дано: пользователь вошёл. Когда: `GET /api/generation/v1/editor/ai/actions`. Тогда:
   200, тело совпадает с примером контракта (`shorten` и `rephrase` с `ui: quick`, `custom` с
   `ui: input`, без `change_tone`); при выключенном AI — `enabled: false`.
2. **Поле шаблона.** Дано: на `slide-3` есть поле `STATEMENT` с лимитом 46. Когда: `action:
   shorten` с текущим текстом. Тогда: 200, `status: ok`, `max_chars: 46`, `hard_max_chars: 146`,
   `usage` заполнен, `quota.remaining` уменьшился на 1.
3. **Документ не меняется.** Дано: состояние презентации до запроса. Когда: успешная AI-правка.
   Тогда: `content_json`, `editor_json`, `editor_revision`, `current_version`, ревизии и файлы
   прежние.
4. **Минимальный контекст.** Дано: успешная правка. Когда: смотрим `request_body` в
   `presentation_ai_calls`. Тогда: только инструкции, схема и `input` с `task`, `max_chars`,
   `role`, `deck_title`, `slide_title`, `request`, `variants`, `text`.
5. **Уточнение без истории.** Дано: правка E1 вернула вариант V. Когда: `action: custom`,
   `instruction: "ещё короче"`, `text: V`, `refines_edit_id: E1`. Тогда: 200; в `request_body` есть
   только V и просьба, без текста E1 и прошлых сообщений; в журнале сохранён `refines_edit_id`.
6. **Длинный результат без обрезки.** Дано: модель вернула текст на 14 символов длиннее
   `max_chars`. Тогда: вариант возвращён целиком, `over_by: 13`, `warnings: ["over_limit"]`, вызов
   модели был один.
7. **Длинный текст в редакторе.** Дано: черновик с полем длиной `max_chars + 13`. Когда: autosave →
   `GET /editor` → экспорт. Тогда: 200 на каждом шаге, текст полный в ответе `GET`, в
   `content_json` и в PPTX. Дано: длина `hard_max_chars + 1`. Тогда: 422 `invalid_content`.
8. **Генерация не тронута.** Дано: golden-снимок запроса генерации и существующие тесты. Тогда:
   снимок совпадает, генерация и ручная сборка обрезают текст по `max_chars`, все существующие
   тесты зелёные.
9. **Вне рамок.** Дано: `custom` «добавь слайд про цены». Когда: модель отвечает `unsupported`.
   Тогда: 200, `status: unsupported`, `variants: []`, `message` не пустой.
10. **Ошибки ввода.** Дано: каждый невалидный ввод из таблицы ошибок. Тогда: соответствующий код,
    LLM не вызывался.
11. **Доступ.** Дано: презентация пользователя A. Когда: запрос от B / без сессии / без CSRF. Тогда:
    404 / 401 / 403.
12. **Квота.** Дано: за 24 часа 100 правок. Тогда: 429 `ai_edit_limit` без вызова модели.
13. **Идемпотентность.** Дано: успешная правка с `request_id = R`. Когда: тот же запрос. Тогда: тот
    же ответ, `replayed: true`, квота не изменилась. Когда: другое тело с `R`. Тогда: 409
    `idempotency_conflict`.
14. **Сбой провайдера.** Дано: провайдер вернул 500 или не ответил за 30 с. Тогда: 502
    `ai_edit_failed`, строка `failed`, документ не изменён, следующий запрос с новым `request_id`
    обрабатывается.
15. **Хранение.** Дано: записи `TEXT_EDIT` старше 90 дней. Когда: запуск `AiEditRetention`. Тогда:
    они удалены, записи генерации и тестового чата остались.

## 9. Порядок работы

1. Контракт (раздел 3) мержится первым, без изменений. Правки согласуются с frontend-developer, и
   все три документа обновляются одновременно.
2. Frontend разрабатывает на моке и не ждёт backend. Для E2E ему нужны endpoint, каталог и
   `ScriptedTextEditLlm` (шаг 6), а также поле `hard_max_chars` и сохранение длинного текста
   (шаг 1).
3. Рекомендуемый порядок PR:
   1. шаг 1 (длинный текст в редакторе) с тестами генерации и редактора;
   2. V9, ошибки, политика, реестр, каталог, заглушка LLM, endpoint;
   3. квоты, идемпотентность, `refines_edit_id`, хранение 90 дней, документация.
4. Готово, когда выполнены критерии раздела 8 и `pnpm backend:test` зелёный.
