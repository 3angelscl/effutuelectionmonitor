import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireRole, ApiError } from '@/lib/api-auth';
import { parseBody, incidentUpdateSchema, ValidationError } from '@/lib/validations';
import { broadcastEvent } from '@/lib/events';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER']);
    const { id } = await params;

    let data;
    try {
      data = await parseBody(request, incidentUpdateSchema);
    } catch (error) {
      if (error instanceof ValidationError) return error.toResponse();
      throw error;
    }

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, 'Incident not found');
    }

    const updateData: Record<string, unknown> = { status: data.status };

    if (data.status === 'RESOLVED') {
      updateData.resolvedAt = data.resolvedAt ? new Date(data.resolvedAt) : new Date();
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true } },
        station: { select: { id: true, name: true, psCode: true } },
      },
    });

    await logAudit({
      userId: user.id,
      action: 'UPDATE',
      entity: 'Incident',
      entityId: id,
      detail: `Updated incident "${existing.title}" status from ${existing.status} to ${data.status}`,
      metadata: { incidentId: id, oldStatus: existing.status, newStatus: data.status },
    });

    broadcastEvent('incident:updated', {
      incidentId: id,
      newStatus: data.status,
    });

    return NextResponse.json(incident);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Incident PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update incident' }, { status: 500 });
  }
}
