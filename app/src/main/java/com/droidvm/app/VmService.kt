package com.droidvm.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/** Foreground-сервис: держит процесс приложения (и QEMU) живым, пока работает ВМ. */
class VmService : Service(), VmRunner.Listener {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        VmRunner.addListener(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_POWER -> VmRunner.powerDown(this)
            ACTION_KILL -> VmRunner.kill(this)
        }
        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(1, n)
        }
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DroidVM:vm").apply {
                setReferenceCounted(false); acquire()
            }
        }
        if (!VmRunner.isActive) stopSelf()
        return START_NOT_STICKY
    }

    override fun onStateChanged(state: VmRunner.State) {
        if (state == VmRunner.State.IDLE) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    override fun onDestroy() {
        VmRunner.removeListener(this)
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Работающая ВМ", NotificationManager.IMPORTANCE_LOW))
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = PendingIntent.getActivity(this, 0, Intent(this, ScreenActivity::class.java), flags)
        val power = PendingIntent.getService(this, 1, Intent(this, VmService::class.java).setAction(ACTION_POWER), flags)
        val kill = PendingIntent.getService(this, 2, Intent(this, VmService::class.java).setAction(ACTION_KILL), flags)
        return Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("ВМ работает: ${VmRunner.current?.name ?: ""}")
            .setContentText("Нажмите, чтобы открыть экран")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Выключить", power).build())
            .addAction(Notification.Action.Builder(null, "Остановить", kill).build())
            .build()
    }

    companion object {
        const val CHANNEL = "vm"
        const val ACTION_POWER = "com.droidvm.app.POWER"
        const val ACTION_KILL = "com.droidvm.app.KILL"
    }
}
