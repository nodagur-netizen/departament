# Department

## Локальная разработка (Windows PowerShell)

Проект использует локальный официальный архив Go 1.25.0 для Windows amd64. Он
скачивается с `go.dev`, а SHA-256 архива сверяется с официальными метаданными
перед распаковкой. Системная установка Go не нужна.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1  # скачать Go и зависимости
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1        # http://localhost:18180
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1      # gofmt check, test, vet, build
```

Разработка всегда требует явный `REG_CONFIG_NAME=local`, использует `configs/local.yaml` и создаёт базу только по пути
`.local/data/department.db`. Файл `data/depatrament_data.db` не используется
этими командами и не должен применяться для разработки.

`scripts/dev.ps1` сначала собирает `.local/bin/department.exe`, а затем запускает именно этот бинарник в foreground.

`configs/default.yaml` сохраняется для совместимости с текущим приложением;
не размещайте в нём секреты. Локальные секреты, если они появятся позднее,
храните только в неотслеживаемом `.env`.
