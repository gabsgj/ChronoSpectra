import { useEffect, useState } from 'react'

import type { ThemeMode } from '../types'

const THEME_STORAGE_KEY = 'chronospectra-theme'
const LEGACY_THEME_STORAGE_KEY = 'finspectra-theme'
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

const getSystemTheme = (): ThemeMode => {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light'
}

const getInitialTheme = (): ThemeMode => {
  const storedTheme =
    localStorage.getItem(THEME_STORAGE_KEY) ??
    localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }
  return 'light'
}

export const useTheme = () => {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY)
    const handleChange = () => {
      if (
        localStorage.getItem(THEME_STORAGE_KEY) === null &&
        localStorage.getItem(LEGACY_THEME_STORAGE_KEY) === null
      ) {
        setTheme(getSystemTheme())
      }
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return {
    theme,
    toggle: () => setTheme((currentTheme) => (
      currentTheme === 'dark' ? 'light' : 'dark'
    )),
  }
}
