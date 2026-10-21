package com.proxpanel.app.data

import kotlinx.serialization.Serializable

@Serializable
data class AuthUser(
    val username: String,
    val host: String,
    val authKind: String? = null,
)

@Serializable
data class ClusterResource(
    val id: String,
    val type: String,
    val node: String? = null,
    val vmid: Int? = null,
    val name: String? = null,
    val status: String? = null,
    val cpu: Double? = null,
    val maxcpu: Double? = null,
    val mem: Long? = null,
    val maxmem: Long? = null,
    val disk: Long? = null,
    val maxdisk: Long? = null,
    val uptime: Long? = null,
    val template: Int? = null,
    val ips: List<String>? = null,
    val lock: String? = null,
    val qmpstatus: String? = null,
)

@Serializable
data class ResourcesResponse(
    val resources: List<ClusterResource> = emptyList(),
    val version: ProxmoxVersion? = null,
)

@Serializable
data class ProxmoxVersion(
    val version: String? = null,
    val release: String? = null,
)

@Serializable
data class GuestStatus(
    val status: String,
    val name: String? = null,
    val vmid: Int? = null,
    val cpu: Double? = null,
    val cpus: Double? = null,
    val mem: Long? = null,
    val maxmem: Long? = null,
    val disk: Long? = null,
    val maxdisk: Long? = null,
    val uptime: Long? = null,
    val lock: String? = null,
    val qmpstatus: String? = null,
)

@Serializable
data class GuestDetail(
    val status: GuestStatus,
    val config: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap(),
    val ips: List<String> = emptyList(),
)

@Serializable
data class OkResponse(
    val ok: Boolean = true,
)

@Serializable
data class ErrorBody(
    val error: String? = null,
)

data class LoginPrefs(
    val panelBaseUrl: String = "",
    val proxmoxHost: String = "",
    val username: String = "",
    val realm: String = "pam",
    val verifyTls: Boolean = false,
)

data class GuestItem(
    val node: String,
    val type: String,
    val vmid: Int,
    val name: String,
    val status: String,
    val cpu: Double?,
    val mem: Long?,
    val maxmem: Long?,
    val disk: Long?,
    val maxdisk: Long?,
    val uptime: Long?,
    val ips: List<String>,
    val lock: String?,
) {
    val isRunning: Boolean
        get() = status.equals("running", ignoreCase = true)

    val kindLabel: String
        get() = if (type == "lxc") "CT" else "VM"
}

fun ClusterResource.toGuestOrNull(): GuestItem? {
    if (type != "lxc" && type != "qemu") return null
    if (template == 1) return null
    val node = node ?: return null
    val vmid = vmid ?: return null
    return GuestItem(
        node = node,
        type = type,
        vmid = vmid,
        name = name?.ifBlank { null } ?: "Guest $vmid",
        status = status ?: "unknown",
        cpu = cpu,
        mem = mem,
        maxmem = maxmem,
        disk = disk,
        maxdisk = maxdisk,
        uptime = uptime,
        ips = ips.orEmpty(),
        lock = lock,
    )
}
