export type ExportRow = Record<string, string | number | boolean | null | undefined>

const triggerDownload = (href: string, filename: string) => {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

const toCsvValue = (value: ExportRow[string]) => {
  if (value === null || value === undefined) {
    return ''
  }

  const serialized = String(value)
  if (/[",\n]/.test(serialized)) {
    return `"${serialized.replaceAll('"', '""')}"`
  }
  return serialized
}

export const downloadRowsAsCsv = (rows: ExportRow[], filename: string) => {
  if (rows.length === 0) {
    return
  }

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(',')),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
}

export const downloadJson = (payload: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
}

const resolveSvgDimensions = (svg: SVGSVGElement) => {
  const viewBox = svg.viewBox.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return {
      height: viewBox.height,
      width: viewBox.width,
    }
  }

  const bounds = svg.getBoundingClientRect()
  return {
    height: bounds.height || 400,
    width: bounds.width || 800,
  }
}

export const downloadSvgAsPng = async (
  svg: SVGSVGElement,
  filename: string,
) => {
  const serializer = new XMLSerializer()
  const clonedSvg = svg.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  const { width, height } = resolveSvgDimensions(clonedSvg)
  const svgMarkup = serializer.serializeToString(clonedSvg)
  const svgBlob = new Blob([svgMarkup], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(width)
        canvas.height = Math.ceil(height)
        const context = canvas.getContext('2d')

        if (!context) {
          reject(new Error('Canvas rendering is unavailable.'))
          return
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const pngUrl = canvas.toDataURL('image/png')
        triggerDownload(pngUrl, filename)
        resolve()
      }
      image.onerror = () => reject(new Error('Unable to render SVG screenshot.'))
      image.src = svgUrl
    })
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
