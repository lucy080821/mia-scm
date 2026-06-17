'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

interface BarChartProps {
  data: { label: string; value: number; color?: string }[]
  height?: number
  color?: string
  formatter?: (v: number) => string
  angleLabels?: boolean
}

export default function SimpleBarChart({ data, height = 180, color = '#0ea5e9', formatter, angleLabels }: BarChartProps) {
  const hasLongLabel = data.some(d => d.label.length > 10)
  const rotated = angleLabels ?? hasLongLabel
  const bottomMargin = rotated ? 55 : 0
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: bottomMargin }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          angle={rotated ? -35 : 0}
          textAnchor={rotated ? 'end' : 'middle'}
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={formatter} />
        <Tooltip
          formatter={(v: unknown) => [formatter ? formatter(Number(v)) : String(v), ''] as [string, string]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
