#!/system/bin/sh
# DroidVM OS — настройка после загрузки. При первом запуске применяет настройки и ставит приложения.
MT="$1"
D=/data/adb/droidvm
LOG=$D/boot.log
mkdir -p $D
exec >>$LOG 2>&1
echo "=== $(date) boot_completed"

# Android загрузился — сбросить счётчик неудачных загрузок
echo 0 > $D/bootcount

# дождаться готовности менеджера пакетов
for i in $(seq 1 60); do pm path android >/dev/null 2>&1 && break; sleep 2; done

# Плотность экрана под разрешение гостя (DroidVM задаёт его, например 720x1280 = 9:16):
# ширина ~360dp, как у обычного телефона. Применяется заново, только если разрешение сменилось.
SIZE=$(wm size 2>/dev/null | sed -n 's/^Physical size: //p')
if [ -n "$SIZE" ] && [ "$SIZE" != "$(cat $D/size 2>/dev/null)" ]; then
  W=${SIZE%x*}; H=${SIZE#*x}; S=$W; [ "$H" -lt "$S" ] && S=$H
  DPI=$(( (S * 100 / 225 + 10) / 20 * 20 ))
  [ "$DPI" -lt 160 ] && DPI=160
  wm density $DPI && echo "$SIZE" > $D/size && echo "разрешение $SIZE → плотность $DPI dpi"
fi

if [ ! -f $D/.configured ]; then
  echo "первый запуск: применяю настройки"
  settings put global device_provisioned 1
  settings put secure user_setup_complete 1
  pm disable-user --user 0 org.lineageos.setupwizard 2>/dev/null
  pm disable-user --user 0 com.android.provision 2>/dev/null

  # Быстрее в эмуляции: анимации вдвое короче
  settings put global window_animation_scale 0.5
  settings put global transition_animation_scale 0.5
  settings put global animator_duration_scale 0.5
  # Экран не гаснет 30 минут, тёмная тема, 24 часа
  settings put system screen_off_timeout 1800000
  settings put global stay_on_while_plugged_in 7
  cmd uimode night yes
  settings put system time_12_24 24
  # Для разработчика: режим разработчика, отладка по USB/сети
  settings put global development_settings_enabled 1
  settings put global adb_enabled 1
  settings put global package_verifier_enable 0
  settings put global verifier_verify_adb_installs 0
  # Экранная клавиатура показывается и при подключённой физической (клавиатура DroidVM)
  settings put secure show_ime_with_hard_keyboard 1

  # Root для `adb shell` без запроса подтверждения (uid 2000 = shell)
  "$MT/magisk" --sqlite "REPLACE INTO policies (uid,policy,until,logging,notification) VALUES(2000,2,0,1,0)"

  # Предустановленные приложения (раздел droidvm и boot-образ)
  mkdir -p /data/local/tmp/droidvm
  for apk in /mnt/droidvm/apps/*.apk "$MT"/droidvm-app-*.apk; do
    [ -f "$apk" ] || continue
    cp "$apk" /data/local/tmp/droidvm/a.apk
    chmod 644 /data/local/tmp/droidvm/a.apk
    echo "установка $(basename $apk): $(pm install -r -g /data/local/tmp/droidvm/a.apk 2>&1)"
  done
  rm -rf /data/local/tmp/droidvm

  # microG: не усыплять в фоне (нужно для push-уведомлений)
  cmd deviceidle whitelist +com.google.android.gms >/dev/null 2>&1
  cmd deviceidle whitelist +com.android.vending >/dev/null 2>&1

  touch $D/.configured
  am start -a android.intent.action.MAIN -c android.intent.category.HOME >/dev/null 2>&1
  echo "первый запуск: готово"
fi
exit 0
