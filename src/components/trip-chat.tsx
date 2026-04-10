"use client"

/**
 * TripChat — Real-time traveler chat
 *
 * Features:
 *  • Messages stored in Firestore: globalChat/{msgId}
 *  • Only shows messages from the last 12 hours (Firestore query + client filter)
 *  • Hard 140-character limit per message
 *  • Auto-scrolls to the latest message
 *  • Dark glassmorphism UI to match NomadGuide theme
 *  • Lightweight: no heavy packages
 */

import React, { useState, useEffect, useRef } from 'react'
import { X, Send, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFirebase, useUser } from '@/firebase'
import {
  collection,
  addDoc,
  query,
  orderBy,
  where,
  Timestamp,
  onSnapshot,
  serverTimestamp,
  limit,
} from 'firebase/firestore'

const MAX_CHARS = 140
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

interface ChatMessage {
  id: string
  text: string
  authorName: string
  authorId: string
  createdAt: number // epoch ms
}

interface TripChatProps {
  isOpen: boolean
  onClose: () => void
}

export function TripChat({ isOpen, onClose }: TripChatProps) {
  const { firestore } = useFirebase()
  const { user } = useUser()

  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // ── Real-time Firestore listener ──────────────────────────────────────────
  useEffect(() => {
    if (!firestore || !isOpen) return

    // Only fetch messages from the last 12 hours
    const cutoff = Timestamp.fromMillis(Date.now() - TWELVE_HOURS_MS)

    const q = query(
      collection(firestore, 'globalChat'),
      where('createdAt', '>=', cutoff),
      orderBy('createdAt', 'asc'),
      limit(200)
    )

    const unsub = onSnapshot(q, (snap) => {
      const msgs: ChatMessage[] = snap.docs.map((d) => ({
        id: d.id,
        text:       d.data().text       ?? '',
        authorName: d.data().authorName ?? 'Nomad',
        authorId:   d.data().authorId   ?? '',
        createdAt:  (d.data().createdAt as Timestamp)?.toMillis?.() ?? Date.now(),
      }))
      setMessages(msgs)
    })

    return () => unsub()
  }, [firestore, isOpen])

  // ── Auto-scroll to bottom when messages update ────────────────────────────
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // ── Focus input when chat opens ───────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = inputText.trim()
    if (!text || !firestore || !user || isSending) return

    setIsSending(true)
    setInputText('')

    try {
      await addDoc(collection(firestore, 'globalChat'), {
        text,
        authorId:   user.uid,
        authorName: user.displayName || user.email?.split('@')[0] || 'Nomad',
        createdAt:  serverTimestamp(),
      })
    } catch (err) {
      console.error('[TripChat] Failed to send:', err)
      setInputText(text) // restore on failure
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const charsLeft = MAX_CHARS - inputText.length

  // ── Format relative time ──────────────────────────────────────────────────
  const formatTime = (ms: number) => {
    const diff = Date.now() - ms
    if (diff < 60_000) return 'just now'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
    return `${Math.floor(diff / 3600_000)}h ago`
  }

  if (!isOpen) return null

  return (
    <div
      className={cn(
        // Overlay: positioned absolutely so map stays interactive underneath
        "absolute inset-x-3 bottom-24 z-[500]",
        "top-[env(safe-area-inset-top,0px)] sm:inset-x-auto sm:right-4 sm:left-auto sm:w-[380px] sm:top-auto sm:bottom-28",
        "max-h-[70vh] flex flex-col",
        // Glassmorphism card
        "bg-slate-900/90 backdrop-blur-2xl border border-white/10",
        "rounded-3xl shadow-2xl shadow-black/60",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Traveler Chat</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'} · last 12h
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* ── Message List ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0 scroll-smooth">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-center">
            <MessageCircle className="w-8 h-8 text-white/10 mb-2" />
            <p className="text-xs text-slate-500">No messages yet.</p>
            <p className="text-[10px] text-slate-600">Be the first traveler to say hi 👋</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.authorId === user?.uid
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[85%] gap-0.5",
                  isOwn ? "self-end items-end ml-auto" : "self-start items-start"
                )}
              >
                {/* Author name (only for others) */}
                {!isOwn && (
                  <span className="text-[10px] text-slate-400 px-1 font-medium">
                    {msg.authorName}
                  </span>
                )}

                {/* Message bubble */}
                <div
                  className={cn(
                    "px-3.5 py-2 rounded-2xl text-sm leading-snug break-words",
                    isOwn
                      ? "bg-emerald-600 text-white rounded-br-md"
                      : "bg-white/10 text-slate-100 rounded-bl-md"
                  )}
                >
                  {msg.text}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-slate-500 px-1">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            )
          })
        )}
        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="px-4 pb-4 pt-2 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CHARS) {
                  setInputText(e.target.value)
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="Say something... (140 chars)"
              disabled={!user}
              className={cn(
                "w-full h-11 bg-white/5 border border-white/10 rounded-2xl",
                "px-4 pr-14 text-sm text-white placeholder:text-slate-500",
                "focus:outline-none focus:border-emerald-500/40 focus:bg-white/8",
                "transition-all",
                !user && "opacity-40 cursor-not-allowed"
              )}
            />
            {/* Char counter */}
            <span
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono tabular-nums",
                charsLeft <= 20 ? "text-amber-400" : "text-slate-500",
                charsLeft <= 0  ? "text-red-400"   : ""
              )}
            >
              {charsLeft}
            </span>
          </div>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || !user || isSending}
            className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all",
              inputText.trim() && user
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 active:scale-95"
                : "bg-white/5 text-slate-600 cursor-not-allowed"
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {!user && (
          <p className="text-[10px] text-slate-500 text-center mt-2">
            Sign in to join the conversation
          </p>
        )}
      </div>
    </div>
  )
}
