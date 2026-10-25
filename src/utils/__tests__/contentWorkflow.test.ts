import { describe, expect, it } from 'vitest';
import { assigneeCandidates, contentActionAccess, pickDefaultSubmitAction, pickOwningWorkflow } from '../contentWorkflow';
import type { SiteMember, User, Workflow, WorkflowActionInfo } from '../../api/types';

const action = (sourceStatus: string, targetStatus: string): WorkflowActionInfo => ({ sourceStatus, targetStatus });

const workflow = (over: Partial<Workflow>): Workflow => ({
  id: 'wf-1',
  name: '系统工作流',
  status: 'PUBLISHED',
  ...over,
});

describe('pickDefaultSubmitAction', () => {
  it('prefers entering review over other available transitions', () => {
    const actions = [action('DRAFT', 'DRAFT'), action('DRAFT', 'IN_REVIEW')];
    expect(pickDefaultSubmitAction(actions)?.targetStatus).toBe('IN_REVIEW');
  });

  it('falls back to the first transition when none targets IN_REVIEW', () => {
    const actions = [action('IN_REVIEW', 'PUBLISHED'), action('IN_REVIEW', 'DRAFT')];
    expect(pickDefaultSubmitAction(actions)?.targetStatus).toBe('PUBLISHED');
  });

  it('returns undefined for an empty action list (submission stays blocked)', () => {
    expect(pickDefaultSubmitAction([])).toBeUndefined();
  });
});

describe('pickOwningWorkflow', () => {
  it('picks the published workflow that declares the transition', () => {
    const other = workflow({ id: 'wf-draft', status: 'DRAFT' });
    const owner = workflow({
      id: 'wf-2',
      transitions: [{ sourceStatus: 'DRAFT', targetStatus: 'IN_REVIEW' }],
    });
    expect(pickOwningWorkflow([other, owner], action('DRAFT', 'IN_REVIEW'))?.id).toBe('wf-2');
  });

  it('ignores unpublished definitions even when they declare the transition', () => {
    const draftOnly = workflow({
      id: 'wf-draft',
      status: 'DRAFT',
      transitions: [{ sourceStatus: 'DRAFT', targetStatus: 'IN_REVIEW' }],
    });
    const published = workflow({ id: 'wf-published' });
    expect(pickOwningWorkflow([draftOnly, published], action('DRAFT', 'IN_REVIEW'))?.id).toBe('wf-published');
  });

  it('returns undefined when no workflow is published', () => {
    expect(pickOwningWorkflow([workflow({ id: 'wf-draft', status: 'DRAFT' })], action('DRAFT', 'IN_REVIEW')))
      .toBeUndefined();
  });
});

describe('assigneeCandidates', () => {
  it('merges members and users, keeping the role annotation and de-duplicating by username', () => {
    const members = [{
      userId: 'u1', username: 'reviewer.s1', displayName: '审核员', status: 'ACTIVE',
      roles: [{ roleCode: 'reviewer' }],
    }] as unknown as SiteMember[];
    const users = [
      { username: 'reviewer.s1', displayName: '审核员' },
      { username: 'editor.s1', displayName: '编辑' },
    ] as unknown as User[];

    expect(assigneeCandidates(members, users)).toEqual([
      { value: 'reviewer.s1', label: '审核员 (reviewer.s1) · reviewer' },
      { value: 'editor.s1', label: '编辑 (editor.s1)' },
    ]);
  });

  it('degrades to free-text input when both directories are unreadable (empty candidates)', () => {
    expect(assigneeCandidates([], [])).toEqual([]);
  });
});

/**
 * DEF-UI-01：锁定「UI 入口裁剪」与后端 @PreAuthorize 的同源契约。
 * 角色能力来自后端 /roles：editor = read+write、reviewer = read+review、viewer = read。
 */
describe('contentActionAccess', () => {
  it('grants write-only actions to the editor role (read+write, no review)', () => {
    const access = contentActionAccess(true, false);
    expect(access.edit).toBe(true);
    expect(access.pageCanvas).toBe(true);
    expect(access.create).toBe(true);
    expect(access.batchAi).toBe(true);
    expect(access.submitReview).toBe(true);
    // POST /contents/{id}/status 需要 review，editor 不得看到发布/设为草稿
    expect(access.publish).toBe(false);
    expect(access.setDraft).toBe(false);
  });

  it('grants review-only actions to the reviewer role (read+review, no write)', () => {
    const access = contentActionAccess(false, true);
    expect(access.publish).toBe(true);
    expect(access.setDraft).toBe(true);
    expect(access.edit).toBe(false);
    expect(access.pageCanvas).toBe(false);
    expect(access.create).toBe(false);
    expect(access.batchAi).toBe(false);
    expect(access.submitReview).toBe(false);
  });

  it('hides every write action from a read-only viewer', () => {
    const access = contentActionAccess(false, false);
    expect(Object.values(access).every((v) => v === false)).toBe(true);
  });

  it('keeps history and the permissions panel reachable for everyone (read capability, not gated here)', () => {
    // 历史/权限不属于本映射，任何角色都能打开；这里用「全部 false」反证本函数不裁剪它们。
    expect(Object.keys(contentActionAccess(false, false))).not.toContain('history');
    expect(Object.keys(contentActionAccess(false, false))).not.toContain('permissions');
  });
});
