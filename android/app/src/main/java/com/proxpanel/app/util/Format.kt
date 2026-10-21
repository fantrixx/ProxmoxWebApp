package com.proxpanel.app.util

import kotlin.math.roundToInt

fun formatBytes(n: Long?): String {
    if (n == null) return "—"
    val abs = kotlin.math.abs(n.toDouble())
    val units = arrayOf("B", "KiB", "MiB", "GiB", "TiB")
    var v = abs
    var i = 0
    while (v >= 1024 && i < units.lastIndex) {
        v /= 1024
        i++
    }
    val digits = when {
        i == 0 -> 0
        v >= 10 -> 1
        else -> 2
    }
    return "%.${digits}f %s".format(v, units[i])
}

fun formatPct(fraction: Double?): String {
    if (fraction == null) return "—"
    return "%.1f %%".format(fraction * 100)
}

fun cpuPct(cpu: Double?): Float {
    if (cpu == null) return 0f
    return (cpu * 100.0).coerceIn(0.0, 100.0).toFloat()
}

fun usagePct(used: Long?, max: Long?): Float {
    if (used == null || max == null || max <= 0) return 0f
    return ((used.toDouble() / max) * 100.0).coerceIn(0.0, 100.0).toFloat()
}

fun formatUptime(seconds: Long?): String {
    if (seconds == null || seconds <= 0) return "—"
    val d = seconds / 86400
    val h = (seconds % 86400) / 3600
    val m = (seconds % 3600) / 60
    return when {
        d > 0 -> "${d}d ${h}h"
        h > 0 -> "${h}h ${m}m"
        else -> "${m}m"
    }
}

fun normalizeBaseUrl(raw: String): String {
    var s = raw.trim()
    if (s.isEmpty()) return s
    if (!s.startsWith("http://") && !s.startsWith("https://")) {
        s = "http://$s"
    }
    return s.trimEnd('/')
}
