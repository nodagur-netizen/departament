# Аудит текущего состояния

Дата: 2026-07-26. Это статический аудит исходников; записи БД не читались и не изменялись. Go в текущем окружении отсутствует, поэтому `build`, `test` и `vet` не запускались.

## Что уже работает по исходникам

- Go-приложение собирает конфигурацию, подключает SQLite, создаёт репозитории и сервисы, поднимает Gin и отдаёт встроенный frontend: [internal/app/app.go:25](../internal/app/app.go#L25), [internal/app/app.go:36](../internal/app/app.go#L36), [internal/handler/handler.go:65](../internal/handler/handler.go#L65), [main.go:8](../main.go#L8).
- Есть CRUD пользователей, ключей и оборудования; для ключей реализованы выдача, возврат и история. Маршруты регистрируются в [internal/handler/handler.go:79](../internal/handler/handler.go#L79), операции выдачи/возврата определены в [internal/handler/handler.go:23](../internal/handler/handler.go#L23).
- Выдача и возврат ключа выполняются сервисом с транзакционной логикой; журнал ключей хранит события: [internal/service/key.go:145](../internal/service/key.go#L145), [internal/repository/keylog.go:22](../internal/repository/keylog.go#L22).
- У оборудования есть фильтры, пагинация и просроченная поверка: [internal/handler/equipment.go:107](../internal/handler/equipment.go#L107), [internal/repository/equipment.go:127](../internal/repository/equipment.go#L127).
- Пароли хешируются bcrypt, присутствуют request ID и структурное логирование: [pkg/hasher/hasher.go:16](../pkg/hasher/hasher.go#L16), [internal/handler/middleware.go:28](../internal/handler/middleware.go#L28).
- Интерфейс — одна HTML-страница с вкладками оборудования, ключей и пользователей; отдельна карточка оборудования: [frontend/index.html:13](../frontend/index.html#L13), [internal/handler/handler.go:87](../internal/handler/handler.go#L87).

## P0 — закрыть до реального развёртывания и любых ПДн

1. API `/api/v1` не защищён: в группе маршрутов нет auth/RBAC middleware, а созданный `AuthHandler` не подключается в конструкторе и маршрутах: [internal/handler/handler.go:50](../internal/handler/handler.go#L50), [internal/handler/handler.go:79](../internal/handler/handler.go#L79). Любой посетитель может вызвать доступные CRUD-операции.
2. Текущий auth-контур непригоден для включения без переделки: обработчик читает JSON, но передаёт в сервис `PostForm`, а cookie помечена `Secure=false`: [internal/handler/auth.go:48](../internal/handler/auth.go#L48), [internal/handler/auth.go:58](../internal/handler/auth.go#L58), [internal/handler/auth.go:68](../internal/handler/auth.go#L68).
3. В публичной карточке оборудования серверные поля вставляются через `innerHTML`; значение документации попадает в HTML-строку. Это stored XSS: [frontend/equipment.html:84](../frontend/equipment.html#L84), [frontend/equipment.html:90](../frontend/equipment.html#L90).
4. QR-код передаёт внутренний URL стороннему сервису `api.qrserver.com`: [frontend/equipment.html:99](../frontend/equipment.html#L99).
5. SQLite-файл данных отслеживается Git, а `.gitignore` не исключает БД ([.gitignore:1](../.gitignore#L1)); файл содержит учётные и контактные данные по схеме [internal/db/migration/20260325120000_init_schema.up.sql:4](../internal/db/migration/20260325120000_init_schema.up.sql#L4).

## P1 — обязательный долг перед расширением функциональности

1. `AuthCfg` объявлен, но отсутствует в корневом `Config` и YAML: [internal/config/config.go:15](../internal/config/config.go#L15), [internal/config/config.go:56](../internal/config/config.go#L56), [configs/default.yaml:1](../configs/default.yaml#L1). Вход привязан к UUID в URL, а не к подтверждённому логину: [internal/handler/auth.go:31](../internal/handler/auth.go#L31), [internal/handler/auth.go:38](../internal/handler/auth.go#L38).
2. Вход не проверяет активность пользователя, а middleware существует, но не подключён; роли в нём не применяются: [internal/service/auth.go:53](../internal/service/auth.go#L53), [internal/handler/middleware.go:93](../internal/handler/middleware.go#L93).
3. `MarkLost` пишет пустой `user_id`, при том что он `NOT NULL` и имеет FK; ошибка журнала только логируется: [internal/service/key.go:279](../internal/service/key.go#L279), [internal/service/key.go:286](../internal/service/key.go#L286), [internal/db/migration/20260325120000_init_schema.up.sql:34](../internal/db/migration/20260325120000_init_schema.up.sql#L34).
4. Поиск текущего держателя берёт последнее событие выдачи и не учитывает возврат: [internal/repository/keylog.go:59](../internal/repository/keylog.go#L59).
5. Статус оборудования меняется прямым `PUT` без отдельной машины состояний и аудита: [internal/handler/equipment.go:154](../internal/handler/equipment.go#L154), [internal/repository/equipment.go:151](../internal/repository/equipment.go#L151).
6. Просроченная поверка считает `limit/offset`, но SQL их не использует; дефолт пагинации равен 1, что противоречит тегу `gte=10`: [internal/repository/equipment.go:127](../internal/repository/equipment.go#L127), [internal/models/common.go:3](../internal/models/common.go#L3).
7. Миграции читаются из файлов рядом с исполняемым файлом, не встроены и не имеют журнала применений: [internal/app/app.go:75](../internal/app/app.go#L75), [internal/db/migrate.go:16](../internal/db/migrate.go#L16), [embed.go:6](../embed.go#L6).
8. Сервер запускается в goroutine с `log.Fatal`, что делает ошибку старта и graceful shutdown ненадёжными: [internal/app/app.go:56](../internal/app/app.go#L56).

## P2 — качество, поддерживаемость, UX

- Vanilla frontend использует глобалы, inline-обработчики и HTML-строки; модальному окну не хватает полного focus management и семантики диалога: [frontend/js/ui.js:18](../frontend/js/ui.js#L18), [frontend/js/app.js:270](../frontend/js/app.js#L270).
- Список оборудования выполняет отдельный запрос пользователя для каждой строки (N+1), а навигация не имеет URL-состояния: [frontend/js/app.js:150](../frontend/js/app.js#L150), [frontend/index.html:13](../frontend/index.html#L13).
- Нужны мобильные паттерны таблиц, единые empty/loading/error states и тесты. В репозитории обнаружен только тест валидатора (`pkg/valid/valid_test.go`), покрытие доменных сценариев не подтверждено.

## Граница вывода

Выводы относятся к текущему снимку исходников. Нельзя считать приложение запускаемым, пока не будет установлен Go и не пройдут проверочные команды после изменений.
