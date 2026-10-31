# Устройство Java backend

Java 26, Spring Boot 4.1.1, Spring Data JPA/Hibernate, PostgreSQL, Flyway.

Sequence-, state- и component-диаграммы основных сценариев находятся в
[application-processes-uml.md](application-processes-uml.md).

## Пакеты и слои

```text
ru.godeck
├── GoDeckApplication
├── auth
│   ├── controller      HTTP-контроллер и обработчик ошибок
│   ├── dto             отдельные request/response records
│   ├── service         AuthService, RegistrationService, AuthMailService
│   ├── entity          UserAccount, EmailVerification
│   ├── repository      Spring Data JPA-репозитории
│   ├── exception       AuthError, AuthException
│   ├── model           AuthStep
│   ├── policy          AuthPolicy
│   └── security        AuthPrincipal
├── presentation
│   ├── PresentationService       общий фасад создания, списка, версий и скачивания
│   ├── PresentationTransactions  общая транзакционная координация агрегата
│   ├── generation      очередь, worker, AI-генерация, настройки и generation/dto
│   ├── editor          controller, сервис, сборщик/codec черновика и editor/dto
│   ├── chat            старый whole-deck AI-чат и chat/dto
│   ├── material        загрузка исходников, очередь извлечения и DTO материалов
│   ├── dto             общие ответы о презентации, списке и версиях
│   ├── entity          Presentation, PresentationRevision
│   ├── repository      репозитории, пагинация и JPA-конвертеры
│   ├── model           общие PresentationContent и PresentationStatus
│   ├── exception       GenerationError, GenerationException
│   ├── policy          PresentationPolicy
│   ├── ai              общий каталог моделей и аудит запросов/ответов AI
│   ├── template        каталог, PPTX-renderer, editor projection, фоны и валидация плана
│   ├── storage         PresentationFiles
│   ├── mapper          PresentationContentCodec
│   └── aiedit          AI-правка текста в редакторе (см. ниже)
├── common
│   ├── security        Hashing, SecurityPolicy
│   └── text            BackendMessages
└── config              Spring Security, session filter и HTTP-клиент OpenAI
```

Контроллер читает и валидирует запрос, определяет пользователя из Spring Security и возвращает DTO. JPA-сущности не передаются в HTTP-ответы: хеши паролей, коды, внутренние пути файлов и ключи повторных запросов остаются внутри backend. В одном Java-файле находится один публичный DTO; контроллеры не содержат вложенных DTO.

Сервис реализует сценарий и обращается к репозиториям. Изменение загруженной в транзакции сущности выполняется её методами; Hibernate сохраняет изменения при commit. Репозиторий описывает выборки и блокировки. Очередь документов — отдельный небольшой путь: `MaterialJobService` использует `JdbcClient`, а изолированный document-worker — JDBC для атомарного claim/finish. В тестах JDBC также независимо проверяет реальное состояние PostgreSQL.

`PresentationWorker` забирает задачи и запускает генерацию. Проверка доступности выбранной модели выполняется после claim: устаревшая модель завершает свою задачу ошибкой и не задерживает очередь. Ручная сборка не требует доступной AI-модели. `PresentationFiles` отвечает за безопасные пути, атомарную запись и удаление неиспользуемого результата. `PresentationTemplateService` загружает ресурсы, один раз строит неизменяемый манифест макетов и подставляет значения в PPTX. `PresentationContentValidator` отдельно проверяет поля/решения по слайдам и применяет лимиты текста без чтения PPTX. `PresentationRequestFactory` строит единый запрос для предпросмотра и генерации; `PresentationContentGenerator` отвечает за HTTP-вызов и запись диагностики; `OpenAiResponseReader` проверяет завершение ответа и объединяет все части `output_text`. `PresentationContentCodec` преобразует JSON в типизированный план и обратно. Внутренние ошибки провайдера представлены `AiGenerationException` с `GenerationError`: очередь не распознаёт ошибки по тексту исключения.

Связи сущностей представлены UUID: сценариям не требуется загружать граф пользователей, презентаций и версий. Связь версии с презентацией дополнительно защищена внешним ключом PostgreSQL. Пагинация сохраняет HTTP-контракт с произвольными `limit` и `offset`.

## Разделение обязанностей после рефакторинга

`PresentationTemplateService` — совместимый публичный фасад. Внутри него используются конкретные
package-private классы, не новые сервисы/микросервисы и не интерфейсы плагинов:

- `TemplateCatalog` загружает исходники/sidecar, проверяет и кэширует поля, manifests и версии;
- `TemplateRenderer` изменяет свежую копию PPTX и добавляет пользовательские shapes;
- `TemplateEditorMapper` переводит исходные shapes в браузерные блоки и paragraph metrics;
- `TemplateShapes` задаёт общие marker recognition, порядок обхода group shapes, layout ID и EMU.

