package com.proxpanel.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val ProxBg = Color(0xFF0B0D12)
val ProxSurface = Color(0xFF161B25)
val ProxSurface2 = Color(0xFF1C2330)
val ProxLine = Color(0xFF2A3344)
val ProxInk = Color(0xFFEEF3FB)
val ProxMuted = Color(0xFF8B97AB)
val ProxAccent = Color(0xFFFF7A1A)
val ProxAccent2 = Color(0xFFFF9A4D)
val ProxGood = Color(0xFF34D399)
val ProxWarn = Color(0xFFFBBF24)
val ProxBad = Color(0xFFF87171)

private val DarkColors = darkColorScheme(
    primary = ProxAccent,
    onPrimary = Color.Black,
    secondary = ProxAccent2,
    background = ProxBg,
    onBackground = ProxInk,
    surface = ProxSurface,
    onSurface = ProxInk,
    surfaceVariant = ProxSurface2,
    onSurfaceVariant = ProxMuted,
    outline = ProxLine,
    error = ProxBad,
)

private val LightColors = lightColorScheme(
    primary = ProxAccent,
    onPrimary = Color.Black,
    background = Color(0xFFF4F6FA),
    onBackground = Color(0xFF12151C),
    surface = Color.White,
    onSurface = Color(0xFF12151C),
    surfaceVariant = Color(0xFFE8ECF3),
    onSurfaceVariant = Color(0xFF5B6475),
    outline = Color(0xFFD0D6E1),
    error = Color(0xFFC62828),
)

private val ProxTypography = Typography(
    headlineLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 34.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

@Composable
fun ProxPanelTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme || isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        typography = ProxTypography,
        content = content,
    )
}
