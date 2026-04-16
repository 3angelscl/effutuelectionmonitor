const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  SUBMIT: 'Submitted',
  LOGIN: 'Logged in',
  LOGOUT: 'Logged out',
};

const ENTITY_LABELS: Record<string, string> = {
  Candidate: 'candidate',
  Election: 'election',
  ElectionResult: 'election result',
  PollingStation: 'polling station',
  User: 'user',
  Voter: 'voter',
};

function normalizeAction(action: string): string {
  return action.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeEntity(entity: string): string {
  return ENTITY_LABELS[entity] || entity.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Turn audit/action text into a human-readable label.
 * If the input already looks readable, it is returned unchanged.
 */
export function formatActivityTitle(title: string): string {
  const trimmed = title.trim();
  const match = trimmed.match(/^([A-Za-z][A-Za-z\s_-]*)\s+(.+)$/);
  if (!match) return trimmed;

  const action = normalizeAction(match[1]);
  const entity = match[2].trim();
  const actionLabel = ACTION_LABELS[action];

  if (!actionLabel) return trimmed;
  return `${actionLabel} ${normalizeEntity(entity)}`;
}

