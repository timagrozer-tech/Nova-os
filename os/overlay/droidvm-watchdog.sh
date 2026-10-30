#!/system/bin/sh
# DroidVM OS — сторожевой таймер. Если Android не загрузился за 20 минут при включённой подмене подписи,
# отключаем её и перезапускаем системный сервер с оригинальной библиотекой.
D=/data/local/droidvm
SYS=/system/lib64/libandroid_servers.so
i=0
while [ $i -lt 120 ]; do
  [ "$(getprop sys.boot_completed)" = 1 ] && exit 0
  sleep 10; i=$((i+1))
done
if grep -q " $SYS " /proc/mounts; then
  echo "<2>droidvm-watchdog: загрузка не завершилась за 20 мин — отключаю spoof и перезапускаю zygote" > /dev/kmsg
  touch $D/no-spoof
  echo "отключён сторожевым таймером: Android не загрузился за 20 минут" > $D/spoof.log
  umount $SYS
  setprop ctl.restart zygote
fi
exit 0
