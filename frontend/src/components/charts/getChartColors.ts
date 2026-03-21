import type { ThemeMode } from '../../types'

export const getChartColors = (theme: ThemeMode) => {
  if (theme === 'light') {
    return {
      grid: 'rgba(15, 17, 23, 0.1)',
      axis: 'rgba(90, 96, 114, 0.88)',
      surface: 'rgba(255, 255, 255, 0.9)',
      tealLine: '#00a885',
      tealFill: 'rgba(0, 168, 133, 0.14)',
      amberLine: '#d4860a',
      amberFill: 'rgba(212, 134, 10, 0.16)',
      bar: 'rgba(0, 168, 133, 0.78)',
      barAlt: 'rgba(212, 134, 10, 0.72)',
    }
  }

  return {
    grid: 'rgba(255, 255, 255, 0.1)',
    axis: 'rgba(139, 144, 167, 0.9)',
    surface: 'rgba(30, 34, 53, 0.88)',
    tealLine: '#00d4aa',
    tealFill: 'rgba(0, 212, 170, 0.18)',
    amberLine: '#f5a623',
    amberFill: 'rgba(245, 166, 35, 0.2)',
    bar: 'rgba(0, 212, 170, 0.8)',
    barAlt: 'rgba(245, 166, 35, 0.78)',
  }
}
