package com.proxpanel.app.ui.guests

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.proxpanel.app.data.ApiClient
import com.proxpanel.app.data.ApiException
import com.proxpanel.app.data.AuthUser
import com.proxpanel.app.data.GuestItem
import com.proxpanel.app.data.toGuestOrNull
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class GuestFilter { All, Running, Stopped, Ct, Vm }

data class GuestsUiState(
    val user: AuthUser? = null,
    val guests: List<GuestItem> = emptyList(),
    val filter: GuestFilter = GuestFilter.All,
    val query: String = "",
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val actionMessage: String? = null,
)

class GuestsViewModel(
    private val api: ApiClient,
) : ViewModel() {
    private val _state = MutableStateFlow(GuestsUiState())
    val state: StateFlow<GuestsUiState> = _state.asStateFlow()
    private var pollJob: Job? = null

    init {
        refresh(initial = true)
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(8_000)
                refresh(silent = true)
            }
        }
    }

    fun setFilter(filter: GuestFilter) = _state.update { it.copy(filter = filter) }
    fun setQuery(query: String) = _state.update { it.copy(query = query) }
    fun clearMessage() = _state.update { it.copy(actionMessage = null, error = null) }

    fun refresh(initial: Boolean = false, silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _state.update {
                    it.copy(
                        loading = initial && it.guests.isEmpty(),
                        refreshing = !initial,
                        error = null,
                    )
                }
            }
            try {
                val me = runCatching { api.me() }.getOrNull()
                val res = api.resources()
                val guests = res.resources.mapNotNull { it.toGuestOrNull() }
                    .sortedWith(compareByDescending<GuestItem> { it.isRunning }.thenBy { it.name.lowercase() })
                _state.update {
                    it.copy(
                        user = me ?: it.user,
                        guests = guests,
                        loading = false,
                        refreshing = false,
                        error = null,
                    )
                }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = if (silent) it.error else e.message,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = if (silent) it.error else (e.message ?: "Failed to load"),
                    )
                }
            }
        }
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            runCatching { api.logout() }
            onDone()
        }
    }

    fun filtered(): List<GuestItem> {
        val s = _state.value
        val q = s.query.trim().lowercase()
        return s.guests.filter { g ->
            when (s.filter) {
                GuestFilter.All -> true
                GuestFilter.Running -> g.isRunning
                GuestFilter.Stopped -> !g.isRunning
                GuestFilter.Ct -> g.type == "lxc"
                GuestFilter.Vm -> g.type == "qemu"
            } && (
                q.isEmpty() ||
                    g.name.lowercase().contains(q) ||
                    g.vmid.toString().contains(q) ||
                    g.node.lowercase().contains(q) ||
                    g.ips.any { it.contains(q) }
                )
        }
    }

    companion object {
        fun factory(api: ApiClient) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = GuestsViewModel(api) as T
        }
    }
}
