import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Descriptions, Modal, Skeleton, Space, Tag, Typography } from 'antd';
import { contentsApi, modelsApi } from '../api';
import { QUIET } from '../api/client';
import type { ContentItem, ContentType, ContentVersion, WorkflowTask } from '../api/types';
import ContentReadOnlyView from './ContentReadOnlyView';
import { formatDateTime } from '../utils/datetime';
import { t } from '../i18n/locale';

/**
 * 工作流待办「点击标题 → 内容只读审核弹窗」。
 *
 * <p>审核人看到的内容必须是**提交审核的那一版**（`task.contentVersion`），而未必是当前最新版
 * —— 提交后编辑又保存了新版本时，若直接展示最新版，审核人就会审批另一份内容。因此这里按任务
 * 记录里的版本号取快照，取不到（历史版本被清理/任务版本为空）才回退到最新版并明确标注。</p>
 *
 * <p>字段按内容模型 (`contentTypeId`) 的表单布局与顺序只读渲染，见 `ContentReadOnlyView`。</p>
 */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  IN_REVIEW: '审核中',
  APPROVED: '已通过',
  PUBLISHED: '已发布',
  SCHEDULED: '已排期',
  WITHDRAWN: '已撤回',
  ARCHIVED: '已归档',
};

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: 'success',
  IN_REVIEW: 'processing',
  APPROVED: 'cyan',
  SCHEDULED: 'cyan',
  DRAFT: 'warning',
};

/** 版本的 `field_values` 是 JSON 串；脏数据不应让弹窗直接空掉，解析失败按「无字段值」处理。 */
export function parseFieldValues(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** 选取要审核的版本：优先任务记录的提交版本，缺失时回退最新版。 */
export function pickReviewVersion(
  versions: ContentVersion[] = [],
  wanted?: number | null,
): ContentVersion | undefined {
  if (!versions.length) return undefined;
  if (typeof wanted === 'number' && Number.isInteger(wanted)) {
    const hit = versions.find((v) => v.version === wanted);
    if (hit) return hit;
  }
  return versions.reduce((max, v) => (v.version > max.version ? v : max), versions[0]);
}

export type ContentReviewModalProps = {
  open: boolean;
  siteId: string;
  task: WorkflowTask | null;
  onClose: () => void;
};

export default function ContentReviewModal({ open, siteId, task, onClose }: ContentReviewModalProps) {
  const [item, setItem] = useState<ContentItem | null>(null);
  const [type, setType] = useState<ContentType | null>(null);
  const [version, setVersion] = useState<ContentVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentId = task?.contentItemId;
  const wantedVersion = task?.contentVersion;

  useEffect(() => {
    if (!open || !contentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItem(null);
    setType(null);
    setVersion(null);
    (async () => {
      try {
        const [loadedItem, versions] = await Promise.all([
          // 内容可能已被删除：这是审核人点开待办时的**预期内**降级，弹窗自己给提示，
          // 关掉全局兜底 toast，避免同一次失败弹两条。
          contentsApi.get(contentId, QUIET),
          contentsApi.versions(contentId, QUIET),
        ]);
        if (cancelled) return;
        const chosen = pickReviewVersion(versions, wantedVersion) ?? null;
        // 模型 id 以条目为准（任务上的 contentTypeId 只是列表展示用的冗余），缺失时再回退任务。
        const typeId = loadedItem.contentTypeId || task?.contentTypeId;
        const loadedType = typeId ? await modelsApi.get(siteId, typeId) : null;
        if (cancelled) return;
        setItem(loadedItem);
        setVersion(chosen);
        setType(loadedType);
      } catch {
        if (!cancelled) setError(t('内容加载失败：可能已被删除或您没有查看权限。'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, contentId, wantedVersion, siteId, task?.contentTypeId]);

  const values = useMemo(() => parseFieldValues(version?.fieldValues), [version]);
  const title = version?.title || item?.title || task?.contentTitle || '';
  const versionFallback = Boolean(
    version && typeof wantedVersion === 'number' && version.version !== wantedVersion,
  );
  /** 提交审核后又保存了新版本：审核人必须知道自己在看的是**提交时**的那一版。 */
  const newerExists = Boolean(version && item && item.currentVersion > version.version);

  return (
    <Modal
      title={t('内容审核')}
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{t('关闭')}</Button>}
      width={920}
      destroyOnHidden
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
    >
      {loading && <Skeleton active paragraph={{ rows: 8 }} />}
      {!loading && error && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="warning" showIcon message={error} />
          {task && (
            <Typography.Text type="secondary">
              {t('审核任务仍可处理：内容编号')} {task.contentItemId}
            </Typography.Text>
          )}
        </Space>
      )}
      {!loading && !error && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label={t('标题')} span={2}>
              <Typography.Text strong>{title || '—'}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('内容类型')}>
              {type?.name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('内容状态')}>
              {item?.status
                ? <Tag color={STATUS_COLORS[item.status] || 'default'}>{t(STATUS_LABELS[item.status] || item.status)}</Tag>
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('审核版本')}>
              {version ? `v${version.version}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('版本作者')}>
              {version?.createdByName || version?.createdBy || '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('提交人')}>{task?.submitter || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('提交时间')}>
              {task?.createdAt ? formatDateTime(task.createdAt) : '—'}
            </Descriptions.Item>
            {item?.routePath && (
              <Descriptions.Item label={t('页面路径')} span={2}>{item.routePath}</Descriptions.Item>
            )}
            {item?.templatePath && (
              <Descriptions.Item label={t('页面模板')} span={2}>{item.templatePath}</Descriptions.Item>
            )}
            {version?.title && item?.title && version.title !== item.title && (
              <Descriptions.Item label={t('当前标题')} span={2}>{item.title}</Descriptions.Item>
            )}
          </Descriptions>

          {newerExists && (
            <Alert
              type="warning"
              showIcon
              message={t('提交审核后该内容又有更新')}
              description={`${t('本弹窗展示提交审核时的版本')} v${version?.version} · ${t('当前版本')} v${item?.currentVersion}`}
            />
          )}

          {versionFallback && (
            <Alert
              type="info"
              showIcon
              message={t('未找到提交审核时的版本，已显示最新版本')}
              description={`${t('审核版本')} v${wantedVersion} · ${t('当前显示')} v${version?.version}`}
            />
          )}

          {type
            ? <ContentReadOnlyView type={type} siteId={siteId} values={values} />
            : <Alert type="warning" showIcon message={t('未找到内容模型，无法按表单布局显示字段。')} />}
        </Space>
      )}
    </Modal>
  );
}
