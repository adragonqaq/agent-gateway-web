import ReactMarkdown from 'react-markdown'
import { sanitizeAssistantText } from '../lib/toolEvent'

type Props = {
  text: string
  className?: string
}

/** 助手气泡 Markdown 渲染（列表 / 加粗 / 代码等） */
export function Markdown({ text, className }: Props) {
  const { display } = sanitizeAssistantText(text)
  if (!display.trim()) return null
  return (
    <div className={className ? `md ${className}` : 'md'}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {display}
      </ReactMarkdown>
    </div>
  )
}
