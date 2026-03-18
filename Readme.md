<div align="center">

<svg width="64" height="64" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M100 28 L172 132 L28 132 Z" stroke="white" stroke-width="14" stroke-linejoin="round" fill="none"/>
  <line x1="28" y1="150" x2="172" y2="150" stroke="white" stroke-width="12" stroke-linecap="round"/>
  <line x1="52" y1="166" x2="148" y2="166" stroke="white" stroke-width="9" stroke-linecap="round"/>
</svg>

# tundra-action

**AI-powered code review for GitHub Actions**

Автоматический анализ кода при каждом PR и push — без ручной настройки ESLint, тестов и конфигов.

[![GitHub Action](https://img.shields.io/badge/GitHub-Action-2088FF?logo=github-actions&logoColor=white)](https://github.com/dan321/tundra-action)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

---

## Что это такое

`tundra-action` — это GitHub Action который при каждом Pull Request автоматически:

- Анализирует код через **Tundra SDK** — находит API эндпоинты, баги, уязвимости
- Запускает **ESLint** по изменённым файлам
- Прогоняет **тесты** проекта (Jest или Vitest) и собирает coverage
- Постит **тёмный UI отчёт** прямо в тред PR
- Создаёт **inline annotations** — подсветку проблемных строк в diff
- Считает **health score** от 0 до 100
- Блокирует мерж если найдены критические ошибки

Разработчик добавляет **два шага** в workflow — и всё работает автоматически.

---

## Быстрый старт

Создай файл `.github/workflows/tundra.yml` в своём репозитории:

```yaml
name: Tundra Review

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main, develop]

jobs:
  tundra:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: dan321/tundra-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Всё. Никаких `npm install`, никаких конфигов — action запакован в единый бандл.

---

## Что увидишь в PR

После каждого PR в тред появляется отчёт:

```
┌─────────────────────────────────────────────────────┐
│  △  tundra / review                                 │
│     3 files · 5 issues                              │
│                    2 errors  3 warnings  Score 74 B │
├─────────────────────────────────────────────────────┤
│  □ src/api.ts                                       │
│                                                     │
│  ● error   L34  no-unused-vars                      │
│    'apiClient' is defined but never used            │
│                                                     │
│  △ warning  L58  @typescript-eslint/no-explicit-any │
│    Unexpected any. Specify a different type.        │
├─────────────────────────────────────────────────────┤
│  □ src/routes/users.ts                              │
│                                                     │
│  ● error   L12  tundra/unprotected-endpoint         │
│    DELETE /users/:id has no authentication          │
├─────────────────────────────────────────────────────┤
│  base  −  errors ×10  −  warnings ×3  =  score      │
│  100      −20            −6             74 B        │
└─────────────────────────────────────────────────────┘
```

А в **Checks вкладке PR** — отдельная строка для каждого инструмента:

```
Checks
├── ✅ tundra / endpoints   24 endpoints found
├── ❌ tundra / eslint      2 errors, 3 warnings
└── ✅ tundra / tests       48 passed · coverage 87%
```

---

## Inputs

| Input           | Описание                                                       | По умолчанию     |
| --------------- | -------------------------------------------------------------- | ---------------- |
| `github-token`  | `secrets.GITHUB_TOKEN` для комментариев и Checks API           | **обязательный** |
| `mode`          | `diff` — только изменённые файлы PR, `full` — весь репозиторий | `diff`           |
| `eslint`        | Запускать ESLint (`true` / `false`)                            | `true`           |
| `eslint-config` | Путь к ESLint конфигу если не в корне                          | `.eslintrc.json` |
| `frameworks`    | Фреймворки через запятую: `express,nestjs,fastapi`             | автодетект       |
| `fail-on-error` | Падать если найдены ESLint errors                              | `true`           |

---

## Outputs

Доступны в следующих шагах workflow через `steps.<id>.outputs.*`:

| Output            | Описание                                    |
| ----------------- | ------------------------------------------- |
| `endpoints-count` | Количество найденных API эндпоинтов         |
| `issues-count`    | Общее количество issues (errors + warnings) |
| `passed`          | `true` если все проверки прошли             |
| `score`           | Health score от 0 до 100                    |

**Пример использования outputs:**

```yaml
- uses: dan321/tundra-action@v1
  id: tundra
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Check score
  run: |
    echo "Score: ${{ steps.tundra.outputs.score }}"
    echo "Passed: ${{ steps.tundra.outputs.passed }}"
```

---

## Конфигурации

### Минимальная — только Tundra анализ

```yaml
- uses: dan321/tundra-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    eslint: "false"
```

### Полная — ESLint + тесты + строгий режим

```yaml
- uses: dan321/tundra-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    mode: full
    eslint: "true"
    eslint-config: .eslintrc.json
    frameworks: express,nestjs
    fail-on-error: "true"
```

### Только на push в main без PR комментария

```yaml
on:
  push:
    branches: [main]

steps:
  - uses: actions/checkout@v4
  - uses: dan321/tundra-action@v1
    with:
      github-token: ${{ secrets.GITHUB_TOKEN }}
      mode: full
```

---

## Как заблокировать мерж до прохождения проверки

В настройках репозитория:

```
Settings → Branches → Add branch ruleset
Branch targeting: main

☑ Require status checks to pass
  + tundra / eslint     ← добавить
  + tundra / endpoints  ← добавить
  + tundra / tests      ← добавить (если есть тесты)
```

После этого кнопка **Merge** становится неактивной пока все чеки не зелёные.

---

## Архитектура

```
.github/workflows/tundra.yml
           │
           ▼
      action.yml  ←  манифест: inputs, outputs, runs: node20
           │
           ▼
     src/index.ts  ←  оркестратор (10 шагов)
           │
    ┌──────┼──────────────┐
    ▼      ▼              ▼
detect   list-runner   runners (параллельно)
   │         │         ├── tundra-runner  → scanProject()
   │         │         ├── lint-runner    → ESLint
   │         │         └── test-runner    → Jest / Vitest
   │         │              │
   └─────────┴──────────────┘
                    │
                    ▼
               aggregator  ←  мержит RunnerResult[]
                    │
                    ▼
                 scorer  ←  100 − errors×10 − warnings×3
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
     checks.ts           annotations.ts
  GitHub Checks API      HTML отчёт в PR
  inline annotations     тёмный UI блок
```

### Структура файлов

```
tundra-action/
├── action.yml                  ← манифест GitHub Action
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                ← оркестратор
    ├── types.ts                ← все типы проекта
    ├── github.api.ts           ← postComment, setCommitStatus
    ├── core/
    │   ├── detect.ts           ← автодетект окружения проекта
    │   ├── aggregator.ts       ← мерж RunnerResult[]
    │   └── scorer.ts           ← health score 0-100
    ├── runners/
    │   ├── list-runner.ts      ← сбор файлов (diff / full)
    │   ├── tundra-runner.ts    ← Tundra SDK wrapper
    │   ├── lint-runner.ts      ← ESLint wrapper
    │   └── test-runner.ts      ← Jest / Vitest wrapper
    └── github/
        ├── index.ts            ← реэкспорт
        ├── checks.ts           ← GitHub Checks API
        └── annotations.ts      ← Issue[] → Annotation[] + HTML
```

---

## Как это работает под капотом

1. **`actions/checkout`** клонирует репозиторий юзера в `/home/runner/work/`
2. **`tundra-action`** запускает `node dist/index.js` — единый бандл со всеми зависимостями внутри
3. `detect.ts` сканирует файловую систему — находит ESLint конфиг, тест-раннер, фреймворки
4. `list-runner.ts` идёт в GitHub API и получает список изменённых файлов PR
5. Три runner'а запускаются **параллельно** через `Promise.all`
6. `aggregator.ts` мержит все результаты в единый отчёт
7. `scorer.ts` считает score: `100 − (errors × 10) − (warnings × 3)`
8. `checks.ts` создаёт отдельный Check Run для каждого инструмента с inline annotations
9. `annotations.ts` строит тёмный HTML блок и постит его в тред PR
10. Если `fail-on-error: true` и есть errors — workflow падает, мерж заблокирован

---

## Health Score

Score показывает общее здоровье кода по шкале 0–100:

| Score  | Grade | Значение                       |
| ------ | ----- | ------------------------------ |
| 90–100 | A 🟢  | Отлично — код чистый           |
| 70–89  | B 🟡  | Хорошо — есть мелкие замечания |
| 50–69  | C 🟠  | Требует внимания               |
| 0–49   | D 🔴  | Критично — нужен рефакторинг   |

**Формула:**

```
score = max(0, 100 − (errors × 10) − (warnings × 3) − (coverage_penalty))
```

Coverage penalty: −10 если покрытие тестами ниже 80%.

---

## Поддерживаемые языки и фреймворки

| Язык                    | Фреймворки                          |
| ----------------------- | ----------------------------------- |
| TypeScript / JavaScript | Express, NestJS, Fastify, Koa, Hapi |
| Python                  | Flask, FastAPI, Django              |
| Java                    | Spring                              |

ESLint работает только для TypeScript и JavaScript файлов. Tundra SDK анализирует все поддерживаемые языки.

---

## Требования

- **GitHub Actions** — любой план (бесплатно для публичных репо)
- **Node.js 20** — предоставляется GitHub runner автоматически
- **Permissions** в workflow:
  ```yaml
  permissions:
    contents: read
    pull-requests: write # для комментариев в PR
    checks: write # для Check Runs и annotations
  ```

---

## Разработка

### Установка зависимостей

```bash
git clone https://github.com/dan321/tundra-action
cd tundra-action
npm install
```

### Сборка

```bash
npm run build
# → dist/index.js — единый бандл через @vercel/ncc
```

### Локальный тест

```bash
GITHUB_WORKSPACE=/path/to/your/project \
GITHUB_REPOSITORY=owner/repo \
GITHUB_HEAD_REF=feature/branch \
GITHUB_RUN_ID=123 \
GITHUB_SERVER_URL=https://github.com \
node dist/index.js
```

### Деплой новой версии

```bash
npm run build
git add dist/
git commit -m "build: update dist"
git tag v1 -f
git push origin v1 -f
```

---

## FAQ

**Q: Нужно ли устанавливать ESLint в своём проекте?**
Нет. ESLint уже зашит в бандл action. Но если в проекте есть `.eslintrc.json` — action использует твои правила.

**Q: Работает ли action с приватными репозиториями?**
Да. `secrets.GITHUB_TOKEN` автоматически имеет доступ к текущему репозиторию.

**Q: Можно ли использовать без Tundra SDK?**
Нет. Tundra SDK — это основной движок анализа. ESLint и тесты — дополнительные слои поверх него.

**Q: Почему action постит HTML а не markdown?**
GitHub поддерживает HTML в комментариях PR — это позволяет использовать тёмный UI с карточками и иконками вместо plain text.

**Q: Как посмотреть детальные логи?**
В Actions UI → выбрать workflow run → выбрать job `tundra` → развернуть шаг `Run dan321/tundra-action@v1`.

---

## Лицензия

MIT © [dan321](https://github.com/dan321)

---

<div align="center">
  <sub>Сделано с ❤️ для разработчиков которые ценят качество кода</sub>
</div>
