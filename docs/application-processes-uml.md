# UML основных процессов GoDeck

Документ описывает backend как систему взаимодействующих модулей и методов. «Действующие лица» на
sequence-диаграммах — контроллеры, сервисные методы, транзакционные границы, репозитории, worker,
AI-провайдер и файловое хранилище. Браузер показан только как внешняя граница протокола.

Диаграммы написаны на Mermaid и отображаются непосредственно в GitLab. Они документируют текущую
реализацию, а не желаемую архитектуру.

## Как читать диаграммы

- `Controller.method` принимает HTTP-запрос, извлекает principal и формирует HTTP-ответ.
- `Service.method` выполняет прикладной сценарий и проверяет бизнес-правила.
- `Transactions.method` — короткая транзакция с блокировкой или атомарной публикацией.
- `Repository` — PostgreSQL/JPA, durable source of truth для статусов, версий и черновиков.
- `TemplateService` и `PresentationFiles` — преобразование semantic content в PPTX и безопасное
  хранение файлов.
- `PresentationContent` — каноническая семантическая модель: значения полей, порядок/видимость
  слайдов, дополнительные текстовые и графические блоки, позиции template-owned text shapes.
- Пунктирная стрелка означает возврат результата. Сплошная — вызов или передачу данных.

## 1. Карта основных модулей

```mermaid
flowchart LR
    Browser["Frontend / browser"]

    subgraph HTTP["HTTP boundary"]
        AuthController["AuthController"]
        GenerationController["GenerationController"]
        EditorController["PresentationEditorController"]
        Security["SecurityConfig + SessionSecurityFilter"]
    end

    subgraph Application["Application services"]
        AuthService["AuthService"]
        RegistrationService["RegistrationService"]
        PresentationService["PresentationService"]
        EditorService["PresentationEditorService"]
        Transactions["PresentationTransactions"]
        Worker["PresentationWorker"]
    end

    subgraph Domain["Semantic domain and template engine"]
        Content["PresentationContent"]
        Validator["PresentationContentValidator"]
        Template["PresentationTemplateService"]
        Codecs["Content / EditorDraft codecs"]
    end

    subgraph Integrations["External and durable boundaries"]
        Repositories["JPA repositories / PostgreSQL"]
        Files["PresentationFiles / private filesystem"]
        AI["PresentationContentGenerator / OpenAI"]
        Mail["AuthMailService / SMTP"]
    end

    Browser --> Security
    Security --> AuthController
    Security --> GenerationController
    Security --> EditorController

    AuthController --> AuthService
    AuthService --> RegistrationService
    AuthService --> Repositories
    RegistrationService --> Repositories
    RegistrationService --> Mail

    GenerationController --> PresentationService
    EditorController --> EditorService
    PresentationService --> Transactions
    EditorService --> Transactions
    Worker --> Transactions

    PresentationService --> AI
    Worker --> AI
    AI --> Codecs
    PresentationService --> Codecs
    EditorService --> Codecs

    PresentationService --> Template
    EditorService --> Template
    Worker --> Template
    Template --> Validator
    Validator --> Content

    PresentationService --> Files
    EditorService --> Files
    Worker --> Files
    Files --> Template
    Transactions --> Repositories
```

Главная граница архитектуры: HTTP-слой не работает напрямую с JPA-сущностями или путями файлов.
Прикладные сервисы оперируют semantic content и immutable snapshot-объектами. Медленные операции
(OpenAI, Apache POI, файловая система) выполняются вне транзакции; короткие методы
`PresentationTransactions` резервируют работу и затем атомарно публикуют результат.

## 2. Регистрация, подтверждение и создание сессии

