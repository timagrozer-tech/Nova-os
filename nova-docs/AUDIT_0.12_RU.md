# Аудит NOVA OS 0.11 → 0.12

Дата: 24–25.10.2026. Исходник: `NOVA-OS-v0.11-Update-Recovery-SOURCE.zip`
(SHA-256 `1ba670c5…c322`, совпал с указанным в мастер-промпте).

## Как проверялось

| Что | Чем | Результат |
|---|---|---|
| Имена всех 104 пакетов 0.11 + ≈45 кандидатов для 0.12 | API архива Debian `api.ftp-master.debian.org/madison`, suite `stable` (= Debian 13 trixie) | 1 несуществующий пакет (см. ниже) |
| Пакеты из backports (`waydroid`, `scrcpy`) | тот же API без фильтра suite | есть в `trixie-backports` → мастера Android/Phone корректны |
| Python-код (36 файлов 0.11) | `ruff` (pyflakes F, B, E9) | неопределённых имён нет; 20 неиспользуемых импортов |
| Shell-скрипты и хуки | `bash -n`, `sh -n` | синтаксис корректен |
| Опасные операции с дисками | поиск `mkfs`, `wipefs`, `dd`, `parted`, `rmtree`, `efibootmgr -B` | не найдено; `rmtree` только во временном каталоге звуковой темы |
| Логика Calamares в Debian 13 | исходники `bootloader-config` / `sources-media` (calamares-settings) | установка GRUB идёт через `apt-get` из `file:/run/live/medium` |
| Прежние тесты | `python3 -m unittest` | 99 из 99 прошли до изменений |

**Не проверялось (недоступно в этой среде):** реальная сборка ISO — зеркала Debian (deb.debian.org и все известные зеркала) и PyPI заблокированы политикой сети, `/dev/kvm` отсутствует. Поэтому сборка и загрузочный тест перенесены в GitHub Actions (см. `BUILD_RU.md`).

## Блокирующие ошибки сборки ISO (исправлены)

1. **`spectacle` не существует в Debian 13** — пакет называется `kde-spectacle`. В 0.11 `lb build` остановился бы на установке пакетов («Unable to locate package spectacle»). → исправлено, добавлена проверка в `validate-project.sh`.
2. **Офлайн-установка Calamares падала бы на шаге загрузчика.** `calamares-settings-debian` подключает носитель как APT-источник и ставит `grub-pc` или `grub-efi-amd64`. В ISO 0.11 не было ни пула пакетов, ни индексов. → добавлены `nova-installer-bios.list.binary` и `nova-installer-efi.list.binary` (раздельно: `grub-pc` конфликтует с `grub-efi-amd64`, а live-build разрешает каждый список одной транзакцией) и binary-хук `095-nova-pool-indices`, который создаёт `dists/trixie/main/binary-amd64/Packages` и метку `.disk/nova-offline-bootloader`.
3. **`--firmware-binary true`** клал в ISO каталог `/firmware` для debian-installer, которого в NOVA нет → лишние сотни МБ. Отключено (прошивки остаются в системе через `--firmware-chroot`).
4. **Версия была вписана в 9 местах** (скрипты, workflow, тесты, UI с «0.8»/«0.4»). → единый файл `VERSION`, `/etc/nova-release` генерируется при сборке.
5. **`verify-iso.sh` проверял только SHA-256.** → теперь проверяет El Torito BIOS+UEFI, гибридную разметку для USB, ядро/initrd/squashfs, GRUB `boot=live`, цепочку Secure Boot, пул GRUB, наличие Calamares/Plasma/SDDM/NetworkManager/PipeWire, всех приложений NOVA, отсутствие офисного пакета и проприетарного NVIDIA.

## Ошибки времени выполнения (исправлены)

| Где | Проблема | Исправление |
|---|---|---|
| NOVA Control | `free -h` без второй строки → `IndexError` при запуске | `memory_line()` с безопасным запасным текстом |
| NOVA Control | версия «NOVA OS 0.8» в обзоре | версия из `/etc/nova-release` |
| Task Manager | PID брался из первой выделенной ячейки (могла быть колонка «Процесс») → `ValueError` каждые 2 с | `selected_pid()` читает колонку 0 |
| Тёмная тема | `QTabWidget::pane { background:#fff }` — белая панель вкладок | QSS генерируется из токенов, тест на регрессию |
| Все окна | фиксированные размеры до 1080×800 — не помещались на 1366×768 (доступно ~720 px) | `nova_ui.setup_window()` вписывает окно в экран |
| Sound daemon | без UPower (ПК/VM) — трассировка при автозапуске | тихий выход с сообщением |
| `/etc/skel` | `ColorScheme=BreezeLight` записывался каждому новому пользователю | умолчания перенесены в `/etc/xdg` (пользователь может менять) |
| nova-selftest (новый код) | «Intel Corpor**ati**on» распознавалась как AMD | производитель по PCI ID, тест на регрессию |

## Реальный уровень реализации модулей (на 0.12)

| Модуль | Уровень |
|---|---|
| NOVA Control, Defender, Uninstaller, Task Manager, Health, Performance, Update Center, Driver Center | Рабочий код PyQt6 + проверенные ядра логики (unit-тесты). На реальной Plasma не запускались. |
| Android Hub (Waydroid), Phone Hub (scrcpy) | Установка по запросу из trixie-backports (подтверждено наличие пакетов). Работа с телефоном не проверена. |
| Dual Boot, Migration | Только чтение / копирование выбранного; ни одной команды изменения разделов. Сценарий рядом с Windows 11 не проверен. |
| Sound Studio, Gaming, Gamepad | Рабочие ядра, тесты; оборудование не проверено. |
| Windows-программы | Wine (64-bit) из Debian + Bottles по запросу. 32-bit Windows-программы и Steam требуют i386 multiarch — не включено. |
| NOVA Air (0.12) | Look-and-Feel пакеты, цветовые схемы, режимы панели, персонализация — в исходниках и тестах; визуально не проверены в живой Plasma. |

## Оставшиеся риски (честно)

- Не проверено, что live-build 1:20250505 создаёт пул на ISO ровно так, как ожидает хук; хук не прерывает сборку, а `verify-iso.sh` покажет `WARN`, если пула нет.
- Свойства панели `lengthMode`/`floating` в скриптах Plasma 6.3 обёрнуты в `try` — при отличиях API режим применится частично, а не сломает оболочку.
- Размер ISO ожидается 3,5–4,5 ГБ (Plasma с рекомендуемыми пакетами, Wine, QEMU/libvirt, прошивки). Для FAT32-флешек — Ventoy (exFAT) или Rufus в режиме DD.
- Secure Boot: используется подписанный Debian shim+GRUB; модули DKMS (NVIDIA) после установки потребуют регистрации ключа MOK.
