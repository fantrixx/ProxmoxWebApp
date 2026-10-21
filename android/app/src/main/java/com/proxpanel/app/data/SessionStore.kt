package com.proxpanel.app.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "proxpanel")

class SessionStore(private val context: Context) {
    private object Keys {
        val panelBaseUrl = stringPreferencesKey("panel_base_url")
        val proxmoxHost = stringPreferencesKey("proxmox_host")
        val username = stringPreferencesKey("username")
        val realm = stringPreferencesKey("realm")
        val verifyTls = booleanPreferencesKey("verify_tls")
        val sessionCookie = stringPreferencesKey("session_cookie")
    }

    val loginPrefs: Flow<LoginPrefs> = context.dataStore.data.map { prefs ->
        LoginPrefs(
            panelBaseUrl = prefs[Keys.panelBaseUrl].orEmpty(),
            proxmoxHost = prefs[Keys.proxmoxHost].orEmpty(),
            username = prefs[Keys.username].orEmpty(),
            realm = prefs[Keys.realm] ?: "pam",
            verifyTls = prefs[Keys.verifyTls] ?: false,
        )
    }

    val sessionCookie: Flow<String?> = context.dataStore.data.map { it[Keys.sessionCookie] }

    suspend fun saveLoginPrefs(prefs: LoginPrefs) {
        context.dataStore.edit {
            it[Keys.panelBaseUrl] = prefs.panelBaseUrl.trim().trimEnd('/')
            it[Keys.proxmoxHost] = prefs.proxmoxHost.trim()
            it[Keys.username] = prefs.username.trim()
            it[Keys.realm] = prefs.realm
            it[Keys.verifyTls] = prefs.verifyTls
        }
    }

    suspend fun saveSessionCookie(cookie: String?) {
        context.dataStore.edit {
            if (cookie.isNullOrBlank()) it.remove(Keys.sessionCookie)
            else it[Keys.sessionCookie] = cookie
        }
    }

    suspend fun clearSession() {
        context.dataStore.edit { it.remove(Keys.sessionCookie) }
    }
}