`fieldsBySlide` возвращает неизменяемый typed manifest; editor и AI target resolver не приводят
`Object` из JSON-каталога к спискам. Внешние routes и прежние overloads фасада сохранены.

`PresentationChatService` выполняет старую AI-пересборку всей опубликованной презентации.
`EditorDraftAssembler` проверяет полный снимок браузера и строит semantic draft, не публикуя его.
`PresentationEditorService` сохраняет ответственность за ownership, draft/version/lease и commit.
`PresentationTransactions` оставлен общей границей переходов агрегата: его разделение только ради
числа строк затруднило бы проверку единого протокола резервирования и завершения публикации.

Настройки сгруппированы по назначению в `auth/config`, `presentation/generation`, `aiedit/config`
и `storage`. JPA-сущности не получают Spring beans: срок хранения передаётся явно в terminal-переход.
Контроллеры, DTO и прикладные классы лежат рядом со своей функциональностью. Общая модель,
основные сущности/репозитории и транзакции агрегата остаются общими: мы не дублируем их между
редактором и генерацией. Тесты генерации, редактора и codecs перенесены вслед за функциональностью.

## AI-правка текста: пакет `aiedit` (структура)

```text
ru.godeck.presentation.aiedit
├── controller   AiEditController (каталог, text-edits)
├── dto          TextEditRequest, TextEditView и вложенные view
├── core         AiEditTarget (sealed), TargetKind, ResolvedTextTarget, TargetResolver, AiEditStatus
├── action       TextEditAction (enum), TextEditActionCatalog, ActionUi
├── ai           AiResponsesClient, TextEditRequestFactory, TextEditResponseParser,
│                TextEditLlm + OpenAiTextEditLlm / ScriptedTextEditLlm, ResponsesUsage
├── text         TextResultSanitizer
├── service      AiTextEditService, AiEditTransactions, AiEditRetention
├── entity       PresentationAiEdit
├── repository   PresentationAiEditRepository
├── config       AiEditSettings, AiEditClientConfig (отдельный RestClient)
└── policy       AiEditPolicy
```

Три поддерживаемых действия перечислены в `TextEditAction`: shorten, rephrase, custom.
`TextEditActionCatalog` отдаёт их в этом порядке и проверяет единственный параметр custom —
instruction. Механизм плагинов, будущие enum-параметры и неиспользуемый контекст тарифов удалены.
При добавлении нового действия меняются enum и явная валидация/каталог, а не Spring discovery.
Это намеренное ограничение текущего MVP, а не универсальный фреймворк действий.
`AiTextEditService` проверяет запрос без записи, затем короткой транзакцией (`AiEditTransactions`)
решает идемпотентность и квоту, вызывает модель без открытой транзакции и второй короткой
транзакцией сохраняет результат. Документ презентации не меняется. `openAiTextEditClient` объявлен с
`defaultCandidate = false`, поэтому существующие точки внедрения `RestClient` получают прежний
`openAiClient`.

**`TextLengthMode`.** `PresentationContentValidator`, `PresentationTemplateService.render` и
`PresentationFiles.write` получили перегрузки с режимом длины. Существующие методы работают в режиме
`TRUNCATE` (обрезка до `max_chars`) — его используют генерация, ручная сборка и тестовый чат.
`ALLOW_OVERFLOW` (`normalizeEditor`) не обрезает текст поля и отклоняет текст длиннее
`EditorTextLimits.hard(max)`; его используют только пути редактора: draft save, `GET /editor`,
commit.

## Где менять лимиты и тексты

- `presentation/aiedit/policy/AiEditPolicy`: квота AI-правок, число вариантов, лимиты входа и
  контекста, таймауты, срок хранения, reasoning effort по модели.

- `auth/policy/AuthPolicy`: длины пароля/email, размер и срок кода, cooldown, число попыток и срок reset token. DTO и сервисы используют одни значения; срок действия в письме берётся из той же политики.
- `presentation/policy/PresentationPolicy`: длины темы и правки, дневные квоты, размер страницы, сроки обработки/резервирования правки, длины полей сущностей.
- `common/security/SecurityPolicy`: лимит запросов авторизации на IP, окно ограничения и authority пользователя.
- `presentation/template/TemplateTextPolicy`: размер шрифта по умолчанию, коэффициенты оценки вместимости поля и правила сокращения текста. Это эвристики макета, а не произвольные числа внутри алгоритма.
- `resources/messages.properties`: пользовательские сообщения ошибок, письма, ответы чата и подписи шаблона. `BackendMessages` подставляет параметры, включая сроки из политик.
- `resources/prompts/*.txt`: системный промпт, шаблон brief и шаблон редактирования. Java-код собирает HTTP-запрос, не хранит длинные тексты промптов.
- `AuthError`, `GenerationError`, `AuthStep`, `GenerationMode`, `PresentationStatus`: протокольные коды/статусы. Список моделей — именованный неизменяемый `SUPPORTED_MODELS` в `PresentationModelCatalog`.

