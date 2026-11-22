import test from 'node:test';
import assert from 'node:assert/strict';
import { candidate, revise, transition } from '../lib/studio/clip.mjs';

test('um candidato só chega à publicação pela revisão da versão', () => {
  let clip = candidate('entrevista', 12, 52);
  for (const state of ['RENDERING_PREVIEW','PENDING_REVIEW','APPROVED','RENDERING_FINAL','RENDERED','SCHEDULED','PUBLISHING','PUBLISHED']) {
    if (!clip.approvedVersion) {
      for (const target of ['SCHEDULED','PUBLISHING','PUBLISHED'])
        assert.throws(() => transition(clip, target, 1));
    }
    clip = transition(clip, state, 1);
  }
  const edit = revise(clip, 14, 52);
  assert.equal(clip.start, 12);
  assert.equal(edit.approvedVersion, null);
  assert.throws(() => transition(edit, 'RENDERING_PREVIEW', 1));
});

test('um corte rejeitado não pode ser renderizado nem agendado', () => {
  let clip = candidate('exemplo', 15, 60);
  for (const state of ['RENDERING_PREVIEW','PENDING_REVIEW','REJECTED'])
    clip = transition(clip, state, 1);
  for (const target of ['APPROVED','RENDERING_FINAL','SCHEDULED','PUBLISHING'])
    assert.throws(() => transition(clip, target, 1));
});