```mermaid
sequenceDiagram
    autonumber
    participant AuthAPI as AuthController.identify/register/verify
    participant Register as AuthService.register
    participant Registration as RegistrationService.register
    participant VerificationRepo as EmailVerificationRepository
    participant UserRepo as UserAccountRepository
    participant Mail as AuthMailService.sendCode
    participant Verify as AuthService.verify
    participant Session as AuthController.startSession

    AuthAPI->>UserRepo: identify: existsByEmail(normalizedEmail)
    alt Account already exists
        UserRepo-->>AuthAPI: true
        AuthAPI-->>AuthAPI: next step = PASSWORD
    else No account
        AuthAPI->>VerificationRepo: findByEmailAndChallengeId(email, sessionChallenge)
        alt Matching pending registration
            VerificationRepo-->>AuthAPI: pending verification
            AuthAPI-->>AuthAPI: next step = VERIFY + cooldown
        else No matching pending registration
            AuthAPI-->>AuthAPI: next step = CREATE_PASSWORD
        end
    end

    Register->>Register: normalize email + validate password bytes
    Register->>Registration: register(email, password) in isolated transaction
    Registration->>VerificationRepo: lock/find pending row
    Registration->>UserRepo: reject already-created account
    Registration->>Registration: generate challenge and verification code
    Registration->>VerificationRepo: saveAndFlush hashes and expiry
    Note over Registration,VerificationRepo: Flush precedes SMTP so a concurrent loser cannot send a second code
    Registration->>Mail: sendCode(email, plaintextCode)
    Registration-->>Register: opaque challenge id
    Register-->>AuthAPI: challenge is stored in browser HTTP session

    Verify->>VerificationRepo: load by email and compare session challenge
    Verify->>Verify: check expiry, attempt limit, BCrypt code
    alt Invalid code
        Verify->>VerificationRepo: increment failed attempts
        Verify-->>AuthAPI: INVALID_CODE or TOO_MANY_ATTEMPTS
    else Valid code
        Verify->>UserRepo: saveAndFlush new UserAccount
        Verify->>VerificationRepo: delete pending registration
        Verify-->>Session: AuthPrincipal(id, email, credentialsVersion)
        Session->>Session: invalidate old session and create a new one
        Session->>Session: persist authenticated SecurityContext
    end
```

Зачем здесь два сервиса: `RegistrationService.register` владеет одной транзакцией вставки и SMTP.
`AuthService.register` запускает её без окружающей транзакции, поэтому при конкурентной вставке
проигравшая транзакция успевает полностью откатиться до повторного чтения строки победителя.

## 3. Проверка сессии и защита HTTP-запроса

```mermaid
sequenceDiagram
    autonumber
    participant Filter as SessionSecurityFilter.doFilterInternal
    participant SessionCheck as AuthService.sessionValid
    participant UserRepo as UserAccountRepository
    participant RateLimit as SessionSecurityFilter.rateLimited
    participant SpringSecurity as SecurityFilterChain
    participant Controller as Auth/Generation/Editor Controller

    alt Local loopback development bypass
        Filter->>Filter: install fixed debug AuthPrincipal
    else Normal session
        Filter->>SessionCheck: sessionValid(principal)
        SessionCheck->>UserRepo: existsByIdAndCredentialsVersion
        alt Password reset revoked the session
            UserRepo-->>Filter: false
            Filter->>Filter: invalidate session + clear SecurityContext
        end
    end

    opt POST /api/auth/*
        Filter->>RateLimit: count direct remote address in fixed window
        alt Limit exceeded
            RateLimit-->>Filter: HTTP 429 + Retry-After
        end
    end

    Filter->>SpringSecurity: continue filter chain
    SpringSecurity->>SpringSecurity: authorize route + validate session CSRF
    SpringSecurity->>Controller: invoke only when policy passes
```

`credentialsVersion` делает смену пароля глобальным отзывом старых сессий без отдельной таблицы
session-токенов. CSRF остаётся включённым и для анонимных state-changing auth endpoints.

## 4. Создание презентации и асинхронная AI-генерация

