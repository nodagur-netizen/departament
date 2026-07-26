# План дизайн-системы

> **Статус: решение утверждено 2026-07-26.** Выбран `01 — «Лабораторный журнал»` (`frontend/concepts/01-lab-notebook.html`). Концепты `02` и `03` сохранены только как отклонённые референсы. Канонические визуальные спецификации — `DESIGN.md` и `.impeccable/design.json`; следующая фаза — их реализация в настоящем frontend, а не выбор нового направления.

Режим: **Operate**. Это внутренняя кафедральная рабочая система, где важнее скорость сканирования, предсказуемость и безопасные операции, чем визуальный ребрендинг. Визуальный характер утверждён: холодный светлый лист, чернильный синий контур, спектральный зелёный для штатных состояний и янтарь для внимания; реестровые линии, вкладки и тонкие измерительные метки. Полная нормативная фиксация токенов, типографики и компонентов находится в `DESIGN.md` и `.impeccable/design.json`.

## Принципы

1. Одна операция — одно ясное главное действие; опасные действия требуют явного подтверждения.
2. Состояние объекта, владелец, дата и риск видны до действия.
3. Таблицы удобны на desktop, а на узком экране переходят в карточки или раскрывающиеся строки.
4. Интерфейс устойчив к пустым данным, ошибке сети, медленной загрузке и отсутствию прав.
5. Никакие пользовательские данные не формируют HTML-строки.

## Основа CSS

Структура без фреймворка:

```text
frontend/
  css/{tokens,base,components,layout,pages}.css
  js/{core,ui,features,pages}.js
```

Семантические токены: `--color-canvas`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-focus`, `--color-action`, `--color-danger`, `--color-warning`, `--color-success`; `--space-*`; `--radius-*`; `--shadow-*`; `--font-*`; `--z-*`; `--duration-*`. Их конкретные значения и типографика фиксируются в `DESIGN.md` и `.impeccable/design.json`; этот план задаёт правила их безопасного применения.

## Инвентарь компонентов

- `AppShell`, sidebar/top navigation, `PageHeader`, breadcrumbs.
- Buttons, icon button, fields, select, checkbox, textarea, field error/help.
- Filter bar, search, date range, pagination.
- Data grid, responsive record card, sortable header, status badge, owner/reference cell.
- Card, detail list, timeline/audit event.
- Dialog, confirm dialog, toast, loading, empty, error and permission-denied states.

Компонент имеет один DOM-контракт, keyboard behavior, disabled/loading variant и документированные states. Встроенные `onclick` и глобальные обработчики не допускаются.

## Паттерны операций и состояния

- CRUD: list → filter → detail → edit; успех возвращает к обновлённому списку с сохранением URL-состояния.
- Выдача/возврат/утрата: показать текущий статус и последствия; подтверждение обязано назвать объект и действие; после успеха — audit/timeline.
- Удаление заменяется архивированием или подтверждённой политикой удаления после решения домена.
- Стандартизировать `loading`, `empty`, `error`, `forbidden`, `offline/retry`, `saving`, `success` и `conflict`.

## Responsive и доступность

- Mobile-first breakpoints на основе доступной ширины, не модели устройства.
- Фокус виден всегда; tab-order логичен; модальный диалог имеет `role="dialog"`, `aria-modal`, focus trap, возврат фокуса и Escape.
- Все поля имеют `<label>`, ошибки связаны с полем, статусные сообщения — live region.
- Цвет не единственный носитель статуса; поддерживаются keyboard-only и увеличенный масштаб текста.
- Цель: WCAG 2.2 AA для новых и мигрируемых экранов; окончательный стандарт доступности — open decision владельца.

## Информационная архитектура

Для `guest` и `student` после входа отображаются только собственный профиль и публичные карточки оборудования; остальные разделы не показываются и закрываются серверными разрешениями. Заявки на регистрацию рассматривают `admin` или `lab_head`, а решение отражается в audit.

```text
Overview
Accounting: Equipment · Keys · Furniture · Chemicals · Labware
Science: Articles · Statuses & statistics
Knowledge: Reference · Assistants (later)
Administration: Accounts · Roles · Dictionaries · Audit
```

Разделы, которых ещё нет, не отображаются как работающие функции. Доступность пунктов определяется разрешениями сервера, а не только скрытием в UI.

## Правила безопасного рендеринга

- Данные API выводятся через `textContent`, `createElement`, `setAttribute` с allowlist URL-протоколов.
- Запрещены `innerHTML`, inline scripts/handlers и передача внутренних URL сторонним сервисам.
- CSP проектируется до миграции; assets и QR обслуживаются same-origin.
- Ошибки интерфейса не показывают токены, stack traces, SQL или ПДн.

## Поэтапная миграция

1. После Phase 0: ES-module bootstrap, session-aware API client, error boundary, безопасный DOM helper и базовые tokens без смены визуального мира.
2. MVP core: AppShell, login, Accounts, Keys, Equipment; заменить текущие HTML-строки, глобалы и inline handlers; добавить URL routing и responsive data grid.
3. Новые домены: собирать только из утверждённых primitives; добавлять новые компоненты после повторяемого сценария, а не заранее.
4. После security/data hardening: мигрировать настоящий shell и базовые компоненты по утверждённым `DESIGN.md` и `.impeccable/design.json`, не заменяя production-маршрут статическим концептом. Название и бренд могут уточняться отдельно, но не открывают повторно выбор visual world без нового решения владельца.
