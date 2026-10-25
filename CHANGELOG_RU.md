# NOVA OS 0.13 (в работе): стили, NOVA Live и автопилот

- **«Стили и функции»** (`nova-styles`, `nova-style`): семь стилей — NOVA Air светлая/тёмная, NEON//SYS, Aurora, Sakura,
  Ocean, Horizon; превью, «Применить»/«Используется», флажок «Сохранить мои панели», кнопка «Вернуть как было».
- **NOVA Live** — новый плагин обоев `org.nova.live.wallpaper`: «Живое небо» (ночь/рассвет/день/закат по настоящему
  Солнцу, Луна с реальной фазой), «Сияние», «Сакура», «Лунный океан»; пауза на батарее, выбор кадров/с.
- **Автопилот день/ночь** по восходу и закату (`nova-autopilot.timer`), место — по часовому поясу (честно помечено
  «приближённо») или вручную.
- **Функции рабочего стола** одним щелчком: встряхнуть мышь, активные углы, волшебная лампа, затемнение, куб, размытие —
  с возвратом ваших значений.
- Токены дизайна из мастер-промта: кольцо фокуса, контраст ≥ 4.5:1 / 3:1, формы окон для каждого стиля
  (`aurora.qss`, `sakura.qss`, `ocean.qss`), цветовые схемы и Look-and-Feel Aurora/Sakura/Ocean.
- Подробно: `nova-docs/STYLES_RU.md`; тесты `tests/test_v14_styles.py`.

# NOVA OS 0.13 (в работе): современный вид и быстрее

- **Окна NOVA:** видимые переключатели и флажки в светлой теме (раньше у невыбранных не было кружка), стилизованные
  ползунки и группы, кнопки с текстом по центру, акцентная полоса у выбранного раздела, содержимое карточек сверху.
- **Понятные заголовки** вместо «NOVA  /  ENGLISH»: «Драйверы и оборудование», «Игры», «Обновления и восстановление» и т. д.
- **Защита (Defender):** карточки AppArmor / брандмауэр / ClamAV / обновления с цветным статусом, отдельная карточка проверки папки.
- **Панель Windows-like плавающая** — как в Plasma 6 по умолчанию.
- **Заставка загрузки** Plymouth «nova»: логотип и индикатор на фоне NOVA (на базе стандартной темы spinner),
  `splash` для установленной системы через `grub.d`; Esc показывает текст. Пакеты `plymouth`, `plymouth-themes`.
- **Сжатая память zram** (`zram-tools`, zstd, до 50 % ОЗУ): быстрее подкачки на диск и бережёт SSD; `nova-zram-tune`
  повышает swappiness только если подкачка целиком в zram.
- **Слайды установщика NOVA** (Calamares) — ставятся, только если API слайдов Debian совпадает, иначе остаются слайды Debian.
- Тесты `tests/test_v13_system.py`; CI отрисовывает и слайды установщика.

# NEON//SYS для NOVA OS (готовится к 0.13)

- **Оформление NEON//SYS** без сторонних программ: Look-and-Feel `org.nova.neon.desktop`, цветовая схема `NovaNeon`
  (из токенов `nova_ui`, контраст ≥ 4.5:1), заставка загрузки KSplash, значки Papirus-Dark, экран блокировки.
- **Живые обои** — QML-плагин Plasma `org.nova.neon.wallpaper`: Synth Grid, Night City, Data Rain, Circuit и режим
  «по времени суток»; один таймер, 5–60 кадров/с, пауза на батарее и в режиме GAME, действия в меню рабочего стола.
- **Рабочий стол NEON:** HUD-панель сверху, плавающий док снизу, стандартные виджеты Plasma (часы, CPU, память, сеть,
  погода, музыка, заметки, таймер) с учётом размера экрана; повторное включение не дублирует виджеты и не трогает ваши.
- **`nova-neon`** (apply / revert / wallpaper / widgets / mode / status) и **центр NEON//SYS** (`nova-neon-center`, Win+Alt+N).
  Режимы WORK/GAME/NIGHT/FOCUS: профиль питания, «Не беспокоить», ночной режим — с возвратом ваших значений.
