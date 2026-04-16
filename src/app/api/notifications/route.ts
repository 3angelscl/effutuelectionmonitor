import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type') || '';
    const limitParam = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(200, Math.max(1, Number.isNaN(limitParam) ? 50 : limitParam));

    const where: Record<string, unknown> = { userId: user.id };
    if (typeFilter) where.type = typeFilter;

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Notifications error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// Mark notifications as read
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const body = await request.json();
    const { notificationId, markAll, type } = body;

    if (markAll) {
      const where: Record<string, unknown> = { userId: user.id, isRead: false };
      if (type) where.type = type;
      await prisma.notification.updateMany({ where, data: { isRead: true } });
    } else if (notificationId) {
      await prisma.notification.updateMany({
        where: { id: notificationId, userId: user.id },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Notification update error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
