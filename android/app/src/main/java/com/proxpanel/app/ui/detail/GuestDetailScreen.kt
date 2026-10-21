package com.proxpanel.app.ui.detail

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.proxpanel.app.ui.components.KindChip
import com.proxpanel.app.ui.components.MetricBar
import com.proxpanel.app.ui.components.SectionLabel
import com.proxpanel.app.ui.components.StatusDot
import com.proxpanel.app.ui.theme.ProxBad
import com.proxpanel.app.util.cpuPct
import com.proxpanel.app.util.formatBytes
import com.proxpanel.app.util.formatPct
import com.proxpanel.app.util.formatUptime
import com.proxpanel.app.util.usagePct

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuestDetailScreen(
    viewModel: GuestDetailViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(state.message, state.error) {
        state.message?.let { snackbar.showSnackbar(it) }
        state.error?.let { snackbar.showSnackbar(it) }
    }

    state.confirm?.let { confirm ->
        AlertDialog(
            onDismissRequest = viewModel::dismissConfirm,
            title = { Text(confirm.title) },
            text = { Text(confirm.body) },
            confirmButton = {
                TextButton(
                    onClick = viewModel::confirmAction,
                    colors = if (confirm.danger) {
                        ButtonDefaults.textButtonColors(contentColor = ProxBad)
                    } else {
                        ButtonDefaults.textButtonColors()
                    },
                ) { Text(confirm.confirm) }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissConfirm) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.guest.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusDot(running = state.guest.isRunning, locked = !state.guest.lock.isNullOrBlank())
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "${state.guest.status.replaceFirstChar { it.uppercase() }} · ${state.guest.node} · ${state.guest.vmid}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "Uptime ${formatUptime(state.guest.uptime)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                KindChip(state.guest.kindLabel)
            }

            Spacer(Modifier.height(18.dp))
            SectionLabel("Resources")
            Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface) {
                Column(Modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (state.loading && state.detail == null) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                    } else {
                        MetricBar("CPU", formatPct(state.guest.cpu), cpuPct(state.guest.cpu))
                        MetricBar(
                            "RAM",
                            "${formatBytes(state.guest.mem)} / ${formatBytes(state.guest.maxmem)}",
                            usagePct(state.guest.mem, state.guest.maxmem),
                        )
                        MetricBar(
                            "Disk",
                            "${formatBytes(state.guest.disk)} / ${formatBytes(state.guest.maxdisk)}",
                            usagePct(state.guest.disk, state.guest.maxdisk),
                        )
                    }
                }
            }

            Spacer(Modifier.height(18.dp))
            SectionLabel("Network")
            Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface) {
                Column(Modifier = Modifier.padding(12.dp)) {
                    val ips = state.guest.ips
                    if (ips.isEmpty()) {
                        Text(
                            "No IP detected yet",
                            modifier = Modifier.padding(8.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        ips.forEach { ip ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp, horizontal = 4.dp),
                            ) {
                                Text(ip, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                                IconButton(onClick = { copyText(context, ip) }) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy IP")
                                }
                                IconButton(onClick = { openHttp(context, ip) }) {
                                    Icon(Icons.Default.OpenInBrowser, contentDescription = "Open")
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(22.dp))
            SectionLabel("Power")
            val running = state.guest.isRunning
            val enabled = !state.busy
            if (!running) {
                Button(
                    onClick = { viewModel.requestAction("start") },
                    enabled = enabled,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) { Text("Start") }
            } else {
                FilledTonalButton(
                    onClick = { viewModel.requestAction("shutdown") },
                    enabled = enabled,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) { Text("Shut down") }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(
                    onClick = { viewModel.requestAction("reboot") },
                    enabled = enabled,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) { Text("Reboot") }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(
                    onClick = { viewModel.requestAction("stop") },
                    enabled = enabled,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = ProxBad),
                ) { Text("Force stop") }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

private fun copyText(context: Context, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("ip", text))
}

private fun openHttp(context: Context, ip: String) {
    val url = if (ip.startsWith("http")) ip else "http://$ip"
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
}
