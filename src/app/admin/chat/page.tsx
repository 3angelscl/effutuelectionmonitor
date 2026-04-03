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
  MagnifyingGlassIcon,
  PaperClipIcon,
  CameraIcon,
  VideoCameraIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  MegaphoneIcon,
} from '@heroicons/react/24/outline';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Conversation {
  user: {
    id: string;
    name: string;
    email: string;
    photo: string | null;
    role: string;
    station: string | null;
  };
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
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatConvTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.toDateString() === now.toDateString()) return formatMsgTime(dateStr);
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function getOnlineStatus(lastMessageAt: string): 'online' | 'away' | 'offline' {
  if (!lastMessageAt || new Date(lastMessageAt).getTime() === 0) return 'offline';
  const diff = Date.now() - new Date(lastMessageAt).getTime();
  if (diff < 30 * 60 * 1000) return 'online';
  if (diff < 4 * 60 * 60 * 1000) return 'away';
  return 'offline';
}

function getSignal(lastMessageAt: string): { label: string; color: string } {
  const s = getOnlineStatus(lastMessageAt);
  if (s === 'online') return { label: 'SIGNAL STRONG', color: 'text-emerald-600' };
  if (s === 'away') return { label: 'SIGNAL MODERATE', color: 'text-amber-500' };
  return { label: 'OFFLINE', color: 'text-gray-400' };
}

