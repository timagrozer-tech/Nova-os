package com.droidvm.app

import java.io.File

/** Сборка командной строки QEMU из конфигурации ВМ. */
object QemuCommand {

    class BuildError(msg: String) : Exception(msg)

    /** В строках опций QEMU запятая экранируется удвоением. */
    private fun esc(s: String) = s.replace(",", ",,")

    private fun fmt(path: String) = if (path.endsWith(".qcow2", true)) "qcow2" else "raw"

    fun build(env: QemuEnv, cfg: VmConfig, vmDir: File): List<String> {
        val a = mutableListOf<String>()
        a += env.binary(cfg.arch).absolutePath
        a += listOf("-L", env.dataDir.absolutePath)
        a += "-nodefaults"
        a += listOf("-name", cfg.name.replace(",", " "))
        a += listOf("-m", "${cfg.ramMb}")
        a += listOf("-smp", "${cfg.cpus}")
        a += listOf("-accel", "tcg,thread=${if (cfg.multiThread) "multi" else "single"},tb-size=${cfg.tbSizeMb}")

        if (cfg.isArm) {
            a += listOf("-M", "virt")
            // pauth-impdef заметно ускоряет эмуляцию ARMv8.3 PAuth
            a += listOf("-cpu", "max,pauth-impdef=on")
        } else {
            a += listOf("-M", cfg.machine)
            a += listOf("-cpu", "max")
        }

        // Графика
        when {
            cfg.isArm && cfg.gpu == "ramfb" -> a += listOf("-device", "ramfb")
            cfg.isArm -> a += listOf("-device", "virtio-gpu-pci")
            cfg.gpu == "virtio" -> a += listOf("-device", "virtio-vga")
            else -> a += listOf("-vga", "std")
        }

        // Ввод (абсолютный указатель — тап по экрану попадает туда, куда нажали)
        if (cfg.input == "virtio") {
            a += listOf("-device", "virtio-tablet-pci", "-device", "virtio-keyboard-pci")
        } else {
            a += listOf("-device", "qemu-xhci,id=xhci", "-device", "usb-tablet", "-device", "usb-kbd")
        }

        // Источник случайных чисел — ускоряет загрузку Android
        a += listOf("-device", "virtio-rng-pci")

        // Сеть (user-mode, без root)
        if (cfg.net != "none") {
            var nd = "user,id=net0"
            if (cfg.adbPort in 1..65535) nd += ",hostfwd=tcp:127.0.0.1:${cfg.adbPort}-:5555"
            a += listOf("-netdev", nd)
            a += listOf("-device", if (cfg.net == "e1000") "e1000,netdev=net0" else "virtio-net-pci,netdev=net0")
        }

        // Носители
        val isoSet = cfg.iso.isNotBlank()
        val isoFirst = isoSet && cfg.bootFromIso && cfg.bootMode != VmConfig.BOOT_KERNEL
        var nextIndex = 0
        if (isoSet) {
            check(cfg.iso, "ISO")
            val idx = if (isoFirst) 0 else 10
            a += listOf("-drive", "file=${esc(cfg.iso)},media=cdrom,if=none,id=cd0,readonly=on")
            if (cfg.isArm) {
                a += listOf("-device", "virtio-scsi-pci,id=scsi0")
                a += listOf("-device", "scsi-cd,drive=cd0,bus=scsi0.0,bootindex=$idx")
            } else {
                a += listOf("-device", "ide-cd,drive=cd0,bootindex=$idx")
            }
            if (isoFirst) nextIndex = 1
        }
        cfg.disks.filter { it.isNotBlank() }.forEachIndexed { i, d ->
            check(d, "Диск ${i + 1}")
            a += listOf("-drive", "file=${esc(d)},if=none,id=hd$i,format=${fmt(d)},cache=writeback,aio=threads")
            val boot = if (cfg.bootMode == VmConfig.BOOT_KERNEL) "" else ",bootindex=${nextIndex + 1 + i}"
            a += if (cfg.diskIface == "virtio" || cfg.isArm) listOf("-device", "virtio-blk-pci,drive=hd$i$boot")
            else listOf("-device", "ide-hd,drive=hd$i$boot")
        }

        // Загрузка
        when (cfg.bootMode) {
            VmConfig.BOOT_KERNEL -> {
                if (cfg.kernel.isBlank()) throw BuildError("Не выбрано ядро (kernel / Image)")
                check(cfg.kernel, "Ядро")
                a += listOf("-kernel", cfg.kernel)
                if (cfg.initrd.isNotBlank()) { check(cfg.initrd, "Ramdisk"); a += listOf("-initrd", cfg.initrd) }
                if (cfg.cmdline.isNotBlank()) a += listOf("-append", cfg.cmdline)
                if (cfg.isArm) uefiOrNothing(a, env, cfg, vmDir, required = false)
            }
            VmConfig.BOOT_UEFI -> uefiOrNothing(a, env, cfg, vmDir, required = true)
            else -> if (cfg.isArm) uefiOrNothing(a, env, cfg, vmDir, required = true) // у ARM нет BIOS
        }
        if (!cfg.isArm && cfg.bootMode != VmConfig.BOOT_KERNEL) a += listOf("-boot", "menu=on,splash-time=3000")

        if (cfg.snapshot) a += "-snapshot"
        a += listOf("-rtc", "base=localtime")
        a += listOf("-vnc", "unix:${env.vncSocket.absolutePath}")
        a += listOf("-monitor", "unix:${env.monitorSocket.absolutePath},server=on,wait=off")
        a += listOf("-serial", "file:${File(vmDir, "serial.log").absolutePath}")

        a += splitArgs(cfg.extraArgs)
        return a
    }