```mermaid
sequenceDiagram
    autonumber
    participant API as GenerationController.create
    participant Creator as PresentationService.create
    participant Models as PresentationModelCatalog.resolve
    participant Templates as PresentationTemplateService
    participant Repo as PresentationRepository
    participant Poll as PresentationWorker.processOne
    participant Tx as PresentationTransactions.claim/complete/fail
    participant Generate as PresentationContentGenerator.generate
    participant History as PresentationAiCallHistory
    participant OpenAI as OpenAI Responses API
    participant Render as PresentationFiles.write
    participant Revisions as PresentationRevisionRepository

    API->>Creator: userId, templateId, topic, mode, idempotencyKey, model
    Creator->>Models: resolve selected model
    Creator->>Templates: verify template id
    Creator->>Repo: check same user's idempotency key
    alt Existing key with the same request hash
        Repo-->>Creator: existing aggregate
        Creator-->>API: original PresentationView
    else Existing key with a different request hash
        Repo-->>Creator: existing aggregate with mismatching hash
        Creator-->>API: IDEMPOTENCY_CONFLICT
    else New request within quotas
        Creator->>Repo: insert QUEUED aggregate
        Creator-->>API: HTTP 202 + PresentationView
    end

    loop Scheduler tick
        Poll->>Tx: claim()
        Tx->>Repo: fail timed-out RUNNING jobs
        Tx->>Repo: SELECT next QUEUED FOR UPDATE SKIP LOCKED
        Repo-->>Tx: immutable Job snapshot
        Tx->>Repo: status = RUNNING
        Tx-->>Poll: Job after transaction commit

        Poll->>Generate: generate(AiCallContext, prompt, schema, model)
        Generate->>History: start(redacted request) in REQUIRES_NEW transaction
        History-->>Generate: durable callId
        Generate->>OpenAI: POST structured Responses request
        OpenAI-->>Generate: response envelope
        Generate->>Generate: OpenAiResponseReader.read + strict decode
        Generate->>History: complete(redacted response/status/error)
        Generate-->>Poll: PresentationContent
        Poll->>Templates: normalize(templateId, content)
        Poll->>Render: write(id, version 1, templateId, content)
        Render->>Templates: render validated PPTX bytes
        Render-->>Poll: atomically published private path
        Poll->>Tx: complete(job, contentJson, path, slideCount)
        Tx->>Repo: status = SUCCEEDED + currentVersion = 1
        Tx->>Revisions: insert immutable revision 1
    end

    opt Any generation/render/publication failure
        Poll->>Render: discard unpublished output if present
        Poll->>Tx: fail(jobId, stableErrorCode)
        Tx->>Repo: RUNNING to FAILED
    end
```

Важный инвариант: AI-вызов и запись PPTX не удерживают блокировку БД. Файл получает уникальное имя и
публикуется атомарным move до второй транзакции. Если commit БД не состоялся, orchestration удаляет
неиспользуемый файл; ранее опубликованная версия не меняется.

## 5. Ручная генерация без AI

```mermaid
sequenceDiagram
    autonumber
    participant Creator as PresentationService.create
    participant Repo as PresentationRepository
    participant Submit as PresentationService.submitManual
    participant Template as PresentationTemplateService.normalize
    participant Codec as PresentationContentCodec.encode
    participant Worker as PresentationWorker.process
    participant Files as PresentationFiles.write
    participant Tx as PresentationTransactions.complete

    Creator->>Repo: insert aggregate with AWAITING_CONTENT
    Submit->>Repo: findForUpdate(id, userId)
    Submit->>Submit: require MANUAL + AWAITING_CONTENT
    Submit->>Template: normalize complete fields/slides/blocks
    Template-->>Submit: canonical PresentationContent
    Submit->>Codec: encode snapshot
    Submit->>Repo: enqueue content and set QUEUED

    Worker->>Codec: decode stored semantic content
    Worker->>Template: normalize again at worker trust boundary
    Worker->>Files: write initial PPTX
    Worker->>Tx: publish version 1
```

Ручной режим использует тот же validator, renderer, очередь и version history, что AI-режим. Отличие
только в источнике semantic content; поэтому экспорт не имеет отдельной, постепенно расходящейся
ветки реализации.

## 6. Открытие редактора и autosave черновика

