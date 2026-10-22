# Устройство Java backend

Java 26, Spring Boot 4.1.1, Spring Data JPA/Hibernate, PostgreSQL, Flyway.

```text
ru.godeck
├── GoDeckApplication
├── auth
│   ├── AuthController, AuthService, AuthMailService
│   ├── AuthPrincipal, AuthExceptionHandler
│   └── persistence
│       ├── UserAccount, EmailVerification
│       └── UserAccountRepository, EmailVerificationRepository
├── presentation
│   ├── GenerationController, PresentationDtos, PresentationContent
│   ├── PresentationService, PresentationTransactions, PresentationWorker
│   ├── PresentationContentGenerator, PresentationTemplateService
│   ├── PresentationContentCodec, PresentationFiles, PresentationModelCatalog
│   └── persistence
│       ├── Presentation, PresentationRevision
│       └── PresentationRepository, PresentationRevisionRepository
└── config
    └── SecurityConfig, SessionSecurityFilter
```

## Границы ответственности

Контроллер читает и валидирует запрос, определяет пользователя из Spring Security и возвращает DTO. JPA-сущности не передаются в HTTP-ответы: хеши паролей, коды, внутренние пути файлов и ключи повторных запросов остаются внутри backend.

Сервис реализует сценарий приложения и обращается к репозиториям. Изменение загруженной в транзакции сущности выполняется её методами; Hibernate сохраняет изменения при commit. Репозиторий описывает выборки и блокировки. В production-коде нет `JdbcClient` или `JdbcTemplate`; в интеграционных тестах JDBC используется для независимой проверки реального состояния PostgreSQL.

`PresentationWorker` забирает задачи и запускает генерацию. `PresentationFiles` отвечает за безопасные пути, атомарную запись и удаление неиспользуемого результата. `PresentationTemplateService` проверяет план и подставляет его в PPTX. `PresentationContentGenerator` вызывает Responses API, а `PresentationContentCodec` преобразует JSON в типизированный план и обратно.

Связи сущностей представлены UUID: сценариям не требуется загружать граф пользователей, презентаций и версий. Связь версии с презентацией дополнительно защищена существующим внешним ключом PostgreSQL. Пагинация сохраняет исходный HTTP-контракт с произвольными `limit` и `offset`.

## Транзакции

- Авторизация: проверки кода, смена пароля и счётчики входа выполняются под блокировкой соответствующей записи. `AuthException` не откатывает обновлённые счётчики ошибок. Исключение SMTP или базы откатывает изменения; письмо с кодом отправляется в текущем сценарии с ограниченными SMTP-таймаутами.
- Очередь: короткая транзакция выбирает свободную задачу и меняет её статус на `running`. Вызов AI и запись PPTX происходят после commit. Завершение атомарно сохраняет `succeeded`, содержимое, путь и первую версию.
- Чат: первая короткая транзакция устанавливает `edit_id` и `edit_started_at`. Во время AI-запроса и сборки PPTX соединение/транзакция не удерживаются. Вторая транзакция сверяет токен, сохраняет новую версию и снимает метку. Параллельная правка получает 409. Ошибка освобождает метку; зависшая после аварии правка допускает повтор через пять минут. Старый токен не может завершить или снять новую правку.

Файл сначала записывается под уникальным именем, затем его путь сохраняется в базе. При ошибке транзакции новый файл удаляется, предыдущая версия остаётся доступной. Неизбежный промежуток между файловой системой и commit не является распределённой транзакцией: аварийное завершение процесса может оставить файл без ссылки из базы.

## Где и почему осталось SQL

Обычные операции выполняют Spring Data JPA и JPQL. Три native-запроса находятся только в репозиториях и используют возможности PostgreSQL:

1. Условный `INSERT ... ON CONFLICT` регистрации: одинаковый email не обходит cooldown при параллельных запросах.
2. `INSERT ... ON CONFLICT DO NOTHING` создания презентации: один `Idempotency-Key` не создаёт два проекта.
3. `SELECT ... FOR UPDATE SKIP LOCKED` очереди: несколько обработчиков получают разные свободные задачи и не ждут занятую строку.

## Схема и проверки

Flyway остаётся единственным источником изменений схемы. `spring.jpa.hibernate.ddl-auto=validate` проверяет соответствие сущностей существующей базе. `spring.jpa.open-in-view=false` ограничивает работу с persistence context сервисными транзакциями. Значения enum сохраняются в прежнем нижнем регистре через JPA-конвертеры.

Миграция V6 добавляет метку активной правки; прежние таблицы, данные и файлы PPTX сохраняются. Локальный режим без входа, выбор моделей, предварительный просмотр запроса и HTTP-адреса остаются доступными.

`pnpm backend:test` выполняет тесты на PostgreSQL в отдельных схемах `auth_test` и `generation_test`. Вызовы AI заменены тестовым генератором. Проверяются регистрация и SMTP rollback, счётчики, конкурирующие регистрации, идемпотентность, очередь, DTO, файлы, версии, отсутствие транзакции во время AI и защита от устаревшего токена правки. `AUTH_BYPASS=false ... pnpm test:auth` проверяет настоящие локальные письма и сессии через Next.js proxy.
