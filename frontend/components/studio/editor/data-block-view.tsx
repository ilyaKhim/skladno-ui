import { chartRange, formatChartValue, tableFontSize, kpiFontSize, SERIES_COLORS, DATA_BLOCK_NAMES, type DataBlock } from '../../../lib/data-blocks'

/** The same view is used on the canvas and thumbnails; no screenshot-only representations. */
export function DataBlockView({ block }: { block: DataBlock }) {
  if (block.type === 'kpi') return <KpiView block={block} />
  if (block.type === 'doughnut') return <DoughnutView block={block} />
  if (block.type === 'table' || block.type === 'comparison') {
    const fontSize = tableFontSize(block)
    const rowHeight = `${block.height * 5.4 / (block.rows.length + 1) / 9.6}cqw`
    return <div className="h-full w-full overflow-hidden bg-white" style={{ fontFamily: 'Arial, sans-serif', fontSize: `${fontSize / 9.6}cqw`, color: '#142033' }}>
      <table aria-label={block.type === 'comparison' ? 'Сравнение на слайде' : 'Таблица на слайде'} className="h-full w-full table-fixed border-collapse text-left" style={{ lineHeight: 1.2 }}>
        <thead style={{ background: SERIES_COLORS[0], color: '#ffffff' }}><tr style={{ height: rowHeight }}>{block.headers.map((cell, column) =>
          <th key={column} className="overflow-hidden border border-[#d9dee7] px-[0.7cqw] py-[0.25cqw] font-bold break-words">{cell}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, index) => <tr key={index} style={{ height: rowHeight, background: index % 2 ? '#eef0f2' : '#ffffff' }}>
          {row.map((cell, column) => <td key={column} style={block.type === 'comparison' && column === 0 ? { background: '#eef0f2', fontWeight: 700 } : undefined} className="overflow-hidden border border-[#d9dee7] px-[0.7cqw] py-[0.25cqw] break-words">{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  }
  const { min, max } = chartRange(block)
  const horizontal = block.type === 'bar' && block.horizontal
  const line = block.type === 'line'
  const left = horizontal ? 110 : 65, top = 15, width = horizontal ? 460 : 505, height = 250
  const series = block.headers.length - 1
  const group = (horizontal ? height : width) / block.rows.length
  const barSize = group * .7 / series
  const zero = (0 - min) / (max - min)
  const short = (text: string, limit = 14) => text.length > limit ? text.slice(0, Math.max(1, limit - 1)) + '…' : text
  const pointX = (row: number) => left + (block.rows.length === 1 ? width / 2 : row * width / (block.rows.length - 1))
  const pointY = (value: string) => top + (1 - (Number(value) - min) / (max - min)) * height
  return <svg role="img" aria-label={DATA_BLOCK_NAMES[block.type]} viewBox="0 0 600 320" preserveAspectRatio="none" className="block h-full w-full bg-white" style={{ fontFamily: 'Arial, sans-serif', fontSize: 12 }}>
    <title>{block.headers.slice(1).join(', ')}</title>
    {[0, 1, 2, 3, 4].map((tick) => {
      const fraction = tick / 4, x = left + fraction * width, y = top + (1 - fraction) * height
      return <g key={tick}>
        <line x1={horizontal ? x : left} x2={horizontal ? x : left + width} y1={horizontal ? top : y} y2={horizontal ? top + height : y} stroke="#d9dee7" />
        <text x={horizontal ? x - 10 : 3} y={horizontal ? 282 : y + 4} fill="#5b6675">{formatChartValue(min + fraction * (max - min))}</text>
      </g>
    })}
    {line && block.headers.slice(1).map((_, column) => <polyline key={column} fill="none" stroke={SERIES_COLORS[column]} strokeWidth={2.5}
      points={block.rows.map((row, index) => `${pointX(index)},${pointY(row[column + 1])}`).join(' ')} />)}
    {block.rows.map((row, index) => <g key={index}>
      <text x={line ? pointX(index) : horizontal ? 3 : left + group * index} textAnchor={line ? block.rows.length === 1 ? 'middle' : index === 0 ? 'start' : index === block.rows.length - 1 ? 'end' : 'middle' : undefined} y={horizontal ? top + group * (index + .55) : 282} fill="#142033"><title>{row[0]}</title>{short(row[0], horizontal ? 14 : Math.max(2, Math.min(14, Math.floor(group / 7))))}</text>
      {row.slice(1).map((value, column) => {
        const end = (Number(value) - min) / (max - min)
        if (line) return <circle key={column} cx={pointX(index)} cy={pointY(value)} r={3.5} fill={SERIES_COLORS[column]}><title>{row[0]} — {block.headers[column + 1]}: {value}</title></circle>
        return <rect key={column} fill={SERIES_COLORS[column]} x={horizontal ? left + Math.min(zero, end) * width : left + index * group + group * .15 + column * barSize}
          y={horizontal ? top + index * group + group * .15 + column * barSize : top + (1 - Math.max(zero, end)) * height}
          width={horizontal ? Math.abs(end - zero) * width : barSize} height={horizontal ? barSize : Math.abs(end - zero) * height}>
          <title>{row[0]} — {block.headers[column + 1]}: {value}</title>
        </rect>
      })}
    </g>)}
    {block.headers.slice(1).map((name, index) => <g key={index}>
      <rect x={12 + index * 118} y={304} width={9} height={9} fill={SERIES_COLORS[index]} />
      <text x={26 + index * 118} y={313} fill="#142033"><title>{name}</title>{short(name)}</text>
    </g>)}
  </svg>
}

function KpiView({ block }: { block: DataBlock }) {
  const [label, value] = block.rows[0].map((text) => text.replace(/\s+/g, ' '))
  return <svg role="img" aria-label="KPI / крупное число" viewBox="0 0 600 320" className="block h-full w-full bg-white" style={{ fontFamily: 'Arial, sans-serif' }}>
    <title>{label}: {value}</title>
    <text x={300} y={120} dominantBaseline="central" textAnchor="middle" fill={SERIES_COLORS[0]} fontWeight={700} fontSize={kpiFontSize(value, 600, 150, 76)}>{value}</text>
    <text x={300} y={245} dominantBaseline="central" textAnchor="middle" fill="#142033" fontSize={kpiFontSize(label, 600, 80, 28)}>{label}</text>
  </svg>
}

function DoughnutView({ block }: { block: DataBlock }) {
  const total = block.rows.reduce((sum, row) => sum + Number(row[1]), 0)
  let offset = 0
  return <svg role="img" aria-label="Кольцевая диаграмма" viewBox="0 0 600 320" className="block h-full w-full bg-white" style={{ fontFamily: 'Arial, sans-serif', fontSize: 12 }}>
    <title>{block.headers[1]}</title>
    {block.rows.map((row, index) => {
      const fraction = Number(row[1]) / total, start = offset
      offset += fraction
      return <g key={index}>
        {fraction > 0 && <circle cx={165} cy={160} r={110} fill="none" stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth={52}
          pathLength={1} strokeDasharray={`${fraction} ${1 - fraction}`} strokeDashoffset={-start} transform="rotate(-90 165 160)">
          <title>{row[0]}: {row[1]} ({formatChartValue(fraction * 100)}%)</title>
        </circle>}
        <rect x={320} y={22 + index * 23} width={9} height={9} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
        <text x={337} y={31 + index * 23} fill="#142033"><title>{row[0]}: {row[1]}</title>{row[0].length > 22 ? row[0].slice(0, 21) + '…' : row[0]}: {formatChartValue(fraction * 100)}%</text>
      </g>
    })}
  </svg>
}
