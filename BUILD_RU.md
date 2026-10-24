# Сборка NOVA OS 0.12

Результат сборки — гибридный ISO `NOVA-OS-0.12-amd64.iso` (загрузка BIOS/Legacy и UEFI, DVD и USB), файл `SHA256SUMS`, отчёт `verify-report.txt` и список пакетов `build-manifest.txt`.

> Статус 0.12: ISO собран в GitHub Actions (≈18 мин) и прошёл загрузку BIOS/UEFI в QEMU. Отчёты CI публикуются также в ветки `ci/build`, `ci/ui-smoke`, `ci/boot-bios`, `ci/boot-uefi`.

## Вариант 1. Только телефон + GitHub (рекомендуется)

### Один раз: загрузить исходники в репозиторий

Самый простой путь — попросить Claude: создайте **пустой** репозиторий (например `nova-os`) в GitHub-приложении и дайте Claude к нему доступ — он загрузит исходники сам.

Самостоятельно с телефона:
1. GitHub → **New repository** → имя `nova-os` → Create (без README).
2. **Add file → Create new file**, имя `.github/workflows/unpack-source.yml`, вставьте содержимое файла `.github/workflows/unpack-source.yml` из этого архива → Commit.
3. **Add file → Upload files** → загрузите ZIP с исходниками NOVA (`NOVA-OS-v0.12-SOURCE.zip`) → Commit.
4. **Actions → Unpack NOVA source ZIP → Run workflow**. Через 1–2 минуты в репозитории появятся все файлы проекта, ZIP будет удалён.
5. GitHub не разрешает автоматическому токену писать в `.github/workflows`, поэтому сборочный workflow окажется в папке `nova-workflows/`. Откройте `nova-workflows/build-iso.yml` → ✏️ (Edit) → в поле имени файла сотрите начало пути и введите `.github/workflows/build-iso.yml` → Commit. Это делается один раз.

### Каждая сборка

1. **Actions → Build NOVA OS ISO (experimental) → Run workflow** (ветка `main`, обе галочки включены).
2. Ждать 1,5–3 часа. Порядок заданий:
   - `Validate sources` — синтаксис и 162 теста (≈1 мин);
   - `UI smoke` — скриншоты всех 21 окна NOVA на 1366×768, Full HD, 2K@125 %, 4K@200 % в светлой и тёмной теме;
   - `Build ISO` — сборка в контейнере `debian:trixie` + `verify-iso.sh`;
   - `Boot test (bios)` и `Boot test (uefi)` — загрузка ISO в QEMU/KVM до рабочего стола Plasma, самопроверка внутри VM, скриншоты в 4 разрешениях.
3. Откройте завершённый запуск → внизу **Artifacts**:
   - `NOVA-OS-0.12-ISO` — ISO + SHA256SUMS (zip-архив ~4 ГБ; хранится 7 дней);
   - `NOVA-OS-boot-test-bios/uefi` — скриншоты и `result.json`;
   - `NOVA-UI-smoke-screenshots` — скриншоты окон NOVA;
   - `NOVA-OS-build-reports` — `build.log`, `verify-report.txt`, `build-manifest.txt`.
4. Сводка (Summary) запуска показывает отчёт проверки ISO и результат загрузки без скачивания.

Сборка также запускается при пуше тега `v0.12…`. При обычном пуше в `main` выполняются только быстрые проверки и UI smoke.

## Вариант 2. Компьютер с Debian 13 (amd64)

```bash
bash tools/validate-project.sh                 # без root, без сети
sudo bash tools/install-build-deps.sh          # live-build, xorriso, qemu, ovmf…
sudo bash tools/build-iso.sh                   # 25+ ГБ свободного места, интернет
bash tools/verify-iso.sh                       # уже вызывается в конце сборки
bash tools/qemu-boot-test.sh                   # автоматический тест BIOS+UEFI (headless)
bash tools/test-qemu-uefi.sh                   # интерактивная Live-сессия в окне
```

Повторная сборка: `sudo NOVA_REBUILD=1 bash tools/build-iso.sh` (удаляет только `output/work`). Без этой переменной скрипт откажется перезаписывать прежнюю сборку.

## Вариант 3. Любой Linux с Docker

```bash
docker run --rm --privileged -v "$PWD:/project" -w /project debian:trixie \
  bash -c 'bash tools/install-build-deps.sh && bash tools/build-iso.sh'
```

## Что делает сборка

- `lb config`: Debian 13 trixie, amd64, `main contrib non-free non-free-firmware`, загрузчики `grub-pc,grub-efi` (одно меню GRUB в BIOS и UEFI), подписанные shim+GRUB для Secure Boot, ядро с параметрами `boot=live components quiet splash locales=ru_RU.UTF-8 keyboard-layouts=us,ru`.
- Пакеты: `image/config/package-lists/nova.list.chroot` (каждое имя сверено с архивом Debian 13).
- Пул для Calamares: `nova-installer-bios.list.binary` и `nova-installer-efi.list.binary` → установка GRUB работает без интернета.
- Хуки: `090-nova.hook.chroot` (службы, брандмауэр включён, брендинг Calamares NOVA с откатом на Debian), `095-nova-pool-indices.hook.binary` (APT-индексы пула).
- Оверлей: приложения NOVA, тема NOVA Air для Plasma, SDDM, обои.

## Проверка безопасности конвейера

- Скрипты не обращаются к реальным дискам; QEMU-тесты подключают только ISO (только чтение) и, по желанию, пустой qcow2-файл.
- Пакеты — только из официального архива Debian (подписи проверяет APT/debootstrap). Никаких сторонних репозиториев и `curl | bash`.
- Проприетарный NVIDIA, Google Play и офисные пакеты в ISO не входят (проверяется `verify-iso.sh`).

## Если сборка упала

Скачайте артефакт `NOVA-OS-build-reports`, откройте `build.log` и найдите первую строку с `E:` или `ERROR`. Чаще всего: временная недоступность зеркала (перезапустите), нехватка места (`No space left on device`), изменение имени пакета в Debian (сверить в `packages.debian.org`).