```mermaid
sequenceDiagram
    autonumber
    participant GetAPI as PresentationEditorController.get
    participant Get as PresentationEditorService.get
    participant Repo as PresentationRepository
    participant ContentCodec as PresentationContentCodec
    participant DraftCodec as PresentationEditorDraftCodec
    participant Template as PresentationTemplateService.editorDeck
    participant SaveAPI as PresentationEditorController.save
    participant Save as PresentationEditorService.save

    GetAPI->>Get: userId + presentationId
    Get->>Repo: find owned SUCCEEDED presentation
    alt Saved draft exists for current published version
        Get->>DraftCodec: decode editor_json
        DraftCodec-->>Get: draft content + slide names
    else No compatible draft
        Get->>ContentCodec: decode canonical content_json
        Get->>Get: create default slide names
    end
    Get->>Template: editorDeck(template, version, revision, content)
    Template->>Template: inspect marker shapes and apply layout overrides
    Template-->>GetAPI: EditorDeckView with percentage geometry

    SaveAPI->>Save: baseVersion + expectedDraftRevision + complete EditorDeck input
    Save->>Repo: findForUpdate(id, userId)
    Save->>Save: require SUCCEEDED and no active edit lease
    Save->>Save: require currentVersion == baseVersion
    Save->>Save: require editorRevision == expectedDraftRevision
    Save->>Save: rebuild and validate complete semantic snapshot
    Save->>DraftCodec: encode content + slide names
    Save->>Repo: save editor_json, baseVersion, revision + 1
    Save-->>SaveAPI: acknowledged new draft revision
```

Autosave хранит целый snapshot, а не поток UI-команд. Это упрощает восстановление после обновления
страницы и делает каждый revision самодостаточным. `baseVersion` защищает от сохранения поверх новой
опубликованной версии, `editorRevision` — от потери изменений между вкладками. Revision монотонный и
не переиспользуется после clear/commit, что закрывает ABA-сценарий.

## 7. Загрузка и использование изображения

```mermaid
sequenceDiagram
    autonumber
    participant API as PresentationEditorController.uploadImage
    participant Upload as PresentationEditorService.uploadImage
    participant Repo as PresentationRepository
    participant Store as PresentationFiles.storeImage
    participant Decode as PresentationFiles.decodeImage
    participant Assets as Private asset directory
    participant GetAPI as PresentationEditorController.image
    participant Resolve as PresentationFiles.image

    API->>Upload: owned presentation id + multipart bytes
    Upload->>Repo: verify ownership and editable SUCCEEDED state
    Upload->>Store: storeImage(presentationId, bytes)
    Store->>Store: enforce compressed upload byte limit
    Store->>Decode: identify PNG/JPEG and decode pixels
    Decode->>Decode: enforce dimensions and total pixel limit
    Decode-->>Store: BufferedImage + dimensions
    Store->>Store: re-encode as PNG to normalize content
    Store->>Assets: enforce count and aggregate byte quota
    Store->>Assets: temp write + atomic move to random assetId.png
    Store-->>API: assetId, dimensions, authenticated content URL

    GetAPI->>Repo: verify presentation ownership
    GetAPI->>Resolve: image(presentationId, assetId)
    Resolve->>Resolve: toRealPath + containment + regular-file checks
    Resolve-->>GetAPI: private PNG resource with no-store headers
```

Сам upload ещё не меняет presentation content. Frontend добавляет возвращённый `assetId` в
`ImageBlock` и сохраняет полный editor draft. При commit renderer разрешает только asset ids внутри
каталога этой презентации. Декодирование и повторная PNG-кодировка не дают передать в Apache POI
произвольный файл под ложным MIME type и ограничивают decompression-bomb риск.

## 8. Публикация editor draft как новой версии

