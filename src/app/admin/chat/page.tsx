'use client';

import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import AdminHeader from '@/components/layout/AdminHeader';
import {
  PaperAirplaneIcon,
  UserIcon,
  ArrowLeftIcon,
  MegaphoneIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

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

function getInitials(name: string) {
  const parts = name.split(' ');
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
}

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatConvTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return formatMsgTime(dateStr);
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function ChatPageWrapper() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-pulse h-8 bg-gray-200 rounded w-48" /></div>}>
      <ChatPage />
    </Suspense>
  );
}

function ChatPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const preselectedAgent = searchParams.get('agent');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(preselectedAgent);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convData, mutate: mutateConversations } = useSWR<{ conversations: Conversation[] }>(
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
  const currentUserId = (session?.user as { id: string } | undefined)?.id;

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.user.name.toLowerCase().includes(q) ||
        c.user.email.toLowerCase().includes(q) ||
        c.user.role.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUserId || sending) return;

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
      mutateConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim() || broadcasting) return;
    setBroadcasting(true);
    try {
      const res = await fetch('/api/chat/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg.trim() }),
      });
      if (!res.ok) throw new Error('Failed to send broadcast');
      setBroadcastMsg('');
      setShowBroadcast(false);
      mutateConversations();
    } catch {
      setError('Failed to send broadcast. Please try again.');
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <AdminHeader title="Messages" />

      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div className={`w-full md:w-80 border-r border-gray-200 bg-white flex flex-col ${selectedUserId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Conversations</h3>
              <button
                onClick={() => setShowBroadcast(true)}
                title="Broadcast to all agents"
                className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
              >
                <MegaphoneIcon className="h-6 w-6" />
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents by name, email, or role..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.map((conv) => (
              <button
                key={conv.user.id}
                onClick={() => setSelectedUserId(conv.user.id)}
                className={`w-full p-4 flex items-start gap-3 hover:bg-gray-50 border-b border-gray-50 text-left transition-colors ${
                  selectedUserId === conv.user.id ? 'bg-primary-50 border-l-3 border-l-primary-600' : ''
                }`}
              >
                {conv.user.photo ? (
                  <img src={conv.user.photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-gray-600">{getInitials(conv.user.name)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 truncate">{conv.user.name}</p>
                    {conv.lastMessageAt && new Date(conv.lastMessageAt).getTime() > 0 && (
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{formatConvTime(conv.lastMessageAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-gray-500 truncate">{conv.lastMessage || 'No messages yet'}</p>
                    {conv.unreadCount > 0 && (
                      <span className="ml-2 w-5 h-5 bg-primary-600 text-white text-xs rounded-full flex items-center justify-center shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <span className={`inline-block mt-0.5 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded ${
                    conv.user.role === 'AGENT'
                      ? 'bg-blue-50 text-blue-700'
                      : conv.user.role === 'ADMIN'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}>
                    {conv.user.role}
                  </span>
                </div>
              </button>
            ))}
            {filteredConversations.length === 0 && conversations.length > 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">No agents match &quot;{searchQuery}&quot;</div>
            )}
            {conversations.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">No conversations yet</div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col bg-gray-50 ${selectedUserId ? 'flex' : 'hidden md:flex'}`}>
          {selectedUserId && selectedConv ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
                <button
                  onClick={() => setSelectedUserId(null)}
                  className="md:hidden p-1.5 -ml-2 mr-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
                {selectedConv.user.photo ? (
                  <img src={selectedConv.user.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-gray-600">{getInitials(selectedConv.user.name)}</span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{selectedConv.user.name}</p>
                  <p className="text-xs text-gray-500">{selectedConv.user.role} &middot; {selectedConv.user.email}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-12">
                    No messages yet. Send the first message!
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.senderId === currentUserId;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] ${isMe ? 'order-2' : ''}`}>
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm ${
                            isMe
                              ? 'bg-primary-600 text-white rounded-br-md'
                              : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                          }`}
                        >
                          {msg.message}
                        </div>
                        <p className={`text-[10px] text-gray-400 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                          {formatMsgTime(msg.createdAt)}
                          {isMe && (
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

              {/* Error Message */}
              {error && (
                <div className="mx-4 mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
                </div>
              )}

              {/* Message Input */}
              <form onSubmit={handleSend} className="bg-white border-t border-gray-200 p-4 flex items-center gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserIcon className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">Select a conversation</p>
                <p className="text-sm text-gray-400 mt-1">Choose an agent to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Broadcast Modal */}
      <Modal isOpen={showBroadcast} onClose={() => setShowBroadcast(false)} title="Broadcast to All Agents" size="sm">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
            <MegaphoneIcon className="h-8 w-8 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">This message will be sent to <strong>all agents</strong> in the system.</p>
          </div>
          <textarea
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Type your broadcast message..."
            rows={4}
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowBroadcast(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBroadcast}
              loading={broadcasting}
              disabled={!broadcastMsg.trim()}
              icon={<MegaphoneIcon className="h-4 w-4" />}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Send Broadcast
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
