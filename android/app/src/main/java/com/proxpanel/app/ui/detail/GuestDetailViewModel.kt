package com.proxpanel.app.ui.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.proxpanel.app.data.ApiClient
import com.proxpanel.app.data.ApiException
import com.proxpanel.app.data.GuestDetail
import com.proxpanel.app.data.GuestItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class PowerConfirm(
    val action: String,
    val title: String,
    val body: String,
    val confirm: String,
    val danger: Boolean = false,
)

data class DetailUiState(
    val guest: GuestItem,
    val detail: GuestDetail? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val confirm: PowerConfirm? = null,
)

class GuestDetailViewModel(
    private val api: ApiClient,
    guest: GuestItem,
) : ViewModel() {
    private val _state = MutableStateFlow(DetailUiState(guest = guest))
    val state: StateFlow<DetailUiState> = _state.asStateFlow()
    private var pollJob: Job? = null

    init {
        refresh()
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(5_000)
                refresh(silent = true)
            }
        }
    }

    fun refresh(silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) _state.update { it.copy(loading = it.detail == null, error = null) }
            val g = _state.value.guest
            try {
                val detail = api.guest(g.node, g.type, g.vmid)
                val updated = g.copy(
                    name = detail.status.name?.ifBlank { null } ?: g.name,
                    status = detail.status.status,
                    cpu = detail.status.cpu,
                    mem = detail.status.mem,
                    maxmem = detail.status.maxmem,
                    disk = detail.status.disk,
                    maxdisk = detail.status.maxdisk,
                    uptime = detail.status.uptime,
                    ips = detail.ips.ifEmpty { g.ips },
                    lock = detail.status.lock,
                )
                _state.update {
                    it.copy(guest = updated, detail = detail, loading = false, error = null)
                }
            } catch (e: Exception) {
                if (!silent) {
                    _state.update {
                        it.copy(loading = false, error = e.message ?: "Failed to load guest")
                    }
                }
            }
        }
    }

    fun requestAction(action: String) {
        val confirm = when (action) {
            "shutdown" -> PowerConfirm(
                action = action,
                title = "Shut down guest?",
                body = "An orderly shutdown will be requested. Unsaved data may be lost.",
                confirm = "Shut down",
            )
            "stop" -> PowerConfirm(
                action = action,
                title = "Force stop guest?",
                body = "Like pulling the power cord. Can cause data loss.",
                confirm = "Stop",
                danger = true,
            )
            "reboot" -> PowerConfirm(
                action = action,
                title = "Reboot guest?",
                body = "The guest will restart. Services will be interrupted briefly.",
                confirm = "Reboot",
            )
            else -> null
        }
        if (confirm != null) {
            _state.update { it.copy(confirm = confirm) }
        } else {
            runAction(action)
        }
    }

    fun dismissConfirm() = _state.update { it.copy(confirm = null) }

    fun confirmAction() {
        val action = _state.value.confirm?.action ?: return
        _state.update { it.copy(confirm = null) }
        runAction(action)
    }

    private fun runAction(action: String) {
        viewModelScope.launch {
            val g = _state.value.guest
            _state.update { it.copy(busy = true, error = null, message = null) }
            try {
                api.action(g.node, g.type, g.vmid, action)
                _state.update {
                    it.copy(busy = false, message = "${action.replaceFirstChar { c -> c.uppercase() }} requested")
                }
                delay(800)
                refresh(silent = true)
            } catch (e: ApiException) {
                _state.update { it.copy(busy = false, error = e.message) }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "Action failed") }
            }
        }
    }

    companion object {
        fun factory(api: ApiClient, guest: GuestItem) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                GuestDetailViewModel(api, guest) as T
        }
    }
}