- Тема `neon` для всех окон NOVA (`/usr/share/nova/themes/neon.qss`), профиль Konsole `NEON`, звуковая тема `nova-neon`,
  шрифты Orbitron и Share Tech Mono (OFL 1.1).
- Интеграция: первый запуск, Персонализация, NOVA Control, `nova-layout theme neon`, сочетания клавиш NEON в общей
  таблице `nova_hotkeys_core` (без конфликтов с KDE и «как в Windows»).
- Проверки: `tests/test_v13_neon.py` (23 теста, скрипты Plasma в Node), `verify-iso.sh` проверяет файлы NEON,
  CI рендерит окна NOVA в теме `neon` и каждую сцену обоев в PyQt6 (`tools/neon_qml_smoke.py`).
- В двух старых тестах слово `neon` служило примером *недопустимой* темы; теперь это настоящая тема, пример заменён на `sepia`.
- NOVA Air остаётся оформлением по умолчанию для новых пользователей.

# Изменения NOVA OS 0.12 — System Experience & ISO Readiness

## Сборка ISO (P0)
- Исправлено: пакета `spectacle` в Debian 13 нет — заменён на `kde-spectacle` (сборка 0.11 остановилась бы на установке пакетов).
- Исправлено: Calamares (calamares-settings-debian) ставит GRUB через apt из носителя; в ISO добавлен пул `grub-pc` (BIOS) и `grub-efi-amd64`+`shim-signed` (UEFI) в двух отдельных списках `.list.binary` (пакеты конфликтуют) и binary-хук `095-nova-pool-indices` с APT-индексами — установка работает без интернета.
- `build-iso.sh`: версия из файла `VERSION`, загрузчики `grub-pc,grub-efi`, `--firmware-binary false` (минус лишний каталог прошивок для d-i), раскладки us/ru, проверка свободного места, безопасная пересборка `NOVA_REBUILD=1`, `build-manifest.txt`, автоматический `verify-iso.sh`.
- `verify-iso.sh`: проверка El Torito BIOS+UEFI, гибридной разметки, ядра/initrd/squashfs, `boot=live`, Secure Boot-цепочки, пула GRUB, Calamares/Plasma/SDDM/NetworkManager/PipeWire, всех приложений NOVA, отсутствия офисного пакета и проприетарного NVIDIA.
- Новые пакеты (все сверены с архивом Debian 13): live-config-systemd, user-setup, sudo, kwin-x11 (запасной X11-сеанс), qt6-wayland, sddm-theme-breeze, kde-config-sddm, libkscreen-bin, libkf6config-bin, kscreen, kde-config-gtk-style, breeze-gtk-theme, maliit-keyboard, fonts-inter, firmware-misc-nonfree, firmware-intel-graphics, firmware-nvidia-graphics, firmware-brcm80211, mesa-utils, nvidia-detect, cryptsetup, btrfs-progs, dosfstools, exfatprogs, python3-pyqt6.qtsvg, qemu-guest-agent, spice-vdagent.
- GitHub Actions: задания validate → ui-smoke → build-iso → boot-test (BIOS и UEFI в QEMU/KVM) с артефактами-скриншотами и сводками; workflow распаковки исходников для работы с телефона.
- `tools/nova_qemu_smoke.py`, `tools/qemu-boot-test.sh`: headless-загрузка, гостевой агент, `nova-selftest` в VM, скриншоты Plasma в 4 разрешениях. `test-qemu*.sh`: KVM при наличии, звук, опциональный пустой виртуальный диск для Calamares.

