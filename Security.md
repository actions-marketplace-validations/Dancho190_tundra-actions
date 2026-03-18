# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| v1.x    | ✅ |
| < v1.0  | ❌ |

---

## Reporting a Vulnerability

**Пожалуйста, не создавай публичный GitHub Issue для уязвимостей.**

Если ты нашёл security issue в `tundra-action` — сообщи нам приватно:

### Способ 1 — GitHub Private Vulnerability Reporting (рекомендуется)

```
github.com/dan321/tundra-action → Security → Report a vulnerability
```

### Способ 2 — Email

Напиши на **security@tundra.dev** со следующей информацией:

- Описание уязвимости
- Шаги для воспроизведения
- Потенциальный impact
- Версия `tundra-action` где обнаружена проблема

**Мы отвечаем в течение 48 часов.**

---

## Что происходит после репорта

```
День 1-2   → Подтверждаем получение репорта
День 3-7   → Оцениваем severity и воспроизводим
День 7-14  → Разрабатываем фикс
День 14-21 → Выпускаем патч версию
День 21+   → Публикуем CVE и благодарим репортера
```

---

## Известные меры защиты

### Command Injection

Все внешние команды (Jest, Vitest, ESLint) запускаются через `execa` с явным `shell: false`. Аргументы передаются как массив — никакой конкатенации строк.

```typescript
// Безопасно — shell: false, аргументы как массив
await execa("npx", ["jest", "--json"], { shell: false })
```

### Path Traversal

Все пути валидируются через `path.resolve()` и проверяются на принадлежность `GITHUB_WORKSPACE` перед использованием.

### Token Scope

Action запрашивает минимально необходимые permissions:

```yaml
permissions:
  contents:      read
  pull-requests: write
  checks:        write
```

### Dependency Security

- `package-lock.json` всегда закоммичен
- Dependabot настроен для автоматических обновлений зависимостей
- `npm audit` запускается в CI при каждом push

### Supply Chain

Рекомендуем юзерам пинить action по SHA коммита вместо тега:

```yaml
# Безопаснее — конкретный SHA нельзя переписать
- uses: dan321/tundra-action@a1b2c3d4e5f6

# Менее безопасно — тег можно переместить
- uses: dan321/tundra-action@v1
```

---

## Scope — что входит в scope

| Компонент | В scope |
|-----------|---------|
| `tundra-action` GitHub Action | ✅ |
| `@dan321/tundra-sdk` npm пакет | ✅ |
| GitHub Actions workflow примеры в README | ✅ |
| Сторонние зависимости (ESLint, execa) | ❌ репортируй им напрямую |
| GitHub Actions платформа | ❌ репортируй в GitHub |

---

## Hall of Fame

Благодарим всех кто помогает делать Tundra безопаснее:

_Пока пусто — будь первым!_

---

## Дополнительные ресурсы

- [GitHub Security Advisories](https://github.com/dan321/tundra-action/security/advisories)
- [Dependabot Alerts](https://github.com/dan321/tundra-action/security/dependabot)
- [GitHub Actions Security Hardening Guide](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)