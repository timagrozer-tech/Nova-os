# NOVA OS 0.2: Реальная совместимость Windows-программ

## 1. Как запускаем

1. **Нативные Linux-приложения:** APT / Flatpak, максимум совместимости и стабильности.
2. **Windows EXE/MSI:** Wine, запуск через `nova-open-windows` с подтверждением. 32-битные приложения могут потребовать отдельных библиотек i386 или иной конфигурации Wine.
3. **Окружения для программ:** Bottles (официальный Flatpak), устанавливается при первом использовании с подтверждением. Оно умеет устанавливать зависимости внутри отдельного Wine-префикса.
4. **Игры:** Steam + Proton (Steam устанавливается отдельно пользователем), Vulkan и Mesa, Gamemode, MangoHud. Игры с античитом и kernel-драйверами нельзя обещать.
5. **Несовместимые программы:** virt-manager + QEMU/KVM, установка подлинной Windows через ISO и отдельную лицензию; графическая производительность тяжёлых 3D-программ в обычной VM может быть недостаточной без GPU passthrough.

## 2. Microsoft Office

**Microsoft 365 в браузере** — путь без установки офисного пакета в NOVA OS (при наличии подписки/учётной записи и подключения по требованиям Microsoft).

**Актуальный настольный Microsoft Office** нельзя обещать под Wine: CodeWeavers на начало 2026 года отмечает Office 365 для CrossOver Linux как «Installs, Will Not Run» и объявила о прекращении поддержки новых Office.

Если нужен полноценный Word/Excel/PowerPoint Desktop с максимальной совместимостью надстроек и макросов — установите лицензированную Windows в отдельную виртуальную машину. Работа специализированного USB-периферийного устройства в виртуальной машине может потребовать настройки.

LibreOffice, Calligra и другие офисные пакеты в манифест NOVA OS не добавлены.

## 3. Границы

Microsoft Windows и Linux используют разные ядра, интерфейсы драйверов и механизмы безопасности. «100% совместимость со всем Windows» без Windows невозможно гарантировать. Проприетарные NVIDIA и нестандартная периферия должны проверяться по модели ноутбука до удаления Windows.

## Источники

- Bottles: https://docs.usebottles.com/getting-started/installation
- CodeWeavers: https://www.codeweavers.com/compatibility/crossover/changelog/microsoft-office-365
- KDE KRunner: https://docs.kde.org/trunk_kf6/en/plasma-desktop/plasma-desktop/krunner.html
- Debian firmware: https://wiki.debian.org/Firmware