    private fun uefiOrNothing(a: MutableList<String>, env: QemuEnv, cfg: VmConfig, vmDir: File, required: Boolean) {
        if (!required) return
        val code = env.firmware(if (cfg.isArm) "edk2-aarch64-code.fd" else "edk2-x86_64-code.fd")
        val varsTemplate = env.firmware(if (cfg.isArm) "edk2-arm-vars.fd" else "edk2-i386-vars.fd")
        if (!code.exists()) throw BuildError("Нет прошивки UEFI ${code.name} в сборке")
        val vars = File(vmDir, "efivars.fd")
        // Размер банка переменных должен совпадать с прошивкой, иначе QEMU не запустится
        if (vars.exists() && vars.length() != code.length() && cfg.isArm) vars.delete()
        if (!vars.exists() && varsTemplate.exists()) varsTemplate.copyTo(vars)
        a += listOf("-drive", "if=pflash,format=raw,unit=0,readonly=on,file=${esc(code.absolutePath)}")
        if (vars.exists()) a += listOf("-drive", "if=pflash,format=raw,unit=1,file=${esc(vars.absolutePath)}")
    }

    private fun check(path: String, what: String) {
        if (!File(path).exists()) throw BuildError("$what: файл не найден — $path")
    }

    /** Разбивка строки аргументов с учётом кавычек. */
    fun splitArgs(s: String): List<String> {
        val out = mutableListOf<String>()
        val cur = StringBuilder()
        var quote: Char? = null
        var has = false
        for (ch in s) {
            when {
                quote != null && ch == quote -> quote = null
                quote != null -> cur.append(ch)
                ch == '"' || ch == '\'' -> { quote = ch; has = true }
                ch.isWhitespace() -> { if (has || cur.isNotEmpty()) out += cur.toString(); cur.clear(); has = false }
                else -> { cur.append(ch); has = true }
            }
        }
        if (has || cur.isNotEmpty()) out += cur.toString()
        return out
    }

    fun pretty(args: List<String>): String = args.joinToString(" \\\n  ") { arg ->
        if (arg.any { it.isWhitespace() || it == '\'' || it == '"' }) "'" + arg.replace("'", "'\\''") + "'" else arg
    }
}
