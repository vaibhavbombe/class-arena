// Applies the saved theme before the first paint (no flash). See src/theme.js.
// A separate file rather than an inline <script>, so the Content-Security-Policy needs no
// 'unsafe-inline' or hash for scripts.
try {
  var theme = localStorage.getItem('theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme)
} catch (e) {}
