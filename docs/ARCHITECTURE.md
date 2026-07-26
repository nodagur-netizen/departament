# Целевая архитектура

## Решение

Цель MVP — безопасный **модульный монолит на Go**. HTTP-слой — Gin, доступ к данным — sqlx. Frontend остаётся same-origin и встроенным в бинарник, но переходит на нативные ES-модули и дизайн-систему vanilla HTML/CSS/JS. Отдельные frontend- и backend-репозитории, микросервисы и «универсальная таблица инвентаря» не вводятся.

```text
Browser (same origin)
  └─ embedded vanilla ES modules + CSS design system
       └─ Gin: security middleware → handlers → application services
            ├─ identity / RBAC / sessions
            ├─ inventory modules
            ├─ publications / knowledge modules
            └─ platform primitives: audit, migrations, backups, errors, observability
                 └─ sqlx → SQLite (MVP, one instance) → PostgreSQL (when gate met)
```

## Слои и правила зависимостей

1. `handler` принимает HTTP, валидирует DTO и не реализует доменную политику.
2. `service` содержит use cases, транзакционные границы, правила состояний и проверки прав.
3. `repository` изолирует SQL и не принимает HTTP-объекты.
4. `models`/domain описывает сущности и переходы состояний. DTO не являются доменной моделью.
5. Cross-cutting код живёт в platform-пакетах: конфигурация, сессии, RBAC, аудит, миграции, резервное копирование, observability, ошибки.
6. Каждый модуль владеет своими таблицами и API. Межмодульные связи — явные идентификаторы и сервисные контракты, без циклических импортов.

## Модули

- `identity`: заявки на регистрацию, аккаунты, логин, деактивация, сессии, роли и разрешения. Модель affiliation/account/status/role/permission и границы публичной карточки определены в [IDENTITY_AND_ACCESS.md](IDENTITY_AND_ACCESS.md).
- `keys`: карточки ключей, выдача/возврат/утрата, держатель, история.
- `equipment`: оборудование, инвентарные номера, состояние, ответственный, поверка.
- `furniture`, `chemicals`, `labware`: отдельные доменные модели и журналы операций. Общими могут быть location, attachment, responsible person, but not one premature inventory table.
- `publications`: статьи, их статусы, авторы/метаданные, агрегированная статистика.
- `reference`: справочник — после подтверждения содержания и владельца данных.
- `assistants`: будущие ассистенты через отдельный модуль с явной политикой доступа к данным и журналом действий.

## Identity и безопасность

- Саморегистрация создаёт только заявку со статусом `pending`, а не активный аккаунт. Её рассматривают `admin` (владелец) или `lab_head`; решение аудируется. После ручной проверки создаются логин и временный пароль с обязательной сменой при первом входе. `guest` и `student` пока имеют только публичные карточки оборудования и собственный профиль. Детальный поток и роли — в [IDENTITY_AND_ACCESS.md](IDENTITY_AND_ACCESS.md).
- Использовать серверные непрозрачные сессии: случайный идентификатор в `HttpOnly`, `Secure`, `SameSite` cookie; состояние, срок, отзыв и пользователь — на сервере. Не хранить access token в JavaScript.
- Для небезопасных методов: CSRF token и проверка `Origin`/`Referer` для same-origin. На login — rate limiting, одинаковые сообщения об ошибке и журнал security-событий.
- Центральный middleware восстанавливает identity, проверяет активность, затем RBAC. Проверка разрешений выполняется и в service-слое для чувствительных use cases.
- RBAC проектируется как `role → permission`, а affiliation не является ролью. Стартовая обратимая матрица ролей и все отказы — в [IDENTITY_AND_ACCESS.md](IDENTITY_AND_ACCESS.md); default deny обязателен.
- Заголовки безопасности: CSP без inline JS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, TLS на production. Внешние QR-сервисы исключаются; QR генерируется локально и публикуется только после решения о видимости.

## Данные, аудит и миграции

- Каждая изменяющая операция пишет append-only audit event: actor, действие, тип/ID объекта, время, request ID, допустимые метаданные результата. Нельзя логировать пароль, cookie, токен или лишние ПДн.
- Доменные журналы (например, движения ключей) не заменяют общий аудит; оба нужны и согласуются в одной транзакции там, где это важно.
- Миграции версионируются, встраиваются в бинарник, применяются строго один раз и фиксируются в migration ledger с checksum. В production миграции выполняются отдельной контролируемой командой.
- SQLite допустима только как временная база однопроцессного MVP: WAL, foreign keys, ограниченная запись, бэкапы и тест восстановления обязательны.
- Переход на PostgreSQL обязателен при любом из условий: несколько инстансов, HA, материальная одновременная запись или операционные требования, которые SQLite не покрывает. До этого добавление PostgreSQL не является задачей.
- Backup/restore: зашифрованные регулярные копии, ограниченный доступ, документированная процедура, периодический тест восстановления и подтверждённые retention/место хранения.

## Frontend и API

- Один origin: Gin отдаёт статические assets и `/api/v1`; API возвращает DTO и единый формат ошибок.
- ES-модули разделяются на `core` (API/session/router), `ui` (компоненты), `features/*` и `pages/*`. DOM строится через `textContent`, `createElement` и контролируемые атрибуты; не через интерполяцию пользовательских данных в HTML.
- Page-level API отдаёт готовые данные списков (например, имя ответственного), чтобы исключить N+1 из браузера. URL отражает активный раздел, фильтры и страницу.
- Публична только отдельная карточка оборудования по непрозрачному `public_id`: без каталога и только через отдельный `PublicEquipmentDTO`. Полный состав полей и route policy определены в [IDENTITY_AND_ACCESS.md](IDENTITY_AND_ACCESS.md).

## Нефункциональные границы MVP

- Structured logs с request ID, health/readiness, конфигурация через environment/secrets, таймауты и корректный shutdown.
- Unit-тесты сервисов и state transitions, repository integration tests на чистой БД, HTTP-тесты auth/RBAC/CSRF, smoke test миграций и restore drill.
- Реальный deployment и любые ПДн запрещены, пока не пройдены acceptance gates Phase 0 из [MVP.md](MVP.md).
