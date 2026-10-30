package com.droidvm.app

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Описание одной виртуальной машины. Хранится как JSON в filesDir/vms/<id>/config.json.
 */
data class VmConfig(
    var id: String = UUID.randomUUID().toString().substring(0, 8),
    var name: String = "Новая ВМ",
    /** "x86_64" или "aarch64" */
    var arch: String = ARCH_X86,
    var ramMb: Int = 2048,
    var cpus: Int = 2,
    /** "bios" (только x86), "uefi", "kernel" */
    var bootMode: String = BOOT_BIOS,
    /** x86: "q35" или "pc" */
    var machine: String = "q35",
    var iso: String = "",
    var bootFromIso: Boolean = true,
    var disks: MutableList<String> = mutableListOf("", "", ""),
    /** "virtio" или "sata" */
    var diskIface: String = "sata",
    var kernel: String = "",
    var initrd: String = "",
    var cmdline: String = "",
    /** x86: "std", "virtio"; arm: "virtio", "ramfb" */
    var gpu: String = "std",
    /** "usb" или "virtio" */
    var input: String = "usb",
    /** "virtio", "e1000", "none" */
    var net: String = "virtio",
    /** Порт на телефоне, который пробрасывается на adb (5555) гостя. 0 = выкл. */
    var adbPort: Int = 5555,
    var snapshot: Boolean = false,
    var tbSizeMb: Int = 256,
    var multiThread: Boolean = true,
    var extraArgs: String = "",
    /** Разрешение экрана гостя "ШxВ" (virtio-gpu); пусто — по умолчанию */
    var resolution: String = "720x1280",
    /** Плотность экрана (dpi) для гостя DroidVM OS, 0 — не задавать */
    var density: Int = 320,
) {
    val isArm get() = arch == ARCH_ARM

    fun summary(): String {
        val boot = when (bootMode) {
            BOOT_KERNEL -> "ядро"
            BOOT_UEFI -> "UEFI"
            else -> "BIOS"
        }
        val res = if (resolution.isNotBlank()) " · ${resolution.replace('x', '×')}" else ""
        return "${if (isArm) "ARM64" else "x86_64"} · ${ramMb} МБ · ${cpus} ЦП · $boot$res"
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id); put("name", name); put("arch", arch)
        put("ramMb", ramMb); put("cpus", cpus); put("bootMode", bootMode)
        put("machine", machine); put("iso", iso); put("bootFromIso", bootFromIso)
        put("disks", JSONArray(disks)); put("diskIface", diskIface)
        put("kernel", kernel); put("initrd", initrd); put("cmdline", cmdline)
        put("gpu", gpu); put("input", input); put("net", net); put("adbPort", adbPort)
        put("snapshot", snapshot); put("tbSizeMb", tbSizeMb); put("multiThread", multiThread)
        put("extraArgs", extraArgs)
        put("resolution", resolution); put("density", density)
    }

    companion object {
        const val ARCH_X86 = "x86_64"
        const val ARCH_ARM = "aarch64"
        const val BOOT_BIOS = "bios"
        const val BOOT_UEFI = "uefi"
        const val BOOT_KERNEL = "kernel"

        fun fromJson(o: JSONObject): VmConfig {
            val d = VmConfig()
            val disks = mutableListOf<String>()
            o.optJSONArray("disks")?.let { arr -> for (i in 0 until arr.length()) disks += arr.optString(i) }
            while (disks.size < 3) disks += ""
            return VmConfig(
                id = o.optString("id", d.id),
                name = o.optString("name", d.name),
                arch = o.optString("arch", d.arch),
                ramMb = o.optInt("ramMb", d.ramMb),
                cpus = o.optInt("cpus", d.cpus),
                bootMode = o.optString("bootMode", d.bootMode),
                machine = o.optString("machine", d.machine),
                iso = o.optString("iso", ""),
                bootFromIso = o.optBoolean("bootFromIso", true),
                disks = disks,
                diskIface = o.optString("diskIface", d.diskIface),
                kernel = o.optString("kernel", ""),
                initrd = o.optString("initrd", ""),
                cmdline = o.optString("cmdline", ""),
                gpu = o.optString("gpu", d.gpu),
                input = o.optString("input", d.input),
                net = o.optString("net", d.net),
                adbPort = o.optInt("adbPort", d.adbPort),
                snapshot = o.optBoolean("snapshot", false),
                tbSizeMb = o.optInt("tbSizeMb", d.tbSizeMb),
                multiThread = o.optBoolean("multiThread", true),
                extraArgs = o.optString("extraArgs", ""),
                resolution = o.optString("resolution", ""),
                density = o.optInt("density", 0),
            )
        }

        /** Готовые шаблоны для типичных кастомных сборок. */
        fun templates(cores: Int): List<Pair<String, VmConfig>> {
            val c = cores.coerceIn(1, 4)
            return listOf(
                "Android-x86 / BlissOS / PrimeOS (ISO, x86_64)" to VmConfig(
                    name = "Android x86", arch = ARCH_X86, ramMb = 3072, cpus = c,
                    bootMode = BOOT_BIOS, machine = "q35", diskIface = "sata",
                    gpu = "std", input = "usb", net = "virtio", resolution = "", density = 0,
                ),
                "x86_64: готовый образ диска (.img/.qcow2)" to VmConfig(
                    name = "x86 образ", arch = ARCH_X86, ramMb = 3072, cpus = c,
                    bootMode = BOOT_BIOS, bootFromIso = false, machine = "q35", diskIface = "sata",
                    gpu = "std", input = "usb", net = "virtio", resolution = "", density = 0,
                ),
                "ARM64: ядро + ramdisk + образы (AOSP/GSI/своя сборка)" to VmConfig(
                    name = "AOSP arm64", arch = ARCH_ARM, ramMb = 3072, cpus = c,
                    bootMode = BOOT_KERNEL, diskIface = "virtio", gpu = "virtio", input = "virtio",
                    net = "virtio",
                    cmdline = "console=ttyAMA0 androidboot.console=ttyAMA0 printk.devkmsg=on androidboot.selinux=permissive",
                ),
                "ARM64: загрузочный образ диска/ISO через UEFI" to VmConfig(
                    name = "ARM64 UEFI", arch = ARCH_ARM, ramMb = 3072, cpus = c,
                    bootMode = BOOT_UEFI, diskIface = "virtio", gpu = "virtio", input = "usb",
                    net = "virtio",
                ),
                "Пустая конфигурация" to VmConfig(cpus = c, resolution = "", density = 0),
            )
        }
    }
}
