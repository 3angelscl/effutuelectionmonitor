import prisma from '@/lib/prisma';

interface AuditEntry {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit({ userId, action, entity, entityId, detail, metadata }: AuditEntry) {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        type: 'ADMIN_MUTATION',
        title: `${action} ${entity}`,
        detail: detail || `${action} ${entity} (${entityId})`,
        metadata: metadata ? JSON.stringify({ action, entity, entityId, ...metadata }) : JSON.stringify({ action, entity, entityId }),
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}