```mermaid
sequenceDiagram
    autonumber
    participant API as PresentationEditorController.commit
    participant Commit as PresentationEditorService.commit
    participant Begin as PresentationTransactions.beginEditorCommit
    participant Repo as PresentationRepository
    participant DraftCodec as PresentationEditorDraftCodec
    participant Template as PresentationTemplateService.normalize
    participant Files as PresentationFiles.write
    participant Render as PresentationTemplateService.render
    participant Complete as PresentationTransactions.completeEditorCommit
    participant Revisions as PresentationRevisionRepository

    API->>Commit: expected baseVersion + exact draftRevision
    Commit->>Begin: reserve editor commit
    Begin->>Repo: fail-fast row lock by id + owner
    Begin->>Begin: require SUCCEEDED and saved draft
    Begin->>Begin: compare currentVersion, draftBaseVersion, draftRevision
    Begin->>Begin: enforce edit quota and active-lease timeout
    Begin->>Repo: set random edit token + startedAt
    Begin-->>Commit: immutable EditorCommit snapshot

    Note over Commit,Files: Database transaction has ended before JSON decode and PPTX rendering
    Commit->>DraftCodec: decode captured editor_json
    Commit->>Template: normalize captured semantic content
    Commit->>Files: write(id, baseVersion + 1, templateId, content)
    Files->>Render: remove/reorder/hide slides, move shapes, add text/images
    Render-->>Files: complete PPTX bytes
    Files-->>Commit: atomically published unique path

    Commit->>Complete: token + baseVersion + draftRevision + output
    Complete->>Repo: lock aggregate for completion
    Complete->>Complete: re-check token, currentVersion, editorRevision
    Complete->>Repo: publish content_json/path/version + clear draft/lease
    Complete->>Repo: increment editorRevision after clear
    Complete->>Revisions: insert immutable editor revision
    Complete-->>API: new PresentationView

    opt Decode, render, or final transaction fails
        Commit->>Files: discard orphan output if created
        Commit->>Repo: clear lease only when token still matches
        Note over Repo: Saved draft remains available for retry
    end
```

Это двухфазная публикация, но не распределённая транзакция. База — источник истины о текущей версии;
файловая компенсация удаляет обычные orphan-файлы. Аварийное завершение процесса между atomic move и
DB commit теоретически может оставить файл без ссылки — это известная эксплуатационная оговорка.

## 9. Что именно делает PPTX renderer

```mermaid
sequenceDiagram
    autonumber
    participant Render as PresentationTemplateService.render
    participant Validate as PresentationContentValidator.normalize
    participant Slides as Apache POI XMLSlideShow
    participant Layouts as applyTextLayouts
    participant Markers as replaceParagraph
    participant Text as addTextBlock
    participant Images as addImageBlock
    participant Resolver as PresentationFiles.imageBytes

    Render->>Validate: validate full semantic snapshot
    Validate-->>Render: immutable canonical plan
    Render->>Slides: open pristine bundled template
    Render->>Slides: map source slide number to XSLFSlide
    Render->>Slides: remove include=false slides
    Render->>Slides: set slide order from semantic list order
    Render->>Slides: set hidden flag on included slides

    loop Every included source slide
        Render->>Layouts: move template marker shapes by stable layout id
        Render->>Markers: replace markers across split text runs
        Render->>Text: create user text boxes with percentage geometry
        Render->>Resolver: resolve every image asset id in presentation scope
        Resolver-->>Images: normalized PNG bytes
        Render->>Images: create positioned picture shapes
    end

    Render->>Slides: serialize complete OPC/PPTX package
    Slides-->>Render: byte array
```

Порядок списка `PresentationContent.slides` — порядок слайдов в результате. `slide` внутри элемента —
не индекс результата, а номер исходного слайда шаблона. `include=false` удаляет source slide;
`hidden=true` оставляет его в deck, но помечает скрытым. Геометрия хранится в процентах, чтобы canvas
960×540 и реальный размер страницы PPTX использовали одну систему координат.

## 10. AI-правка существующей презентации

