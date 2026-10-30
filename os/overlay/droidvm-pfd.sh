#!/system/bin/sh
# DroidVM OS — ранний этап загрузки (до запуска Android-фреймворка). Должен отработать быстро.
MT="$1"
D=/data/adb/droidvm
mkdir -p $D
rp() { "$MT/magisk" resetprop "$@" 2>/dev/null; }

# Имя устройства в «О телефоне»
for p in ro.product.model ro.product.system.model ro.product.vendor.model ro.product.product.model; do
  rp -n $p "DroidVM OS"
done
rp -n ro.product.marketname "DroidVM OS"
rp -n ro.droidvm.version "@DROIDVM_VERSION@"

# Пропуск мастера первоначальной настройки
rp -n ro.setupwizard.mode DISABLED

# Производительность в эмуляции (TCG): меньше потоков компиляции, без лишних проверок
rp -n dalvik.vm.dex2oat-threads 2
rp -n dalvik.vm.image-dex2oat-threads 2
rp -n ro.config.avoid_gfx_accel true

if [ ! -f $D/.locale ]; then
  # Русский язык и московское время — только при первом запуске, дальше выбор пользователя
  rp -p persist.sys.locale ru-RU
  rp -p persist.sys.timezone Europe/Moscow
  rp -p persist.sys.language ru
  rp -p persist.sys.country RU
  touch $D/.locale
fi
# ADB по сети (порт 5555 пробрасывается на телефон-хозяин)
rp persist.adb.tcp.port 5555
rp service.adb.tcp.port 5555
exit 0
