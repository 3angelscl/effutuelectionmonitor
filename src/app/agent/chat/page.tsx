'use client';

import { useState, useEffect, useRef } from 'react';
import { fetcher } from '@/lib/utils';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useEventStream } from '@/hooks/useEventStream';
import Card from '@/components/ui/Card';
import {
  PaperAirplaneIcon,
  ArrowLeftIcon,
  PaperClipIcon,
  CameraIcon,
} from '@heroicons/react/24/outline';

const IMAGE_URL_RE = /^\/uploads\/[^\s]+\.(jpg|jpeg|png|gif|webp)$/i;
const FILE_URL_RE = /^\/uploads\/[^\s]+$/i;

function MessageContent({ message, isMine }: { message: string; isMine: boolean }) {
  const trimmed = message.trim();
  if (IMAGE_URL_RE.test(trimmed)) {
    return (
      <a href={trimmed} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={trimmed}
          alt="Attachment"
          className="max-w-full rounded-lg max-h-48 object-contain"
        />
      </a>
    );
  }
  if (FILE_URL_RE.test(trimmed)) {
    const filename = trimmed.split('/').pop() || 'attachment';
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 underline ${isMine ? 'text-white' : 'text-primary-700'}`}
      >
        <PaperClipIcon className="h-4 w-4 shrink-0" />
        <span className="text-sm break-all">{filename}</span>
      </a>
    );
  }
  return <p className="text-sm whitespace-pre-wrap break-words">{message}</p>;
}

interface Conversation {
  user: { id: string; name: string; email: string; photo: string | null; role: string };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  isOnline: boolean;
  isPinned: boolean;
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: convData, mutate: mutateConvos } = useSWR<{ conversations: Conversation[] }>(
    '/api/chat',
    fetcher,
    { refreshInterval: 15000 } // 15s — keeps presence (online/offline) fresh
  );

  const { data: msgData, mutate: mutateMessages } = useSWR<{ messages: ChatMsg[] }>(
    selectedUserId ? `/api/chat?with=${selectedUserId}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  // Real-time chat updates via SSE — revalidate when a new message arrives
  useEventStream({
    onEvent: (event) => {
      if (event.type === 'chat:message') {
        mutateConvos();
        mutateMessages();
      }
    },
    autoRevalidate: false, // We handle revalidation manually above
  });

  const conversations = convData?.conversations || [];
  const messages = msgData?.messages || [];
  const selectedConv = conversations.find((c) => c.user.id === selectedUserId);
  const currentUserId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleFileUpload = async (file: File) => {
    if (!selectedUserId) return;
    setUploadingFile(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Upload failed');
      }
      const { url } = await uploadRes.json() as { url: string };
      const sendRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: selectedUserId, message: url }),
      });
      if (!sendRes.ok) throw new Error('Failed to send attachment');
      mutateMessages();
      mutateConvos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

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

  const handleSelectConversation = (userId: string) => {
    setSelectedUserId(userId);
    setError(null);
  };

  const handleBack = () => {
    setSelectedUserId(null);
    setError(null);
  };

  // Mobile: full-height chat thread when conversation is selected
  if (selectedUserId && selectedConv) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] md:h-auto md:p-6">
        {/* Mobile: full-screen chat; Desktop: use the two-pane layout below */}
        <div className="md:hidden flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
            <button
              onClick={handleBack}
              className="p-1.5 -ml-1 text-gray-500 hover:text-gray-700 rounded-lg"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div className="w-9 h-9 bg-primary-700 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
              {getInitials(selectedConv.user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-tight">{selectedConv.user.name}</p>
              <p className="text-xs text-gray-500">{selectedConv.user.role}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.map((msg) => {
              const isMine = msg.senderId === currentUserId;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${
                    isMine
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
                  }`}>
                    <MessageContent message={msg.message} isMine={isMine} />
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60' : 'text-gray-400'}`}>
                      {formatTime(msg.createdAt)}
                      {isMine && (
                        <span className={`ml-1.5 ${msg.isRead ? 'text-green-400' : 'text-white/40'}`}>
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

          {/* Error */}
          {error && (
            <div className="mx-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between shrink-0">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
            </div>
          )}

          {uploadingFile && (
            <div className="mx-4 mb-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600 flex items-center gap-2 shrink-0">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full" />
              Uploading…
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-center gap-1.5 p-3 border-t border-gray-100 bg-white shrink-0">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingFile || !selectedUserId}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 shrink-0"
              title="Send photo"
            >
              <CameraIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile || !selectedUserId}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 shrink-0"
              title="Attach file"
            >
              <PaperClipIcon className="h-5 w-5" />
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-3 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors shrink-0"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </form>
        </div>

        {/* Desktop: two-pane layout */}
        <div className="hidden md:flex gap-6 h-[calc(100vh-10rem)]">
          {/* Conversation list */}
          <Card padding={false} className="w-80 shrink-0 flex flex-col">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Conversations</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.map((convo) => (
                <button
                  key={convo.user.id}
                  onClick={() => handleSelectConversation(convo.user.id)}
                  className={`w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 border-b border-gray-50 ${
                    selectedUserId === convo.user.id ? 'bg-primary-50' : ''
                  } ${!convo.isOnline ? 'opacity-70' : ''}`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                      convo.isOnline
                        ? 'bg-primary-700 ring-2 ring-green-400 shadow-[0_0_12px_rgba(74,222,128,0.7)]'
                        : 'bg-gray-400'
                    }`}>
                      {getInitials(convo.user.name)}
                    </div>
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                      convo.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`font-semibold text-sm ${convo.isOnline ? 'text-gray-900' : 'text-gray-500'}`}>{convo.user.name}</p>
                      {convo.lastMessageAt && new Date(convo.lastMessageAt).getTime() > 0 && (
                        <span className="text-[10px] text-gray-400">{formatTime(convo.lastMessageAt)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{convo.lastMessage || 'Tap to start a conversation'}</p>
                    <span className="text-[10px] text-gray-400 uppercase">
                      {convo.user.role} {convo.isOnline ? '• Online' : '• Offline'}
                    </span>
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

          {/* Message thread */}
          <Card padding={false} className="flex-1 flex flex-col">
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
                      <MessageContent message={msg.message} isMine={isMine} />
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
            {uploadingFile && (
              <div className="mx-4 mt-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600 flex items-center gap-2">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full" />
                Uploading…
              </div>
            )}
            <form onSubmit={handleSend} className="p-4 border-t border-gray-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingFile || !selectedUserId}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 shrink-0"
                title="Send photo"
              >
                <CameraIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || !selectedUserId}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 shrink-0"
                title="Attach file"
              >
                <PaperClipIcon className="h-5 w-5" />
              </button>
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
          </Card>
        </div>
      </div>
    );
  }

  // Conversation list view (mobile default, or desktop with no selection)
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">Messages</h1>

      <div className="md:flex gap-6 md:h-[calc(100vh-10rem)]">
        {/* Conversation List */}
        <Card padding={false} className="md:w-80 md:shrink-0 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Conversations</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((convo) => (
              <button
                key={convo.user.id}
                onClick={() => handleSelectConversation(convo.user.id)}
                className={`w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 border-b border-gray-50 active:bg-gray-100 ${!convo.isOnline ? 'opacity-70' : ''}`}
              >
                <div className="relative shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                    convo.isOnline
                      ? 'bg-primary-700 ring-2 ring-green-400 shadow-[0_0_12px_rgba(74,222,128,0.7)]'
                      : 'bg-gray-400'
                  }`}>
                    {getInitials(convo.user.name)}
                  </div>
                  <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                    convo.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`font-semibold text-sm ${convo.isOnline ? 'text-gray-900' : 'text-gray-500'}`}>{convo.user.name}</p>
                    {convo.lastMessageAt && new Date(convo.lastMessageAt).getTime() > 0 && (
                      <span className="text-[10px] text-gray-400">{formatTime(convo.lastMessageAt)}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{convo.lastMessage || 'Tap to start a conversation'}</p>
                  <span className="text-[10px] text-gray-400 uppercase">
                    {convo.user.role} {convo.isOnline ? '• Online' : '• Offline'}
                  </span>
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

        {/* Desktop: empty state placeholder */}
        <Card padding={false} className="hidden md:flex flex-1 items-center justify-center text-gray-400">
          <div className="text-center">
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm">Choose a contact to start messaging</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