```mermaid
sequenceDiagram
    autonumber
    participant API as GenerationController.chat
    participant Chat as PresentationService.chat
    participant Begin as PresentationTransactions.beginEdit
    participant Repo as PresentationRepository
    participant AI as PresentationContentGenerator.generate
    participant Preserve as PresentationService.preserveEditorBlocks
    participant Files as PresentationFiles.write
    participant Complete as PresentationTransactions.completeEdit
    participant Revisions as PresentationRevisionRepository

    API->>Chat: message + optional model
    Chat->>Begin: reserve AI edit
    Begin->>Repo: fail-fast lock owned presentation
    Begin->>Begin: require SUCCEEDED, content_json, no editor draft
    Begin->>Begin: enforce lease timeout and daily edit quota
    Begin->>Repo: set random edit token
    Begin-->>Chat: baseVersion + content snapshot + model

    Chat->>AI: edit prompt containing current semantic content
    AI-->>Chat: newly generated fields and slide decisions
    Chat->>Preserve: previous content + generated content
    Preserve-->>Chat: generated plan with user-created blocks copied per source slide
    Chat->>Files: render version baseVersion + 1
    Chat->>Complete: token + baseVersion + output
    Complete->>Repo: re-check lease token and currentVersion
    Complete->>Repo: publish new canonical content and path
    Complete->>Revisions: insert immutable chat revision with message/model

    opt AI, render, or publication failure
        Chat->>Files: discard unpublished output
        Chat->>Repo: clear lease only if token still owns it
    end
```

AI-правка запрещена при наличии editor draft: иначе модель начала бы с опубликованного `content_json`
и молча потеряла незакоммиченные UI-изменения. Сгенерированные поля и решения по слайдам считаются
результатом AI, а свободные text/image blocks остаются пользовательскими и переносятся на тот же
source slide.

### 10а. AI-правка текста выбранного блока в редакторе

```mermaid
sequenceDiagram
    participant Panel as AiChatPanel
    participant API as AiEditController
    participant Svc as AiTextEditService
    participant Res as TargetResolver
    participant Reg as TextEditActionRegistry
    participant LLM as AiResponsesClient
    participant DB as PostgreSQL
    Panel->>API: GET /editor/ai/actions (один раз за сессию)
    Panel->>Panel: цель = выбранный блок; source = текущее предложение или текст блока
    Panel->>Panel: saveNow() — дождаться autosave
    Panel->>API: POST /presentations/{id}/editor/ai/text-edits {request_id, action, params, target, text, refines_edit_id}
    API->>Svc: edit(user, id, request)
    Svc->>Res: владелец, статус, цель в сохранённом документе, лимиты, роль, заголовки
    Svc->>Reg: действие и параметры → задача для модели
    Svc->>DB: короткая транзакция: идемпотентность, квота, строка presentation_ai_edits = running
    Svc->>LLM: один запрос Responses API (strict schema), аудит в presentation_ai_calls до HTTP
    LLM-->>Svc: {status, message, variants[]} + usage
    Svc->>Svc: очистка; превышение лимита → предупреждение, без обрезки и без повтора
    Svc->>DB: короткая транзакция: результат, usage, статус
    API-->>Panel: варианты, предупреждения, usage, квота
    Panel->>Panel: карточка «было / стало» → Применить → updateBlock + sealHistory → autosave
```

В отличие от раздела 10, сервер не меняет документ и не берёт метку правки: черновик, ревизии и
PPTX остаются прежними, autosave и экспорт работают параллельно.

## 11. Версии и скачивание

```mermaid
sequenceDiagram
    autonumber
    participant CurrentAPI as GenerationController.download
    participant VersionAPI as GenerationController.downloadVersion
    participant Service as PresentationService
    participant Presentations as PresentationRepository
    participant Revisions as PresentationRevisionRepository
    participant Files as PresentationFiles.existing

    CurrentAPI->>Service: download(userId, presentationId)
    Service->>Presentations: findByIdAndUserId
    Service->>Service: require status SUCCEEDED
    Service->>Files: existing(current outputPath)
    Files->>Files: toRealPath + configured-directory containment check
    Files-->>CurrentAPI: private PPTX attachment, Cache-Control no-store

    VersionAPI->>Service: downloadVersion(userId, presentationId, version)
    Service->>Presentations: verify presentation ownership
    Service->>Revisions: find by presentation + user + version
    Service->>Files: existing(revision outputPath)
    Files-->>VersionAPI: immutable historical PPTX attachment
```

