/** Stored data is shared by tables and charts; it never contains HTML, formulas, or executable code. */
export interface DataBlock {
  id: string
  type: 'table' | 'bar' | 'kpi' | 'comparison' | 'line' | 'doughnut'
  x: number
  y: number
  width: number
  height: number
  headers: string[]
  rows: string[][]
  horizontal: boolean
}

export const DATA_LIMITS = { blocks: 10, rows: 12, columns: 6, cellLength: 160 } as const
export const SERIES_COLORS = ['#335cc5', '#008577', '#c57525', '#9167bd', '#bd4566']
export const DATA_BLOCK_NAMES: Record<DataBlock['type'], string> = {
  table: 'Таблица', bar: 'Столбчатая диаграмма', kpi: 'KPI / крупное число',
  comparison: 'Сравнение', line: 'Линейный график', doughnut: 'Кольцевая диаграмма',
}
export const isNumericChart = (type: DataBlock['type']) => ['bar', 'line', 'doughnut'].includes(type)

export function createDataBlock(type: DataBlock['type']): DataBlock {
  const data = type === 'kpi' ? { headers: ['Показатель', 'Значение'], rows: [['Название показателя', '0']] }
    : type === 'comparison' ? { headers: ['Критерий', 'Вариант A', 'Вариант B'], rows: [['Критерий 1', '', ''], ['Критерий 2', '', '']] }
    : { headers: ['Категория', 'Значение'], rows: [['Категория 1', '0'], ['Категория 2', '0'], ['Категория 3', '0']] }
  return { id: `data-${crypto.randomUUID()}`, type, x: 15, y: 30, width: 70, height: 50, ...data, horizontal: false }
}

export function dataBlockError(value: DataBlock): string | null {
  if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value.id) || !Object.hasOwn(DATA_BLOCK_NAMES, value.type)
    || ![value.x, value.y, value.width, value.height].every(Number.isFinite)
    || value.x < 0 || value.y < 0 || value.width < 20 || value.height < 15
    || value.x + value.width > 100.001 || value.y + value.height > 100.001 || typeof value.horizontal !== 'boolean')
    return 'Блок должен полностью помещаться на слайде.'
  if (!Array.isArray(value.headers) || value.headers.length < 2 || value.headers.length > DATA_LIMITS.columns
    || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > DATA_LIMITS.rows
    || value.rows.some((row) => !Array.isArray(row) || row.length !== value.headers.length))
    return 'Допустимо от 2 до 6 столбцов и от 1 до 12 строк одинаковой длины.'
  if ([...value.headers, ...value.rows.flat()].some((cell) => typeof cell !== 'string' || cell.length > DATA_LIMITS.cellLength))
    return 'В одной ячейке может быть не более 160 символов.'
  if (isNumericChart(value.type) && value.rows.some((row) => row.slice(1).some((cell) => !chartNumber(cell))))
    return 'После названия категории введите числа без единиц измерения. Дробная часть — через точку.'
  if (value.type === 'kpi' && (value.headers.length !== 2 || value.rows.length !== 1 || value.rows[0][0].length > 80 || value.rows[0][1].length > 40))
    return 'Для KPI нужна одна строка: подпись до 80 и значение до 40 символов (можно с единицами измерения).'
  if (value.type === 'comparison' && value.headers.length < 3)
    return 'Для сравнения нужны критерий и минимум два варианта — от 3 до 6 столбцов.'
  if (value.type === 'doughnut' && (value.headers.length !== 2 || value.rows.some((row) => Number(row[1]) < 0)
    || !value.rows.some((row) => Number(row[1]) > 0)))
    return 'Для кольца нужны два столбца и неотрицательные числа, хотя бы одно больше нуля.'
  return null
}

/** Same conservative font fitting in the browser and native PowerPoint KPI text boxes. */
export function kpiFontSize(text: string, width: number, height: number, max: number): number {
  return Math.max(8, Math.min(max, (width - 28) / Math.max(1, [...text].length) / .65, height / 1.3))
}

function chartNumber(value: string): boolean {
  return value.trim() !== '' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
    && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e12
}

/** A zero-based range handles negative values and all-zero datasets without dividing by zero. */
export function chartRange(block: DataBlock) {
  const numbers = block.rows.flatMap((row) => row.slice(1).map(Number))
  const min = Math.min(0, ...numbers)
  const max = Math.max(0, ...numbers)
  return { min, max: min === max ? min + 1 : max }
}

/** Keep small magnitudes truthful and large labels short enough for the chart's axis gutter. */
export function formatChartValue(value: number): string {
  if (value === 0) return '0'
  if (Math.abs(value) < .01 || Math.abs(value) >= 1e6)
    return value.toExponential(2).replace(/\.?0+e/, 'e').replace('e+', 'e')
  return Number(value.toPrecision(3)).toString()
}

/** Match the PPTX's conservative wrapping estimate, in CSS pixels on a 960px slide. */
export function tableFontSize(block: DataBlock): number {
  const availableWidth = block.width * 9.6 / block.headers.length - 14
  const availableHeight = block.height * 5.4 / (block.rows.length + 1) - 6
  const cells = [...block.headers, ...block.rows.flat()]
  for (let size = 18.5; size >= 8; size -= .5) {
    if (cells.every((cell) => Math.max(1, cell.split(/\r?\n/).reduce((lines, line) =>
      lines + Math.max(1, Math.ceil([...line].length * size * .65 / availableWidth)), 0)) * size * 1.2 <= availableHeight)) return size
  }
  return 8
}
