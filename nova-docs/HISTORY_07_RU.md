# NOVA OS — изменения

## 0.7 — Welcome и Health Center

- Мастер NOVA Welcome: шесть необязательных шагов первого запуска.
- Безопасный флаг завершения; Live-сеанс не помечается настроенным.
- NOVA Health: просмотр компонентов и ручной экспорт диагностического отчёта.
- Скрытие домашнего пути, IP и MAC при экспорте (проверить перед отправкой).
- Новые ярлыки и интеграция NOVA Control; старые функции сохранены.
- ISO и GUI не проверены на настоящем ноутбуке.

---
# NOVA OS 0.5 — Sound Studio / Gaming / Phone Hub

- 3 новых GUI-приложения, 2 фоновых инструмента звуков и 9 оригинальных WAV-сигналов.
- UPower D-Bus, кастомизация зарядки, FFmpeg для обрезки и затуханий.
- Steam Big Picture, DualShock/DualSense, опциональные udev-правила, профили мощности.
- ADB по USB/Wi-Fi, сквозное сопряжение кодом через stdin, scrcpy из backports, KDE Connect и дополнительный Android-дисплей.
- 25 статических и поведенческих тестов пройдены, OGG-конвертация проверена на образце. Загрузка ISO не тестировалась.

---

# NOVA OS 0.4 — Dual Boot & Migration

- Read-only dual boot audit, EFI/NTFS visibility, human checklist.
- Conservative Calamares initial choice none; os-prober plus GRUB config.
- Selective user-data migration with no source writes, private destination, reports and cancellation.
- Browser bookmarks in importable HTML, catalog of Windows apps in CSV.
- Windows PowerShell inventory/export helper (non-destructive).
- Documentation & executable regression tests.

---

# История изменений NOVA OS

## 0.4 (исходники)

- Новая схема NOVA Air — отдельные светлая/тёмная Qt QSS-темы + стандартная светлая Breeze KDE для новых пользователей.
- Обновлены существующие GUI-утилиты для загрузки NOVA Air QSS.
- Добавлен собственный фоновый пейзаж горного озера.
- Добавлены 6 самостоятельных визуальных концептов (не являются скриншотами запущенной системы).
- Добавлен Android Hub с первоначальной установкой Waydroid из Debian 13 Backports, запуском, установкой APK и списком приложений.
- Добавлены опциональные варианты VANILLA/GAPPS. Повторная инициализация из мастера блокируется при обнаружении существующей среды.
- Добавлены быстрые ссылки на Gmail, Google Drive, Calendar и документацию Google Play Protect.
- Добавлен NOVA Hardware Check с диагностикой и ручной проверкой до Calamares.
- В NOVA Control добавлен Android-раздел, выбор темы и доступ к проверке оборудования.
- Исправлено устаревшее имя ISO по умолчанию в QEMU-скрипте.
- Добавлены тесты на отсутствие сброса Android и опасного вмешательства в диски при диагностике.
- Реальная сборка и проверка ISO остаются отдельным невыполненным шагом.

## 0.2

Сохранены существующие Defender, Optimizer, Uninstaller, Task Manager, Privacy, Search, Wine, Bottles/VM, настройки Plasma.
