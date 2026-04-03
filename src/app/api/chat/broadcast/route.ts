import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { createRateLimiter } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

// 5 broadcast per hour per admin
const chatBroadcastRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER']);

    const { message } = await request.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (message.length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 characters)' }, { status: 400 });
    }

    const adminId = user.id;
    const adminName = user.name;
    const trimmedMessage = message.trim();

    // Get all agents
    const agents = await prisma.user.findMany({
      where: { role: 'AGENT' },
      select: { id: true },
    });

    if (agents.length === 0) {
      return NextResponse.json({ success: true, sentTo: 0 });
    }

    const { success } = await chatBroadcastRateLimiter.check(user.id);
    if (!success) {
      throw new ApiError(429, 'Broadcast limit reached (max 5 per hour). Please try again later.');
    }

    // Create a ChatMessage for each agent
    await prisma.chatMessage.createMany({
      data: agents.map((agent) => ({
        senderId: adminId,
        receiverId: agent.id,
        message: trimmedMessage,
      })),
    });

    // Create a Notification for each agent
    await prisma.notification.createMany({
      data: agents.map((agent) => ({
        userId: agent.id,
        type: 'BROADCAST',
        title: `Broadcast from ${adminName}`,
        message: trimmedMessage.slice(0, 100),
        link: '/agent/chat',
      })),
    });

    await logAudit({
      userId: adminId,
      action: 'CREATE',
      entity: 'Broadcast',
      entityId: `bulk_${Date.now()}`,
      detail: `Sent broadcast message to ${agents.length} agents: "${trimmedMessage.slice(0, 50)}..."`,
      metadata: { recipientCount: agents.length, messagePreview: trimmedMessage.slice(0, 50) },
    });

    return NextResponse.json({ success: true, sentTo: agents.length });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Broadcast error:', error);
    return NextResponse.json({ error: 'Failed to send broadcast' }, { status: 500 });
  }
}
