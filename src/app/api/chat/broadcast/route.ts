import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { createRateLimiter } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { sendBroadcastEmail } from '@/lib/email';
import { sendPushToAllAgents } from '@/lib/push';
import { sanitizeAndLimit } from '@/lib/sanitize';

// 5 broadcasts per hour per admin
const chatBroadcastRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

/**
 * GET /api/chat/broadcast
 * Returns the admin's recent broadcast history (from ActivityLog).
 */
export async function GET() {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER']);

    const logs = await prisma.activityLog.findMany({
      where: { userId: user.id, title: 'CREATE Broadcast' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, detail: true, metadata: true, createdAt: true },
    });

    const broadcasts = logs.map((log) => {
      let sentTo = 0;
      let message = log.detail || '';
      try {
        const meta = JSON.parse(log.metadata || '{}');
        sentTo = meta.recipientCount || 0;
        if (meta.messagePreview) message = meta.messagePreview;
      } catch {
        // use defaults
      }
      return { id: log.id, message, sentTo, createdAt: log.createdAt };
    });

    return NextResponse.json({ broadcasts });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    return NextResponse.json({ error: 'Failed to get broadcast history' }, { status: 500 });
  }
}

/**
 * POST /api/chat/broadcast
 * Sends a broadcast notification to all agents without creating individual
 * ChatMessage records (which would bloat the admin's conversation list).
 */
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
    const sanitizedMessage = sanitizeAndLimit(trimmedMessage, 5000);

    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Message must contain visible text' }, { status: 400 });
    }

    const agents = await prisma.user.findMany({
      where: { role: 'AGENT', deletedAt: null },
      select: { id: true, email: true },
    });

    if (agents.length === 0) {
      return NextResponse.json({ success: true, sentTo: 0 });
    }

    const { success } = await chatBroadcastRateLimiter.check(user.id);
    if (!success) {
      throw new ApiError(429, 'Broadcast limit reached (max 5 per hour). Please try again later.');
    }

    // Deliver via Notification only — avoids creating 150+ individual ChatMessage
    // records that would flood the admin's conversation sidebar.
    await prisma.notification.createMany({
      data: agents.map((agent) => ({
        userId: agent.id,
        type: 'BROADCAST',
        title: `Broadcast from ${adminName}`,
        message: sanitizedMessage,
        link: '/agent/chat',
      })),
    });

    // Fire-and-forget: email + push to all agents
    const agentEmails = agents.map((a) => a.email).filter(Boolean) as string[];
    if (agentEmails.length > 0) {
      sendBroadcastEmail({
        recipients: agentEmails,
        senderName: adminName,
        subject: 'New broadcast message',
        message: sanitizedMessage,
      }).catch(() => {});
    }
    sendPushToAllAgents({
      title: `Broadcast from ${adminName}`,
      body: sanitizedMessage.slice(0, 120),
      url: '/agent/chat',
      tag: 'broadcast',
    }).catch(() => {});

    await logAudit({
      userId: adminId,
      action: 'CREATE',
      entity: 'Broadcast',
      entityId: `bulk_${Date.now()}`,
      detail: `Sent broadcast to ${agents.length} agents: "${sanitizedMessage.slice(0, 50)}${sanitizedMessage.length > 50 ? '...' : ''}"`,
      metadata: { recipientCount: agents.length, messagePreview: sanitizedMessage },
    });

    return NextResponse.json({ success: true, sentTo: agents.length });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Broadcast error:', error);
    return NextResponse.json({ error: 'Failed to send broadcast' }, { status: 500 });
  }
}