## NOVA Air UX (P1)
- Look-and-Feel пакеты `org.nova.air.light/dark.desktop`, цветовые схемы NovaAirLight/Dark, системные умолчания `/etc/xdg` (шрифт Inter, Breeze, тонкие рамки, раскладки EN/RU), SDDM и экран блокировки с обоями NOVA. Генератор `tools/gen-plasma-theme.py` — один источник цветов с приложениями.
- Режимы рабочего стола Windows-like / Dock-like / Hybrid средствами Plasma desktop scripting; плотность compact/standard/touch; резервная копия раскладки перед каждой сменой; восстановление; «Вернуть KDE Plasma по умолчанию».
- Новые приложения: **NOVA — персонализация** (`nova-personalize`), CLI `nova-layout`, **самопроверка** `nova-selftest`.
- `nova_ui.py`: токены светлой/тёмной темы (контраст ≥ 4.5:1), авто-тема по Plasma, вписывание окон в экран, адаптивная навигация, адаптивная сетка карточек, единые диалоги (безопасная кнопка по умолчанию), индикатор выполнения, уважение «без анимаций», хук офскрин-скриншотов для CI.
- Все 18 окон NOVA переведены на `nova_ui.setup_window`; 14 диалогов подтверждения — на `nova_ui.confirm`. NOVA Control: адаптивная навигация, Ctrl+F, раздел «Оформление и панель».
- Брендинг Calamares NOVA поверх проверенной конфигурации Debian (с автоматическим откатом), ярлык «Установить NOVA OS».

## Дисплеи, клавиатура, игры
- **NOVA — дисплеи** (`nova-display`): разрешение, частота (Гц), масштаб, поворот, VRR, основной монитор; второй монитор как Win+P (компьютер/дублировать/расширить/второй); откат через 15 с; профили мониторов; яркость внешнего монитора через ddcutil (DDC/CI, `i2c-dev`); экономия батареи — 60 Гц на батарее (по желанию).
- **NOVA — горячие клавиши** (`nova-hotkeys`): сочетания как в Windows по умолчанию с явным снятием конфликтов KDE; возврат к KDE; шаг громкости 2 %; клавиши «Калькулятор/Проводник/Домашняя страница/Почта/Инструменты» (`nova-key`); проверка клавиш.
- **NOVA Game Bar** (Win+G): мониторинг, профиль питания, звук и микрофон, снимок и запись экрана, GameMode/MangoHud, Steam Big Picture.
- Значки Papirus (Debian-пакет проекта с GitHub) в Персонализации; новые пакеты ddcutil, kcalc, kinfocenter, papirus-icon-theme, kwin-addons, plasma-widgets-addons (сверены с архивом Debian 13).

## Надёжность и безопасность (P2)
- Брандмауэр UFW включён по умолчанию.
- Исправлены: падение NOVA Control без `free`, падение Task Manager при выделении, белая панель вкладок в тёмной теме, окна выше 768 px, трассировка sound-daemon без UPower; неверное определение Intel как AMD в новом коде самопроверки найдено тестом и исправлено.
- Новые тесты (итого 162): исполняются хуки в песочнице, `verify-iso.sh` на заглушках, скрипты Plasma в Node, протокол гостевого агента QEMU, контраст цветов.
- 4 утверждения старых тестов о номере «0.11»/«0.10» и skel-теме переписаны на проверку согласованности с `VERSION` и `/etc/xdg`.

## Не проверено в 0.12
- Сборка ISO и загрузка — среда подготовки не имела доступа к зеркалам Debian и KVM; всё автоматизировано для первого прогона в GitHub Actions.

# Изменения NOVA OS 0.11 — Update & Recovery Center

- Добавлен NOVA Update & Recovery Center (PyQt6) и ярлык в меню приложений.
- Проверка плана APT в режиме имитации и выделение обновлений ядра, драйверов, загрузчика.
- Перед применением обновлений требуется настроенный Timeshift: создание снимка от имени root; при ошибке обновление не начинается.
- Помощник защищён отдельной административной оболочкой (разрешённые команды без пользовательского ввода путей).
- Журнал root-операций, проверка состояния ядра и ярлыки Flatpak/KDE Discover и fwupd.
- Без автоматического восстановления, BIOS-прошивок, удаления ядер и полного обновления Debian на другой релиз.
- Сохранены модули версий 0.1—0.10. Документация/скрипты сборки обновлены до 0.11.
