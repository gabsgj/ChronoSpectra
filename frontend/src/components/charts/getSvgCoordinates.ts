export interface SvgCoordinates {
  x: number
  y: number
}

export const getSvgCoordinates = (
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): SvgCoordinates | null => {
  if (!svg) {
    return null
  }

  const screenMatrix = svg.getScreenCTM()
  if (!screenMatrix) {
    return null
  }

  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY

  const transformedPoint = point.matrixTransform(screenMatrix.inverse())
  return {
    x: transformedPoint.x,
    y: transformedPoint.y,
  }
}
