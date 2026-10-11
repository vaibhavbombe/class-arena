import { useEffect, useState } from 'react'

// Whether the app is currently dark: an explicit data-theme on <html>, or the device
// setting when the theme is "system". Updates when either changes.
function isDarkNow() {
  const chosen = document.documentElement.getAttribute('data-theme')
  if (chosen) return chosen === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function useDarkMode() {
  const [dark, setDark] = useState(isDarkNow)
  useEffect(() => {
    const update = () => setDark(isDarkNow())
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      media.removeEventListener('change', update)
      observer.disconnect()
    }
  }, [])
  return dark
}
