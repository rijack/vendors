'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Trash2, Bot, User, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClaudeMessage } from '@/types'

interface ClaudeChatProps {
  context: string
  title?: string
}

export function ClaudeChat({ context, title }: ClaudeChatProps) {
  const [messages, setMessages] = useState<ClaudeMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchHistory = useCallback(async () => {
    const res = await fetch(`/api/claude/chat?context=${encodeURIComponent(context)}`)
    const data = await res.json()
    setMessages(data)
    setLoadingHistory(false)
  }, [context])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer])

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || streaming) return

    // Optimistically add user message
    const userMsg: ClaudeMessage = {
      id: crypto.randomUUID(),
      user_id: '',
      context,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    setStreamBuffer('')

    try {
      const response = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          message: trimmed,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.chunk) {
              fullContent += parsed.chunk
              setStreamBuffer(fullContent)
            }
          } catch {}
        }
      }

      // Add final message to list
      const assistantMsg: ClaudeMessage = {
        id: crypto.randomUUID(),
        user_id: '',
        context,
        role: 'assistant',
        content: fullContent,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamBuffer('')
    } catch (error) {
      console.error('Claude chat error:', error)
    } finally {
      setStreaming(false)
    }
  }

  async function handleClear() {
    await fetch('/api/claude/chat', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
    setMessages([])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-amber-100 rounded-md flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">{title ?? 'Claude'}</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingHistory ? (
          <div className="flex justify-center pt-8">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : messages.length === 0 && !streaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-8">
            <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center mb-3">
              <Bot className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-xs text-gray-400 max-w-[180px]">
              Ask me to search, filter, or find information about your vendors
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {streaming && streamBuffer && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap streaming-cursor">
                    {streamBuffer}
                  </p>
                </div>
              </div>
            )}
            {streaming && !streamBuffer && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-end gap-2 border border-gray-200 rounded-xl bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude..."
            disabled={streaming}
            className="flex-1 text-sm outline-none resize-none bg-transparent placeholder-gray-400 max-h-28 leading-relaxed"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 mb-0.5"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  )
}

function ChatMessage({ message }: { message: ClaudeMessage }) {
  const isUser = message.role === 'user'

  // Parse save-to-vendor blocks (strip them from visible content)
  const displayContent = message.content.replace(/```save-to-vendor[\s\S]*?```/g, '').trim()

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-blue-600 text-white rounded-xl px-3 py-2">
          <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-amber-600" />
      </div>
      <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{displayContent}</p>
      </div>
    </div>
  )
}
