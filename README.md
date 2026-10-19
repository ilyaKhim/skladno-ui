# GoDeck

Фронтенд на Next.js. Репозиторий: https://gitlab.com/ilyaKhim/godeck.

## Локальный запуск

Нужны Node.js 22 и pnpm 10.10.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Обычная сборка: `pnpm build`. Статическая сборка для REG.RU:

```sh
STATIC_EXPORT=1 pnpm build
```

Готовые файлы находятся в `out/`. Эта конфигурация публикует только статический фронтенд; для Java API потребуется отдельный деплой.

## Деплой из GitLab на REG.RU

Корневой `.gitlab-ci.yml` подключает `.gitlab/ci/deploy-reg.yml`. Pipeline запускается после push в `main` или вручную через **Build → Pipelines → New pipeline**, с выбранной веткой `main`. Другие ветки и merge requests не публикуются.

Job использует Docker-образ `node:22-bookworm`; нужен включённый GitLab runner с поддержкой Docker (подойдут GitLab-hosted runners). Job устанавливает pnpm 10.10.0, собирает статический сайт, загружает `out/` через SSH/rsync и проверяет `https://www.ilkhim.ru/deploy-version.json` и файл превью. `resource_group` не позволяет двум деплоям выполняться одновременно.

### Переменные

В **Settings → CI/CD → Variables** нового проекта добавьте прежние значения из GitHub Secrets. GitLab не переносит их автоматически.

| Переменная | Тип | Значение |
| --- | --- | --- |
| `REG_HOST` | Variable | SSH-адрес сервера REG.RU без протокола |
| `REG_PORT` | Variable | SSH-порт; можно не задавать, по умолчанию 22 |
| `REG_USER` | Variable | Пользователь SSH |
| `REG_DEPLOY_PATH` | Variable | Абсолютный путь к корню сайта `www.ilkhim.ru`, например `/var/www/account/data/www/www.ilkhim.ru` — укажите свой фактический путь |
| `REG_SSH_KEY` | File (рекомендуется) | Приватный ключ, соответствующий ключу в `authorized_keys` на сервере; без парольной фразы, с переводом строки в конце |
| `REG_KNOWN_HOSTS` | File (рекомендуется) | Проверенная запись SSH host key сервера; для нестандартного порта адрес имеет вид `[host]:port` |

Для всех переменных включите **Protected**, ветка `main` должна быть защищённой. Environment scope: `production` или `*`. Отключите подстановку переменных (**Expand variable reference**) для ключей. Многострочные SSH-ключи не поддерживают GitLab Masked; для File-переменных выберите Visible. Значения не выводятся job в журнал. Ключ и known_hosts также поддерживаются как обычные многострочные Variable для совместимости со старыми настройками.

`REG_KNOWN_HOSTS` — новая переменная: прежний workflow получал ключ сервера при каждом запуске. Теперь ключ проверяется по заранее сохранённой записи. На доверенной машине можно сохранить её командой (подставьте свой хост и порт):

```sh
ssh-keyscan -p 22 your-reg-host > reg-known-hosts
ssh-keygen -lf reg-known-hosts
```

Сверьте отпечаток с ключом сервера через доверенный доступ/панель REG.RU и перенесите содержимое `reg-known-hosts` в File-переменную. Сам по себе результат `ssh-keyscan` не подтверждает подлинность сервера. См. [рекомендации GitLab по SSH в CI/CD](https://docs.gitlab.com/ci/jobs/ssh_keys/).

Как и раньше, `rsync --delete` удаляет из каталога назначения файлы, которых нет в сборке. `REG_DEPLOY_PATH` должен указывать только на каталог статического сайта, без пользовательских загрузок и файлов бэкенда.

### Превью шаблонов

Превью и `slides.json` теперь загружаются с того же сайта из `/template-previews/`, а не из старого GitHub-репозитория. Pipeline добавляет SHA коммита к URL для обновления кеша. Приватность GitLab-репозитория не влияет на доступность картинок.

При отдельном CDN можно задать `NEXT_PUBLIC_TEMPLATE_ASSETS_BASE_URL` на этапе сборки. Без этой переменной используется текущий домен. Не переносите старое значение с `raw.githubusercontent.com`.

### Первый запуск

1. Настройте runner и переменные выше.
2. Отправьте изменения в `main` или запустите pipeline вручную после их попадания в `main`.
3. Убедитесь, что job `deploy_reg` завершился успешно: он проверяет, что сайт отдаёт SHA именно этой сборки.

Workflow `.github/workflows/deploy-reg.yml` заменён GitLab-конфигурацией. Если старый GitHub-репозиторий остаётся активным, отключите Actions workflow в нём, чтобы он не перезаписывал тот же сайт.
