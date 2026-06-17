'use client'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'

interface DonutChartProps {
  data: { name: string; value: number; color: string }[]
  title?: string
  total?: string | number
}

export default function DonutChart({ data, total }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: unknown) => [String(v), ''] as [string, string]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ fontSize: 11, color: '#6b7280' }}>{value}</span>}
        />
        {total !== undefined && (
          <text
            x="50%" y="45%"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: 18, fontWeight: 700, fill: '#1e2a3a' }}
          >
            {total}
          </text>
        )}
      </PieChart>
    </ResponsiveContainer>
  )
}
