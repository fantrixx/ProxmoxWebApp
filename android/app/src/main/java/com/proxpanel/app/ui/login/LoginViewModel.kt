package com.proxpanel.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.proxpanel.app.data.ApiClient
import com.proxpanel.app.data.ApiException
import com.proxpanel.app.data.LoginPrefs
import com.proxpanel.app.data.SessionStore
import com.proxpanel.app.util.normalizeBaseUrl
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val panelBaseUrl: String = "",
    val proxmoxHost: String = "",
    val username: String = "",
    val password: String = "",
    val realm: String = "pam",
    val verifyTls: Boolean = false,
    val connectionOpen: Boolean = true,
    val pending: Boolean = false,
    val error: String? = null,
    val signedIn: Boolean = false,
    val checkingSession: Boolean = true,
)

class LoginViewModel(
    private val api: ApiClient,
    private val sessionStore: SessionStore,
) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val prefs = sessionStore.loginPrefs.first()
            val cookie = sessionStore.sessionCookie.first()
            _state.update {
                it.copy(
                    panelBaseUrl = prefs.panelBaseUrl,
                    proxmoxHost = prefs.proxmoxHost,
                    username = prefs.username,
                    realm = prefs.realm,
                    verifyTls = prefs.verifyTls,
                    connectionOpen = prefs.panelBaseUrl.isBlank() || prefs.proxmoxHost.isBlank(),
                )
            }
            if (prefs.panelBaseUrl.isNotBlank() && !cookie.isNullOrBlank()) {
                api.configure(prefs.panelBaseUrl, prefs.verifyTls, cookie)
                runCatching { api.me() }
                    .onSuccess { _state.update { s -> s.copy(signedIn = true, checkingSession = false) } }
                    .onFailure {
                        sessionStore.clearSession()
                        _state.update { s -> s.copy(checkingSession = false) }
                    }
            } else {
                _state.update { it.copy(checkingSession = false) }
            }
        }
    }

    fun update(transform: (LoginUiState) -> LoginUiState) {
        _state.update(transform)
    }

    fun signIn() {
        val s = _state.value
        val panel = normalizeBaseUrl(s.panelBaseUrl)
        if (panel.isBlank() || s.proxmoxHost.isBlank() || s.username.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Panel URL, Proxmox server, username, and password are required.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(pending = true, error = null) }
            try {
                api.login(
                    panelBaseUrl = panel,
                    proxmoxHost = s.proxmoxHost.trim(),
                    username = s.username.trim(),
                    password = s.password,
                    realm = s.realm,
                    verifyTls = s.verifyTls,
                )
                sessionStore.saveLoginPrefs(
                    LoginPrefs(
                        panelBaseUrl = panel,
                        proxmoxHost = s.proxmoxHost.trim(),
                        username = s.username.trim(),
                        realm = s.realm,
                        verifyTls = s.verifyTls,
                    ),
                )
                _state.update { it.copy(pending = false, signedIn = true, password = "") }
            } catch (e: ApiException) {
                _state.update { it.copy(pending = false, error = e.message) }
            } catch (e: Exception) {
                _state.update { it.copy(pending = false, error = e.message ?: "Sign-in failed") }
            }
        }
    }

    companion object {
        fun factory(api: ApiClient, store: SessionStore) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                LoginViewModel(api, store) as T
        }
    }
}
