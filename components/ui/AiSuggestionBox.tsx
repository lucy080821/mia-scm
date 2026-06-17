'use client'
import Button from './Button'

interface AiSuggestionBoxProps {
  title: string
  content: string
  actionLabel?: string
  onAction?: () => void
  loading?: boolean
}

export default function AiSuggestionBox({ title, content, actionLabel, onAction, loading }: AiSuggestionBoxProps) {
  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🤖</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-sky-700 mb-1">{title}</p>
          <p
            className="text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: content }}
          />
          {actionLabel && onAction && (
            <div className="mt-3">
              <Button size="sm" onClick={onAction} loading={loading}>
                {actionLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