function formatDateDivider(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function ChatPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-48" />
      </div>
    }>
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
  const [isPriority, setIsPriority] = useState(false);
  const [isBroadcastLog, setIsBroadcastLog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.user.name.toLowerCase().includes(q) ||
        c.user.email.toLowerCase().includes(q) ||
        (c.user.station || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const onlineCount = useMemo(
    () => conversations.filter((c) => getOnlineStatus(c.lastMessageAt) === 'online').length,
    [conversations]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [newMessage]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
      setIsPriority(false);
      mutateMessages();
      mutateConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  const signal = selectedConv ? getSignal(selectedConv.lastMessageAt) : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <AdminHeader title="Messages" />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ── Left Sidebar ── */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-gray-200 bg-white flex flex-col shrink-0 ${selectedUserId ? 'hidden md:flex' : 'flex'}`}>
          {/* Sidebar header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
            {/* Title + online badge */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                Live Field Agents
              </span>
              {onlineCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  {onlineCount} Online
                </span>
              )}
            </div>

            {/* New Broadcast button */}
            <button
              onClick={() => setShowBroadcast(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              <PlusIcon className="h-4 w-4" />
              New Broadcast
            </button>

            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 && conversations.length > 0 && (
              <p className="p-8 text-center text-sm text-gray-400">
                No agents match &quot;{searchQuery}&quot;
              </p>
            )}
            {conversations.length === 0 && (
              <p className="p-8 text-center text-sm text-gray-400">No conversations yet</p>
            )}

            {filteredConversations.map((conv) => {
              const status = getOnlineStatus(conv.lastMessageAt);
              const isSelected = selectedUserId === conv.user.id;
              const statusDot: Record<typeof status, string> = {
                online: 'bg-emerald-500',
                away: 'bg-amber-400',
                offline: 'bg-gray-300',
              };

              return (
                <button
                  key={conv.user.id}
                  onClick={() => setSelectedUserId(conv.user.id)}
                  className={`w-full px-4 py-3.5 flex items-start gap-3 border-b border-gray-50 text-left transition-all ${
                    isSelected
                      ? 'bg-blue-50 border-l-[3px] border-l-blue-600'
                      : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'
                  }`}
                >
                  {/* Avatar + status dot */}
                  <div className="relative shrink-0">
                    {conv.user.photo ? (
                      <img
                        src={conv.user.photo}
                        alt={conv.user.name}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-11 h-11 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-600">
                          {getInitials(conv.user.name)}
                        </span>
                      </div>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusDot[status]}`}
                    />
                  </div>

                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                        {conv.user.name}
                      </p>
                      {conv.lastMessageAt && new Date(conv.lastMessageAt).getTime() > 0 && (
                        <span className="text-[11px] text-gray-400 shrink-0">
                          {formatConvTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-emerald-600 font-medium truncate mt-0.5">
                      {conv.user.station || conv.user.email}
                    </p>

                    <div className="flex items-center justify-between mt-0.5">
                      <p className={`text-xs truncate ${status === 'offline' ? 'italic text-gray-400' : 'text-gray-500'}`}>
                        {conv.lastMessage || 'No messages yet'}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right Panel: Chat ── */}
        <div className={`flex-1 flex flex-col min-w-0 bg-gray-50 ${selectedUserId ? 'flex' : 'hidden md:flex'}`}>
          {selectedUserId && selectedConv ? (
            <>
              {/* Chat header */}
              <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 shrink-0 shadow-sm">
                <button
                  onClick={() => setSelectedUserId(null)}
                  className="md:hidden p-1.5 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>

                {selectedConv.user.photo ? (
                  <img
                    src={selectedConv.user.photo}
                    alt={selectedConv.user.name}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-gray-600">
                      {getInitials(selectedConv.user.name)}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {selectedConv.user.name}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">
                      {selectedConv.user.station || selectedConv.user.email}
                    </span>
                    {signal && (
                      <span className={`font-bold shrink-0 ${signal.color}`}>
                        · {signal.label}
                      </span>
                    )}
                  </p>
                </div>

                <button
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Video call"
                >
                  <VideoCameraIcon className="h-5 w-5" />
                </button>
                <button
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="More options"
                >
                  <EllipsisVerticalIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-1">
                {messages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-16">
                    No messages yet — send the first one!
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isMe = msg.senderId === currentUserId;
                  const prevMsg = messages[idx - 1];
                  const showDivider = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);

                  return (
                    <div key={msg.id}>
                      {showDivider && (
                        <div className="flex items-center gap-3 my-5">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-2">
                            {formatDateDivider(msg.createdAt)}
                          </span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      )}

                      <div className={`flex mb-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[65%] md:max-w-[55%]">
                          <div
                            className={`px-4 py-2.5 text-sm leading-relaxed break-words ${
                              isMe
                                ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm'
                                : 'bg-white text-gray-900 rounded-2xl rounded-bl-sm shadow-sm border border-gray-100'
                            }`}
                          >
                            {msg.message}
                          </div>
                          <p className={`text-[10px] text-gray-400 mt-1 flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {formatMsgTime(msg.createdAt)}
                            {isMe && (
                              <span className={msg.isRead ? 'text-emerald-500' : 'text-gray-400'}>
                                · {msg.isRead ? 'Read' : 'Delivered'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>

              {/* Error banner */}
              {error && (
                <div className="mx-4 mb-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between shrink-0">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                </div>
              )}

              {/* Input area */}
              <div className="bg-white border-t border-gray-200 px-4 pt-3 pb-3 shrink-0">
                <div className="flex items-end gap-2">
                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors shrink-0 mb-0.5"
                    title="Attach file"
                  >
                    <PaperClipIcon className="h-5 w-5" />
                  </button>
                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors shrink-0 mb-0.5"
                    title="Send photo"
                  >
                    <CameraIcon className="h-5 w-5" />
                  </button>

                  <textarea
                    ref={textareaRef}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type administrative directive..."
                    rows={1}
                    className="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[42px] max-h-[120px] leading-relaxed"
                  />

                  <button
                    onClick={() => handleSend()}
                    disabled={!newMessage.trim() || sending}
                    className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 mb-0.5"
                  >
                    <PaperAirplaneIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Footer options */}
                <div className="flex items-center justify-between mt-2 px-1">
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isPriority}
                        onChange={(e) => setIsPriority(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-1"
                      />
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Priority Tag
                      </span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isBroadcastLog}
                        onChange={(e) => setIsBroadcastLog(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-1"
                      />
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Broadcast Log
                      </span>
                    </label>
                  </div>
                  <p className="text-[10px] text-gray-400 italic hidden sm:block">
                    Press Shift + Enter for new line
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-blue-50/50">
                  <UserIcon className="h-8 w-8 text-blue-400" />
                </div>
                <p className="text-gray-700 font-semibold">Select a conversation</p>
                <p className="text-sm text-gray-400 mt-1">
                  Choose an agent from the list to start messaging
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Broadcast Modal */}
      <Modal
        isOpen={showBroadcast}
        onClose={() => setShowBroadcast(false)}
        title="New Broadcast"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <MegaphoneIcon className="h-8 w-8 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-700">
              This message will be sent to <strong>all field agents</strong> simultaneously.
            </p>
          </div>
          <textarea
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Type your broadcast message..."
            rows={4}
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
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
            >
              Send Broadcast
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
