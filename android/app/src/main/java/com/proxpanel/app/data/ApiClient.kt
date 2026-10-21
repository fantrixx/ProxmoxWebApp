package com.proxpanel.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class ApiException(val status: Int, message: String) : Exception(message)

class ApiClient(
    private val sessionStore: SessionStore,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
    }

    private val cookieJar = object : CookieJar {
        private val store = mutableMapOf<String, MutableList<Cookie>>()

        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            val existing = store.getOrPut(url.host) { mutableListOf() }
            cookies.forEach { cookie ->
                existing.removeAll { it.name == cookie.name }
                existing += cookie
            }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> = store[url.host].orEmpty()

        fun clear() = store.clear()

        fun seed(url: HttpUrl, cookieHeader: String?) {
            if (cookieHeader.isNullOrBlank()) return
            val first = cookieHeader.split(';').firstOrNull() ?: return
            val parts = first.split('=', limit = 2)
            if (parts.size != 2) return
            val cookie = Cookie.Builder()
                .name(parts[0].trim())
                .value(parts[1].trim())
                .domain(url.host)
                .path("/")
                .build()
            store[url.host] = mutableListOf(cookie)
        }

        fun snapshot(url: HttpUrl): String? {
            val cookies = store[url.host].orEmpty()
            if (cookies.isEmpty()) return null
            return cookies.joinToString("; ") { "${it.name}=${it.value}" }
        }
    }

    @Volatile
    private var baseUrl: String = ""

    @Volatile
    private var client: OkHttpClient = buildClient(verifyTls = false)

    fun configure(baseUrl: String, verifyTls: Boolean, persistedCookie: String? = null) {
        this.baseUrl = baseUrl.trim().trimEnd('/')
        client = buildClient(verifyTls)
        cookieJar.clear()
        val url = this.baseUrl.toHttpUrlOrNull()
        if (!persistedCookie.isNullOrBlank() && url != null) {
            cookieJar.seed(url, persistedCookie)
        }
    }

    fun clearCookies() = cookieJar.clear()

    private fun buildClient(verifyTls: Boolean): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .followRedirects(false)

        if (!verifyTls) {
            val trustAll = object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
                override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
                override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
            }
            val ssl = SSLContext.getInstance("TLS")
            ssl.init(null, arrayOf<TrustManager>(trustAll), SecureRandom())
            builder.sslSocketFactory(ssl.socketFactory, trustAll)
            builder.hostnameVerifier { _, _ -> true }
        }
        return builder.build()
    }

    suspend fun login(
        panelBaseUrl: String,
        proxmoxHost: String,
        username: String,
        password: String,
        realm: String,
        verifyTls: Boolean,
        useEnvToken: Boolean = false,
    ): AuthUser = withContext(Dispatchers.IO) {
        configure(panelBaseUrl, verifyTls)
        val body = mapOf(
            "host" to proxmoxHost,
            "username" to username,
            "password" to password,
            "realm" to realm,
            "rejectUnauthorized" to verifyTls,
            "useEnvToken" to useEnvToken,
        )
        val user = request<AuthUser>("POST", "/api/auth/login", body)
        baseUrl.toHttpUrlOrNull()?.let { url ->
            sessionStore.saveSessionCookie(cookieJar.snapshot(url))
        }
        user
    }

    suspend fun me(): AuthUser = withContext(Dispatchers.IO) { request("GET", "/api/auth/me") }

    suspend fun logout() = withContext(Dispatchers.IO) {
        runCatching { request<OkResponse>("POST", "/api/auth/logout") }
        clearCookies()
        sessionStore.clearSession()
    }

    suspend fun resources(): ResourcesResponse =
        withContext(Dispatchers.IO) { request("GET", "/api/resources") }

    suspend fun guest(node: String, type: String, vmid: Int): GuestDetail =
        withContext(Dispatchers.IO) {
            request(
                "GET",
                "/api/guests/${enc(node)}/${enc(type)}/${enc(vmid.toString())}",
            )
        }

    suspend fun action(node: String, type: String, vmid: Int, action: String): OkResponse =
        withContext(Dispatchers.IO) {
            request(
                "POST",
                "/api/guests/${enc(node)}/${enc(type)}/${enc(vmid.toString())}/status/${enc(action)}",
            )
        }

    private inline fun <reified T> request(
        method: String,
        path: String,
        body: Map<String, Any?>? = null,
    ): T {
        if (baseUrl.isBlank()) throw ApiException(0, "ProxPanel URL is not set.")
        val media = "application/json; charset=utf-8".toMediaType()
        val actualBody = body?.let { map ->
            buildJsonObject {
                map.forEach { (k, v) ->
                    when (v) {
                        null -> put(k, JsonNull)
                        is Boolean -> put(k, JsonPrimitive(v))
                        is Number -> put(k, JsonPrimitive(v))
                        else -> put(k, JsonPrimitive(v.toString()))
                    }
                }
            }.toString().toRequestBody(media)
        }

        val request = Request.Builder()
            .url("$baseUrl$path")
            .method(
                method,
                when {
                    method == "GET" || method == "HEAD" -> null
                    actualBody != null -> actualBody
                    else -> ByteArray(0).toRequestBody(null)
                },
            )
            .header("Accept", "application/json")
            .apply { if (actualBody != null) header("Content-Type", "application/json") }
            .build()

        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val err = runCatching { json.decodeFromString<ErrorBody>(text).error }.getOrNull()
                throw ApiException(response.code, err ?: "HTTP ${response.code}")
            }
            return json.decodeFromString(text)
        }
    }

    private fun enc(value: String): String =
        java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")
}
