const transitions = {
  DETECTED: ['RENDERING_PREVIEW'],
  RENDERING_PREVIEW: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['RENDERING_FINAL'],
  RENDERING_FINAL: ['RENDERED'],
  RENDERED: ['SCHEDULED'],
  SCHEDULED: ['PUBLISHING', 'RENDERED'],
  PUBLISHING: ['PUBLISHED', 'FAILED_RETRYABLE', 'FAILED_FATAL'],
  FAILED_RETRYABLE: ['PUBLISHING']
};

export function candidate(id, start, end, version = 1) {
  if (!id || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start)
    throw new Error('Intervalo de corte inválido.');
  return Object.freeze({ id, version, start, end, state: 'DETECTED', approvedVersion: null });
}

export function revise(clip, start, end) {
  return candidate(clip.id, start, end, clip.version + 1);
}

export function transition(clip, state, version) {
  if (version !== clip.version || !transitions[clip.state]?.includes(state))
    throw new Error('Transição incompatível com a versão atual.');
  if (['RENDERING_FINAL','RENDERED','SCHEDULED','PUBLISHING','PUBLISHED'].includes(state)
      && clip.approvedVersion !== version)
    throw new Error('Esta versão exige aprovação.');
  return Object.freeze({ ...clip, state, approvedVersion: state === 'APPROVED' ? version : clip.approvedVersion });
}
