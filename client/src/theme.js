// Light / dark / system theme. The choice is per device (localStorage); "system" follows the
// device setting. index.html applies the saved choice before the first paint, so there's no
// flash of the wrong theme; this module changes it afterwards.
const KEY = 'theme'
export const THEMES = ['system', 'light', 'dark']

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    return THEMES.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function setTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Storage blocked (e.g. private mode): the choice still applies until reload.
  }
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}
