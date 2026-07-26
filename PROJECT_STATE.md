# Project state

## Текущий этап

Планирование завершено. Реализация не начиналась: Go/HTML/CSS/JS/SQL и БД не менялись.

## Зафиксированные решения

- Backend: Go modular monolith, Gin и sqlx.
- Frontend: same-origin embedded vanilla HTML/CSS/JS с переходом на native ES modules.
- MVP data store: SQLite только для одного инстанса; PostgreSQL при multi-instance/HA/материальной конкурентной записи.
- Целевая auth-модель: server-side opaque sessions в `HttpOnly`/`Secure`/`SameSite` cookie, CSRF/Origin checks, rate limits и централизованный RBAC.
- Миграции: embedded, versioned, ledger/checksum. Аудит: append-only.
- Не создавать преждевременную универсальную таблицу инвентаря.
- До закрытия Phase 0 запрещены реальный deployment и ПДн.
- Подтверждено: нужны роли; примеры — студент, заведующий лабораторией и гость. Любой может открыть публичную карточку оборудования и подать заявку на регистрацию как студент или гость.
- Принятое обратимое безопасное решение: affiliation отделён от role/permission; саморегистрация создаёт `pending`-заявку, а после ручной проверки — аккаунт с временным паролем и обязательной сменой. Роли MVP: гость, студент, сотрудник, заведующий лабораторией, администратор; default deny.
- Публичная карточка доступна только по непрозрачному `public_id`, через отдельный DTO, без каталога и внутренних данных. Полный контракт: [docs/IDENTITY_AND_ACCESS.md](docs/IDENTITY_AND_ACCESS.md).
- Заявки на регистрацию рассматривают владелец-администратор и заведующий лабораторией; одобрение и отклонение аудируются. `student` и `guest` после входа пока видят только публичные карточки оборудования и собственный профиль.
- Разработка пока на текущей машине; production позже будет выбран между VPS и сервером организации.

## Риски, подтверждённые аудитом

- `/api/v1` сейчас не защищён; auth/RBAC не подключены.
- В equipment detail есть stored XSS и внешний QR-сервис.
- Рабочая SQLite БД отслеживается Git.
- Auth/config/migrations/key invariants/pagination имеют P1-дефекты.
- Go отсутствует в текущем окружении: build/test/vet не проверены.

Подробности и точные ссылки: [docs/CURRENT_STATE_AUDIT.md](docs/CURRENT_STATE_AUDIT.md).

## Открытые решения

- Окончательная матрица прав сотрудников и правила делегирования доступа.
- Выбор VPS либо сервера организации, сеть, домен и способ deployment.
- Название продукта, видимость QR, политика ПДн/backup retention, визуальный мир и бренд не утверждены.

## Следующая исполнимая задача

Выполнить **Phase 0: security/data hardening** строго по acceptance gates в [docs/MVP.md](docs/MVP.md). Первый технический срез: убрать рабочую БД/секреты из Git без потери данных, реализовать заявки, аккаунты и таблицу разрешений, подключить защищающие middleware и покрыть их HTTP-тестами.

## Статус проверки

Проведён статический аудит кода и проверка состава Git без чтения записей БД. `git diff --check` выполнен после создания документов. Go-команды ожидают окружение с установленным Go.

## Карта решений

- [PRODUCT.md](PRODUCT.md) — подтверждённая продуктовая правда и open decisions.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — целевая архитектура.
- [docs/MVP.md](docs/MVP.md) — порядок реализации и gates.
- [docs/DESIGN_SYSTEM_PLAN.md](docs/DESIGN_SYSTEM_PLAN.md) — Operate-mode дизайн-система.
- [docs/IDENTITY_AND_ACCESS.md](docs/IDENTITY_AND_ACCESS.md) — модель идентификации, доступов и публичной карточки оборудования.
- [docs/CURRENT_STATE_AUDIT.md](docs/CURRENT_STATE_AUDIT.md) — исходное состояние и риски.

## Локальная среда разработки

- В репозитории настроен воспроизводимый Windows PowerShell-контур: официальный
  Go 1.25.0 для windows-amd64 скачивается в `.tools/go` с `go.dev` и проходит
  проверку SHA-256 по официальным метаданным до распаковки.
- Кэши Go и локальные артефакты находятся только в `.cache/` и `.local/`;
  SQLite для разработки — `.local/data/department.db` через `configs/local.yaml`
  на `localhost:18180`.
- Команды: `scripts/bootstrap.ps1`, `scripts/dev.ps1`, `scripts/check.ps1`.
  `check` проверяет gofmt без изменения исходников, затем выполняет test, vet и build.
- Конфигурация запуска fail-closed: `REG_CONFIG_NAME` обязателен; неявного fallback
  на `default.yaml` нет. Локальная разработка явно использует `local`, а `dev`
  собирает и запускает `.local/bin/department.exe` напрямую (без `go run`).
- 2026-07-26: `check` прошёл; local smoke `/health` вернул 200. Перед и после
  smoke `git diff --exit-code -- data/depatrament_data.db` вернул 0. Никакие
  записи исходной БД не читались.
