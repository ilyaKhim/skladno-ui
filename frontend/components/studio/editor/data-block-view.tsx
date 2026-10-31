import { chartRange, formatChartValue, tableFontSize, SERIES_COLORS, type DataBlock } from '../../../lib/data-blocks'

/** The same view is used on the canvas and thumbnails; no screenshot-only representations. */
export function DataBlockView({ block }: { block: DataBlock }) {
  if (block.type === 'table') {
    const fontSize = tableFontSize(block)
    return <div className="h-full w-full overflow-hidden bg-white" style={{ fontFamily: 'Arial, sans-serif', fontSize: `${fontSize / 9.6}cqw`, color: '#142033' }}>
      <table aria-label="Таблица на слайде" className="h-full w-full table-fixed border-collapse text-left" style={{ lineHeight: 1.2 }}>
        <thead style={{ background: SERIES_COLORS[0], color: '#ffffff' }}><tr>{block.headers.map((cell, column) =>
          <th key={column} className="overflow-hidden border border-[#d9dee7] px-[0.7cqw] py-[0.25cqw] font-bold break-words">{cell}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, index) => <tr key={index} style={{ background: index % 2 ? '#eef0f2' : '#ffffff' }}>
          {row.map((cell, column) => <td key={column} className="overflow-hidden border border-[#d9dee7] px-[0.7cqw] py-[0.25cqw] break-words">{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  }
  const { min, max } = chartRange(block)
  const horizontal = block.horizontal
  const left = horizontal ? 110 : 65, top = 15, width = horizontal ? 460 : 505, height = 250
  const series = block.headers.length - 1
  const group = (horizontal ? height : width) / block.rows.length
  const barSize = group * .7 / series
  const zero = (0 - min) / (max - min)
  const short = (text: string, limit = 14) => text.length > limit ? text.slice(0, Math.max(1, limit - 1)) + '…' : text
  return <svg role="img" aria-label="Столбчатая диаграмма" viewBox="0 0 600 320" preserveAspectRatio="none" className="block h-full w-full bg-white" style={{ fontFamily: 'Arial, sans-serif', fontSize: 12 }}>
    <title>{block.headers.slice(1).join(', ')}</title>
    {[0, 1, 2, 3, 4].map((tick) => {
      const fraction = tick / 4, x = left + fraction * width, y = top + (1 - fraction) * height
      return <g key={tick}>
        <line x1={horizontal ? x : left} x2={horizontal ? x : left + width} y1={horizontal ? top : y} y2={horizontal ? top + height : y} stroke="#d9dee7" />
        <text x={horizontal ? x - 10 : 3} y={horizontal ? 282 : y + 4} fill="#5b6675">{formatChartValue(min + fraction * (max - min))}</text>
      </g>
    })}
    {block.rows.map((row, index) => <g key={index}>
      <text x={horizontal ? 3 : left + group * index} y={horizontal ? top + group * (index + .55) : 282} fill="#142033"><title>{row[0]}</title>{short(row[0], horizontal ? 14 : Math.max(2, Math.min(14, Math.floor(group / 7))))}</text>
      {row.slice(1).map((value, column) => {
        const end = (Number(value) - min) / (max - min)
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
