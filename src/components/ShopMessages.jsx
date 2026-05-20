import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, Send, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { playNotificationSound } from '../lib/notificationSound'
import { format } from 'date-fns'

const ShopMessages = () => {
  const { currentShop, userProfile } = useShop()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)

  const shopId = currentShop?.id !== 'all' ? currentShop?.id : null

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = useCallback(async () => {
    if (!shopId) return
    const { data, error } = await supabase
      .from('shop_messages')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: true })
      .limit(100)
    
    if (!error && data) {
      setMessages(data)
    }
  }, [shopId])

  const fetchUnreadCount = useCallback(async () => {
    if (!shopId || !userProfile) return
    const { count, error } = await supabase
      .from('shop_messages')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('is_read', false)
      .neq('sender_id', userProfile.id)
    
    if (!error) setUnreadCount(count || 0)
  }, [shopId, userProfile])

  const markAsRead = useCallback(async () => {
    if (!shopId || !userProfile) return
    await supabase
      .from('shop_messages')
      .update({ is_read: true })
      .eq('shop_id', shopId)
      .eq('is_read', false)
      .neq('sender_id', userProfile.id)
    
    setUnreadCount(0)
  }, [shopId, userProfile])

  // Fetch messages on mount and when shop changes
  useEffect(() => {
    fetchMessages()
    fetchUnreadCount()
  }, [fetchMessages, fetchUnreadCount])

  // Mark as read when chat is opened
  useEffect(() => {
    if (isOpen) {
      markAsRead()
      scrollToBottom()
    }
  }, [isOpen, markAsRead])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) scrollToBottom()
  }, [messages, isOpen])

  // Real-time subscription
  useEffect(() => {
    if (!shopId) return

    const channel = supabase
      .channel(`shop-messages-${shopId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shop_messages',
          filter: `shop_id=eq.${shopId}`
        },
        (payload) => {
          const newMsg = payload.new
          setMessages(prev => [...prev, newMsg])

          // Play sound if message is from someone else
          if (newMsg.sender_id !== userProfile?.id) {
            playNotificationSound()
            if (!isOpen) {
              setUnreadCount(prev => prev + 1)
            } else {
              // Mark as read immediately
              supabase
                .from('shop_messages')
                .update({ is_read: true })
                .eq('id', newMsg.id)
                .then(() => {})
            }
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [shopId, userProfile, isOpen])

  const handleSend = async (e) => {
    e.preventDefault()
    const trimmed = newMessage.trim()
    if (!trimmed || !shopId || !userProfile) return

    setSending(true)
    const { error } = await supabase.from('shop_messages').insert([{
      shop_id: shopId,
      sender_id: userProfile.id,
      sender_name: userProfile.full_name || 'Unknown',
      sender_role: userProfile.role || 'Staff',
      message: trimmed
    }])

    if (error) {
      alert('Failed to send message: ' + error.message)
    } else {
      setNewMessage('')
    }
    setSending(false)
  }

  if (!userProfile || !shopId) return null

  return (
    <>
      {/* Floating Button */}
      <button
        className="chat-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--primary)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          zIndex: 1200,
          transition: 'transform 0.2s, background 0.2s'
        }}
        title="Shop Messages"
      >
        {isOpen ? <ChevronDown size={24} /> : <MessageCircle size={24} />}
        {!isOpen && unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'var(--danger)',
            color: 'white',
            borderRadius: '50%',
            width: '22px',
            height: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: '800',
            border: '2px solid white'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div 
         className="chat-popup"
         style={{
          position: 'fixed',
          bottom: '90px',
          right: '24px',
          width: '380px',
          maxWidth: 'calc(100vw - 48px)',
          height: '500px',
          maxHeight: 'calc(100vh - 140px)',
          background: 'var(--surface-main)',
          borderRadius: '16px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          zIndex: 1200,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'var(--primary)',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>
                💬 Shop Chat
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.85 }}>
                {currentShop?.name}
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'var(--surface-muted)'
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px', fontSize: '14px' }}>
                <MessageCircle size={32} style={{ marginBottom: '8px', opacity: 0.3 }} />
                <p>No messages yet.</p>
                <p style={{ fontSize: '12px' }}>Start a conversation about stock, operations, or anything else.</p>
              </div>
            )}

            {messages.map((msg) => {
              const isMe = msg.sender_id === userProfile?.id
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isMe ? 'var(--primary)' : 'var(--surface-main)',
                    color: isMe ? 'white' : 'var(--text-main)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    border: isMe ? 'none' : '1px solid var(--border)'
                  }}>
                    {!isMe && (
                      <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '4px', color: 'var(--primary)' }}>
                        {msg.sender_name} · {msg.sender_role}
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word' }}>
                      {msg.message}
                    </p>
                    <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6, textAlign: 'right' }}>
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '8px',
            background: 'var(--surface-main)'
          }}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '24px',
                border: '1px solid var(--border)',
                outline: 'none',
                fontSize: '14px',
                background: 'var(--surface-muted)',
                color: 'var(--text-main)'
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: newMessage.trim() ? 'var(--primary)' : 'var(--surface-muted)',
                color: newMessage.trim() ? 'white' : 'var(--text-muted)',
                border: 'none',
                cursor: newMessage.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}

export default ShopMessages
