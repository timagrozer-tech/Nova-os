#!/system/bin/sh
# DroidVM OS — ранний этап загрузки (до запуска Android-фреймворка). Должен отработать быстро.
MT="$1"
# Служебные файлы — в /data/local (её создаёт сам init с правильной политикой шифрования).
# НЕЛЬЗЯ создавать новые папки верхнего уровня в /data (например /data/adb) на post-fs-data:
# при первой загрузке это ломает шифрование (set_policy_failed) и Android уходит в recovery.
D=/data/local/droidvm
[ -d /data/local ] && mkdir -p $D
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

# Русский язык по умолчанию (для сброса настроек и новых пользователей)
rp -n ro.product.locale ru-RU
rp -n ro.product.locale.language ru
rp -n ro.product.locale.region RU
if [ ! -f $D/.locale ]; then
  # Язык системы: русский, второй — английский (на клавиатуре обе раскладки).
  # Только при первом запуске, дальше — выбор пользователя.
  rp -p persist.sys.locale ru-RU,en-US
  rp -p persist.sys.timezone Europe/Moscow
  touch $D/.locale
fi
# --- Раздел droidvm (приложения + библиотека для microG) ---
P=/mnt/droidvm
DEV=""
for u in /sys/class/block/*/uevent; do
  if grep -q '^PARTNAME=droidvm$' "$u" 2>/dev/null; then DEV=$(sed -n 's/^DEVNAME=//p' "$u"); break; fi
done
if [ -n "$DEV" ] && ! grep -q " $P " /proc/mounts; then
  mkdir -p $P
  mount -t ext4 -o ro,context=u:object_r:system_lib_file:s0 /dev/block/$DEV $P
fi

# --- microG: подмена подписи (пропатченная libandroid_servers.so) ---
# Защита: применяется, только если библиотека совпадает с исходной системной,
# и отключается сама, если Android трижды подряд не догрузился.
N=$(cat $D/bootcount 2>/dev/null || echo 0); N=$((N+1)); echo $N > $D/bootcount
SYS=/system/lib64/libandroid_servers.so
if [ -f $P/lib64/libandroid_servers.so ] && [ ! -f $D/no-spoof ]; then
  if [ "$N" -ge 3 ]; then
    touch $D/no-spoof
    echo "spoof отключён после $N неудачных загрузок" > $D/spoof.log
  elif [ "$(sha256sum $SYS | cut -d' ' -f1)" = "$(cat $P/lib64/orig.sha256)" ]; then
    mount -o bind $P/lib64/libandroid_servers.so $SYS && echo "spoof включён" > $D/spoof.log
  else
    echo "системная библиотека изменилась (обновление?) — spoof не применён" > $D/spoof.log
  fi
fi

# ADB по сети (порт 5555 пробрасывается на телефон-хозяин)
rp persist.adb.tcp.port 5555
rp service.adb.tcp.port 5555
exit 0
