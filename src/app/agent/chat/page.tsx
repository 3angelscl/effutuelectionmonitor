'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import Card from '@/components/ui/Card';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Conversation {
  user: { id: string; name: string; email: string; photo: string | null; role: string };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface ChatMsg {
  id: string;
  senderId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  sender: { id: string; name: string; photo: string | null };
}

export default function AgentChatPage() {
  const { data: session } = useSession();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convData, mutate: mutateConvos } = useSWR<{ conversations: Conversation[] }>(
    '/api/chat',
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: msgData, mutate: mutateMessages } = useSWR<{ messages: ChatMsg[] }>(
    selectedUserId ? `/api/chat?with=${selectedUserId}` : null,
    fetcher,
    { refreshInterval: 3000 }
  );

  const conversations = convData?.conversations || [];
  const messages = msgData?.messages || [];
  const selectedConv = conversations.find((c) => c.user.id === selectedUserId);
  const currentUserId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUserId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: selectedUserId, message: newMessage.trim() }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      setNewMessage('');
      mutateMessages();
      mutateConvos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  };

  return (
    <div className="p-6 h-[calc(100vh-2rem)]">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Messages</h1>

      <div className="flex gap-6 h-[calc(100%-4rem)]">
        {/* Conversation List */}
        <Card padding={false} className="w-80 shrink-0 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Conversations</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((convo) => (
              <button
                key={convo.user.id}
                onClick={() => setSelectedUserId(convo.user.id)}
                className={`w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 border-b border-gray-50 ${
                  selectedUserId === convo.user.id ? 'bg-primary-50' : ''
                }`}
              >
                <div className="w-10 h-10 bg-navy-700 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {getInitials(convo.user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 text-sm">{convo.user.name}</p>
                    {convo.lastMessageAt && new Date(convo.lastMessageAt).getTime() > 0 && (
                      <span className="text-[10px] text-gray-400">{formatTime(convo.lastMessageAt)}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{convo.lastMessage || 'No messages yet'}</p>
                  <span className="text-[10px] text-gray-400 uppercase">{convo.user.role}</span>
                </div>
                {convo.unreadCount > 0 && (
                  <span className="w-5 h-5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {convo.unreadCount}
                  </span>
                )}
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">No conversations yet</div>
            )}
          </div>
        </Card>

        {/* Message Area */}
        <Card padding={false} className="flex-1 flex flex-col">
          {selectedUserId && selectedConv ? (
            <>
              <div className="p-4 border-b border-gray-100">
                <p className="font-semibold text-gray-900">{selectedConv.user.name}</p>
                <p className="text-xs text-gray-500">{selectedConv.user.role}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                  const isMine = msg.senderId === currentUserId;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                        isMine
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                      }`}>
                        <p className="text-sm">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60' : 'text-gray-400'}`}>
                          {formatTime(msg.createdAt)}
                          {isMine && (
                            <span className={`ml-1.5 ${msg.isRead ? 'text-green-500' : 'text-gray-400'}`}>
                              {msg.isRead ? 'Read' : 'Sent'}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {error && (
                <div className="mx-4 mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
                </div>
              )}
              <form onSubmit={handleSend} className="p-4 border-t border-gray-100 flex gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Choose a contact to start messaging</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
