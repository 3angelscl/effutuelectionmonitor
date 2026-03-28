import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, apiHandler } from '@/lib/api-auth';
import { parseBody, chatSendSchema, ValidationError } from '@/lib/validations';
import { broadcastEvent } from '@/lib/events';

export const GET = apiHandler(async (request: Request) => {
  const { user: currentUser } = await requireAuth();
  const userId = currentUser.id;

  const { searchParams } = new URL(request.url);
  const withUserId = searchParams.get('with');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  if (withUserId) {
    // Get messages between current user and specified user
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: withUserId },
          { senderId: withUserId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        message: true,
        isRead: true,
        createdAt: true,
        sender: { select: { id: true, name: true, photo: true } },
      },
    });

    // Mark unread messages as read
    await prisma.chatMessage.updateMany({
      where: {
        senderId: withUserId,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return NextResponse.json({ messages: messages.reverse() });
  }

  // Get conversation list
  const sentMessages = await prisma.chatMessage.findMany({
    where: { senderId: userId },
    orderBy: { createdAt: 'desc' },
    distinct: ['receiverId'],
    include: {
      receiver: { select: { id: true, name: true, email: true, photo: true, role: true } },
    },
  });

  const receivedMessages = await prisma.chatMessage.findMany({
    where: { receiverId: userId },
    orderBy: { createdAt: 'desc' },
    distinct: ['senderId'],
    include: {
      sender: { select: { id: true, name: true, email: true, photo: true, role: true } },
    },
  });

  const conversations = new Map<string, {
    user: { id: string; name: string; email: string; photo: string | null; role: string };
    lastMessage: string;
    lastMessageAt: Date;
    unreadCount: number;
  }>();

  for (const msg of sentMessages) {
    const key = msg.receiverId;
    if (!conversations.has(key) || msg.createdAt > conversations.get(key)!.lastMessageAt) {
      conversations.set(key, {
        user: msg.receiver,
        lastMessage: msg.message,
        lastMessageAt: msg.createdAt,
        unreadCount: 0,
      });
    }
  }

  for (const msg of receivedMessages) {
    const key = msg.senderId;
    const existing = conversations.get(key);
    if (!existing || msg.createdAt > existing.lastMessageAt) {
      conversations.set(key, {
        user: msg.sender,
        lastMessage: msg.message,
        lastMessageAt: msg.createdAt,
        unreadCount: 0,
      });
    }
  }

  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ['senderId'],
    where: { receiverId: userId, isRead: false },
    _count: true,
  });

  for (const uc of unreadCounts) {
    const conv = conversations.get(uc.senderId);
    if (conv) conv.unreadCount = uc._count;
  }

  // Include agents that admin hasn't chatted with yet
  if (currentUser.role === 'ADMIN') {
    const agents = await prisma.user.findMany({
      where: { role: 'AGENT' },
      select: { id: true, name: true, email: true, photo: true, role: true },
    });
    for (const agent of agents) {
      if (!conversations.has(agent.id)) {
        conversations.set(agent.id, {
          user: agent,
          lastMessage: '',
          lastMessageAt: new Date(0),
          unreadCount: 0,
        });
      }
    }
  }

  const conversationList = Array.from(conversations.values())
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

  return NextResponse.json({ conversations: conversationList });
});

export const POST = apiHandler(async (request: Request) => {
  const { user: currentUser } = await requireAuth();

  let data;
  try {
    data = await parseBody(request, chatSendSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const chatMessage = await prisma.chatMessage.create({
    data: {
      senderId: currentUser.id,
      receiverId: data.receiverId,
      message: data.message,
    },
    include: {
      sender: { select: { id: true, name: true, photo: true } },
    },
  });

  // Create notification for receiver
  await prisma.notification.create({
    data: {
      userId: data.receiverId,
      type: 'CHAT',
      title: `New message from ${currentUser.name}`,
      message: data.message.slice(0, 100),
      link: '/admin/chat',
    },
  });

  // Broadcast real-time events
  broadcastEvent('chat:message', {
    senderId: currentUser.id,
    receiverId: data.receiverId,
  }, { targetUserId: data.receiverId });

  broadcastEvent('notification:new', {
    userId: data.receiverId,
    type: 'CHAT',
  }, { targetUserId: data.receiverId });

  return NextResponse.json(chatMessage, { status: 201 });
});
