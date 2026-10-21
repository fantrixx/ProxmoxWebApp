package com.proxpanel.app

import android.content.Context
import com.proxpanel.app.data.ApiClient
import com.proxpanel.app.data.SessionStore

class AppContainer(context: Context) {
    val sessionStore = SessionStore(context.applicationContext)
    val api = ApiClient(sessionStore)
}
