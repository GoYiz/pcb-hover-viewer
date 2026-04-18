export function scopeId(boardId: string, rawId: string) {
  const value = String(rawId || '').trim();
  if (!value) throw new Error(`Cannot scope empty id for board ${boardId}`);
  return `${boardId}::${value}`;
}

export function scopeMaybeId(boardId: string, rawId?: string | null) {
  const value = String(rawId || '').trim();
  return value ? scopeId(boardId, value) : null;
}

export function unscopeId(boardId: string, scoped?: string | null) {
  const value = String(scoped || '');
  const prefix = `${boardId}::`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