`Presentation` содержит указатель только на текущую опубликованную версию. `PresentationRevision`
хранит immutable snapshot каждой успешной публикации: content JSON, путь PPTX, slide count, сообщение
изменения и использованную AI-модель, если операция обращалась к AI.

## 12. Состояния presentation aggregate

```mermaid
stateDiagram-v2
    [*] --> QUEUED: create(mode=OPENAI)
    [*] --> AWAITING_CONTENT: create(mode=MANUAL)

    AWAITING_CONTENT --> QUEUED: submitManual + validated content
    AWAITING_CONTENT --> CANCELLED: cancel
    QUEUED --> CANCELLED: cancel
    QUEUED --> RUNNING: PresentationTransactions.claim
    RUNNING --> SUCCEEDED: complete + revision 1
    RUNNING --> FAILED: generation/render failure
    RUNNING --> FAILED: generation timeout recovery

    SUCCEEDED --> SUCCEEDED: completeEdit + version N+1
    SUCCEEDED --> SUCCEEDED: completeEditorCommit + version N+1

    CANCELLED --> [*]
    FAILED --> [*]
```

Editor autosave не меняет lifecycle status: у `SUCCEEDED` presentation параллельно может существовать
unpublished draft с `editorBaseVersion` и `editorRevision`. `editId`/`editStartedAt` — не статус, а
короткоживущая lease для единственной дорогой операции публикации.

## 13. Инварианты конкурентности

| Инвариант | Механизм | Зачем |
| --- | --- | --- |
| Два worker не выполняют одну задачу | `FOR UPDATE SKIP LOCKED`, переход `QUEUED → RUNNING` | Горизонтальный запуск worker без глобальной очереди в памяти |
| Повтор create не создаёт дубликат | unique `(user_id, idempotency_key)` + request hash | Безопасный retry браузера после сетевой ошибки |
| Autosave не затирает другую вкладку | compare `baseVersion` и монотонного `editorRevision` | Optimistic concurrency для лёгких черновиков |
| Дорогие правки не коммитятся поверх новой версии | random `editId` + captured `baseVersion` | Отбрасывание устаревшего AI/render результата |
| Старый cleanup не снимает новую lease | token equality перед `clearEdit` | Компенсация принадлежит только своему запросу |
| Draft commit не страдает от ABA | `editorRevision` увеличивается и после clear | Старый revision нельзя повторно принять после recreate |
| Незакоммиченный UI draft не теряется в AI chat | `beginEdit` запрещён при `editor_json != null` | AI всегда начинает с фактически опубликованного snapshot |
| Медленная операция не держит DB lock | begin/claim и complete — разные транзакции | Не занимать соединение во время AI, POI и filesystem I/O |

## Навигация по исходникам

- HTTP presentation API: `presentation/controller/GenerationController` и
  `PresentationEditorController`.
- Прикладные сценарии: `presentation/service/PresentationService` и
  `PresentationEditorService`.
- Транзакционные протоколы: `presentation/service/PresentationTransactions`.
- Очередь: `presentation/worker/PresentationWorker`.
- Semantic model и strict codecs: `presentation/model/PresentationContent`,
  `presentation/mapper/PresentationContentCodec`, `PresentationEditorDraftCodec`.
- Шаблоны и renderer: `presentation/template/PresentationTemplateService` и
  `PresentationContentValidator`.
- Файлы и изображения: `presentation/storage/PresentationFiles`.
- AI: `presentation/ai/PresentationContentGenerator`, `PresentationRequestFactory`,
  `OpenAiResponseReader`.
- Авторизация: `auth/controller/AuthController`, `auth/service/AuthService`,
  `RegistrationService`, `AuthMailService`, `config/SessionSecurityFilter`, `SecurityConfig`.