Таймауты AI находятся в `OpenAiClientConfig`, интервал опроса очереди — именованная константа обработчика. Настройки окружения остаются в `application.yaml`. Ключи JSON, URL маршрутов и имена колонок остаются рядом с контрактами, аннотациями и запросами: их перенос в общий `Constants` затруднил бы чтение.

## Регистрация без upsert

`RegistrationService.register` выполняет один понятный сценарий в транзакции:

1. Находит подтверждение по email под блокировкой JPA и проверяет, не создан ли уже аккаунт.
2. Если подтверждение есть — проверяет cooldown; если нет — создаёт новую сущность.
3. Записывает новый challenge, хеши пароля/кода и сроки. `saveAndFlush` проверяет ограничения до отправки письма.
4. Отправляет письмо. Ошибка SMTP откатывает и новую запись, и обновление существующей.

Для ещё отсутствующей строки блокировка JPA ничего не блокирует. Поэтому два первых запроса могут дойти до вставки одновременно. Уникальный ключ email допускает только одну вставку. `AuthService.register` повторяет проигравший запрос один раз **после полного rollback**, только при конфликте этого конкретного ключа. Повтор видит запись победителя и получает cooldown; второе письмо не отправляется. Остальные ошибки БД не маскируются повтором.

`EmailVerification` реализует `Persistable`: новая сущность с назначенным строковым ID сохраняется через `persist`, а не `merge`. Это исключает незаметное обновление записи победителя между первоначальным чтением и вставкой. Нужные данные и правила теперь видны в Java; native-запросов регистрации нет.

## Транзакции генерации и авторизации

- Проверка кода, смена пароля и счётчики входа блокируют соответствующую запись. `AuthException` в `AuthService` не откатывает счётчики ошибок. Исключения SMTP/БД откатывают изменения. Отправка письма остаётся в транзакции с ограниченными SMTP-таймаутами.
- Очередь: короткая транзакция выбирает свободную задачу и меняет её статус на `running`. AI и запись PPTX происходят после commit. Завершение атомарно сохраняет `succeeded`, план, путь и первую версию.
- Чат: короткая транзакция устанавливает `edit_id` и `edit_started_at`. Во время AI и сборки PPTX транзакция не удерживается. Вторая транзакция проверяет токен и сохраняет новую версию. Параллельная правка получает 409. Ошибка освобождает метку; зависшую после аварии правку можно повторить после `EDIT_LEASE_TIMEOUT`. Старый токен не может завершить или снять новую правку.

Файл сначала записывается под уникальным именем, затем путь сохраняется в БД. При ошибке транзакции новый файл удаляется, предыдущая версия доступна. Между файловой системой и commit нет распределённой транзакции: аварийное завершение процесса может оставить файл без ссылки из базы.

## Два оставшихся native-запроса

Обычные операции выполняют JPA и JPQL. PostgreSQL-запросы находятся только в `PresentationRepository`:

1. Простой `INSERT ... ON CONFLICT DO NOTHING` сохраняет идемпотентность создания презентации при конкурирующих запросах. Условного обновления и правил cooldown в SQL нет.
2. `SELECT ... FOR UPDATE SKIP LOCKED` очереди позволяет обработчикам получать разные свободные задачи, не ожидая занятую строку.

## Схема и проверки

Flyway управляет схемой; `spring.jpa.hibernate.ddl-auto=validate` проверяет сущности. `spring.jpa.open-in-view=false` ограничивает persistence context сервисными транзакциями. Enum-конвертеры сохраняют прежний нижний регистр. Миграция V6 добавляет метку активной правки; данные и PPTX сохраняются. Перенос пакетов и замена регистрации не требуют новых миграций.

`pnpm backend:test` выполняет тесты на PostgreSQL в отдельных схемах `auth_test` и `generation_test`; AI заменён тестовым генератором. Проверяются регистрация, замена challenge/пароля после cooldown, SMTP rollback, счётчики, конкурентные регистрации, идемпотентность, очередь, DTO, файлы, версии, отсутствие транзакции во время AI и защита от устаревшего токена правки. При запущенном с `AUTH_BYPASS=false` backend команда `AUTH_BASE_URL=http://localhost:3001 pnpm test:auth` проверяет настоящие локальные письма и сессии через Next.js proxy.

Подробный перечень unit/integration сценариев, отдельные команды запуска и границы проверок — в [backend-testing.md](backend-testing.md).

## Граница диагностики AI

Запрос сохраняется отдельной транзакцией до обращения к провайдеру. Если сохранить его нельзя, платный HTTP-вызов не выполняется. Ошибка сохранения **результата диагностики** после HTTP-вызова журналируется с ID обращения и типом ошибки; она не заменяет ошибку провайдера и не отбрасывает уже полученный план. В таком случае запись истории может остаться без завершения. Сохранение версии и PPTX по-прежнему выполняется обычным сценарием; диагностика не гарантирует успешного commit бизнес-данных при общем отказе БД.
