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
  let metadataStr: string;
  try {
    metadataStr = JSON.stringify({ action, entity, entityId, ...(metadata ?? {}) });
  } catch {
    metadataStr = JSON.stringify({ action, entity, entityId });
  }

  try {
    await prisma.activityLog.create({
      data: {
        userId,
        type: action ? action.toUpperCase().replace(/\s+/g, '_') : 'ADMIN_MUTATION',
        title: `${action} ${entity}`,
        detail: detail || `${action} ${entity} (${entityId})`,
        metadata: metadataStr,
      },
    });
  } catch (error) {
    // Audit failures must not silently disappear — log with full context
    // so they surface in production monitoring / log aggregators.
    console.error('[AUDIT FAILURE] Failed to write audit log:', {
      action,
      entity,
      entityId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
