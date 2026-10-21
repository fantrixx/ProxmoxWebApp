package com.proxpanel.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier.modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.proxpanel.app.data.GuestItem
import com.proxpanel.app.ui.detail.GuestDetailScreen
import com.proxpanel.app.ui.detail.GuestDetailViewModel
import com.proxpanel.app.ui.guests.GuestsScreen
import com.proxpanel.app.ui.guests.GuestsViewModel
import com.proxpanel.app.ui.login.LoginScreen
import com.proxpanel.app.ui.login.LoginViewModel
import com.proxpanel.app.ui.theme.ProxPanelTheme
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as ProxPanelApp
        setContent {
            ProxPanelTheme(darkTheme = true) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ProxPanelNav(app.container)
                }
            }
        }
    }
}

@Composable
private fun ProxPanelNav(container: AppContainer) {
    val nav = rememberNavController()

    NavHost(navController = nav, startDestination = "login") {
        composable("login") {
            val vm: LoginViewModel = viewModel(
                factory = LoginViewModel.factory(container.api, container.sessionStore),
            )
            LoginScreen(
                viewModel = vm,
                onSignedIn = {
                    nav.navigate("guests") {
                        popUpTo("login") { inclusive = true }
                    }
                },
            )
        }

        composable("guests") {
            val vm: GuestsViewModel = viewModel(factory = GuestsViewModel.factory(container.api))
            GuestsScreen(
                viewModel = vm,
                onOpenGuest = { guest ->
                    nav.navigate(
                        "guest/${guest.type}/${enc(guest.node)}/${guest.vmid}/${enc(guest.name)}/${enc(guest.status)}",
                    )
                },
                onLogout = {
                    nav.navigate("login") {
                        popUpTo("guests") { inclusive = true }
                    }
                },
            )
        }

        composable(
            route = "guest/{type}/{node}/{vmid}/{name}/{status}",
            arguments = listOf(
                navArgument("type") { type = NavType.StringType },
                navArgument("node") { type = NavType.StringType },
                navArgument("vmid") { type = NavType.IntType },
                navArgument("name") { type = NavType.StringType },
                navArgument("status") { type = NavType.StringType },
            ),
        ) { entry ->
            val guest = remember(entry.arguments) {
                GuestItem(
                    node = dec(entry.arguments!!.getString("node")!!),
                    type = entry.arguments!!.getString("type")!!,
                    vmid = entry.arguments!!.getInt("vmid"),
                    name = dec(entry.arguments!!.getString("name")!!),
                    status = dec(entry.arguments!!.getString("status")!!),
                    cpu = null,
                    mem = null,
                    maxmem = null,
                    disk = null,
                    maxdisk = null,
                    uptime = null,
                    ips = emptyList(),
                    lock = null,
                )
            }
            val vm: GuestDetailViewModel = viewModel(
                factory = GuestDetailViewModel.factory(container.api, guest),
            )
            GuestDetailScreen(viewModel = vm, onBack = { nav.popBackStack() })
        }
    }
}

private fun enc(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.toString())

private fun dec(value: String): String =
    URLDecoder.decode(value, StandardCharsets.UTF_8.toString())
