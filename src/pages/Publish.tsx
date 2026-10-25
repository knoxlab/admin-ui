import { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { buildsApi, deployApi, releasesApi } from '../api';
import type { BuildArtifact, DeployTarget, Deployment, Release } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import { useSearchParams } from 'react-router-dom';
import { t } from '../i18n/locale';

function PublishInner() {
  const { siteId } = useSite();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = requestedTab === 'targets' || requestedTab === 'deployments' ? requestedTab : 'releases';
  const [releases, setReleases] = useState<Release[]>([]);
  const [targets, setTargets] = useState<DeployTarget[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [relOpen, setRelOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [depOpen, setDepOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<BuildArtifact[]>([]);

  const load = async () => {
    if (!siteId) return;
    setReleases(await releasesApi.list(siteId));
    setTargets(await deployApi.listTargets(siteId));
    setDeployments(await deployApi.listDeployments(siteId));
  };

  useEffect(() => { void load(); }, [siteId]);

  return (
    <div>
      <Typography.Title level={4}>{t('构建与发布')}</Typography.Title>
      <Tabs
        activeKey={activeTab}
        onChange={(tab) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set('tab', tab);
          setSearchParams(nextParams);
        }}
        items={[
        {
          key: 'releases',
          label: 'Release',
          children: (
            <>
              <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setRelOpen(true)}>{t('创建 Release')}</Button>
              <Table
                rowKey="id"
                dataSource={releases}
                columns={[
                  { title: t('名称'), dataIndex: 'name' },
                  { title: t('状态'), dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
                  { title: t('页面'), render: (_: unknown, r: Release) => r.contents?.length ?? 0 },
                  { title: t('模板版本'), render: (_: unknown, r: Release) => r.templateRevision ?? '-' },
                  { title: t('创建时间'), dataIndex: 'createdAt' },
                  {
                    title: t('操作'),
                    render: (_: unknown, row: Release) => (
                      <Space>
                        <Button size="small" disabled={row.status !== 'DRAFT'} onClick={async () => { await releasesApi.freeze(row.id); message.success(t('已冻结页面与视觉资源')); load(); }}>{t('冻结')}</Button>
                        <Button size="small" type="primary" disabled={row.status !== 'FROZEN' || !row.templateProjectId} onClick={async () => {
                          const job = await buildsApi.create({ projectId: row.templateProjectId!, revision: row.templateRevision || 0, jobType: 'RELEASE', releaseId: row.id });
                          await buildsApi.start(job.id); message.success(t('发布构建已启动'));
                        }}>{t('构建')}</Button>
                        <Button size="small" onClick={async () => { const pages = await releasesApi.pages(row.id); Modal.info({ title: `${row.name} · 冻结页面`, content: <div>{pages.map((p) => <div key={p.pageId}>{p.routePath} · v{p.contentVersion}</div>)}</div> }); }}>{t('页面')}</Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </>
          ),
        },
        {
          key: 'targets',
          label: t('发布目标'),
          children: (
            <>
              <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setTargetOpen(true)}>{t('新建目标')}</Button>
              <Table
                rowKey="id"
                dataSource={targets}
                columns={[
                  { title: t('名称'), dataIndex: 'name' },
                  { title: t('类型'), dataIndex: 'targetType' },
                  { title: t('配置'), dataIndex: 'config', ellipsis: true },
                  {
                    title: t('操作'),
                    render: (_: unknown, row: DeployTarget) => (
                      <Button size="small" danger onClick={async () => { await deployApi.removeTarget(row.id); message.success(t('已删除')); load(); }}>{t('删除')}</Button>
                    ),
                  },
                ]}
              />
            </>
          ),
        },
        {
          key: 'deployments',
          label: t('发布队列'),
          children: (
            <>
              <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setDepOpen(true)}>{t('发起部署')}</Button>
              <Table
                rowKey="id"
                dataSource={deployments}
                columns={[
                  { title: t('状态'), dataIndex: 'status', render: (s: string) => <Tag color={s === 'DEPLOYED' ? 'green' : 'blue'}>{s}</Tag> },
                  { title: t('构建类型'), dataIndex: 'buildType' },
                  { title: 'Release', dataIndex: 'releaseId', ellipsis: true },
                  { title: t('目标'), dataIndex: 'deployTargetId', ellipsis: true },
                  { title: t('健康检查'), render: (_: unknown, r: Deployment) => <Space><Tag>{r.healthCheckBefore || '-'}</Tag><span>→</span><Tag color={r.healthCheckAfter === 'HEALTHY' ? 'green' : r.healthCheckAfter === 'UNHEALTHY' ? 'red' : undefined}>{r.healthCheckAfter || '-'}</Tag></Space> },
                  { title: t('排期'), dataIndex: 'scheduledAt', render: (v?: string) => (v ? <Tag color="orange">{v}</Tag> : '-') },
                  { title: t('结果'), dataIndex: 'note', ellipsis: true },
                  {
                    title: t('操作'),
                    render: (_: unknown, row: Deployment) => (
                      <Space>
                        <Button size="small" type="primary" disabled={row.status !== 'QUEUED'} onClick={async () => { const result = await deployApi.publish(row.id); result.status === 'DEPLOYED' ? message.success(t('发布成功')) : message.error(result.note || t('发布失败')); load(); }}>{t('发布')}</Button>
                        <Button size="small" disabled={row.status !== 'DEPLOYED'} onClick={async () => { const result = await deployApi.rollback(row.id); result.status === 'DEPLOYED' ? message.success(t('已回滚')) : message.error(result.note || t('回滚失败')); load(); }}>{t('回滚')}</Button>
                        <Button size="small" danger disabled={!['QUEUED', 'BUILDING', 'VALIDATING', 'DEPLOYING', 'INDEXING'].includes(row.status)} onClick={async () => { await deployApi.cancel(row.id); message.success(t('已取消')); load(); }}>{t('取消')}</Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </>
          ),
        },
        ]}
      />

      <Modal title={t('创建 Release')} open={relOpen} onCancel={() => setRelOpen(false)}
        onOk={() => (document.getElementById('rel-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose>
        <Form id="rel-form" layout="vertical" onFinish={async (v) => {
          await releasesApi.create(siteId!, v);
          message.success(t('Release 已创建'));
          setRelOpen(false);
          load();
        }}>
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title={t('新建发布目标')} open={targetOpen} onCancel={() => setTargetOpen(false)}
        onOk={() => (document.getElementById('target-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose>
        <Form id="target-form" layout="vertical" initialValues={{ targetType: 'LOCAL_NGINX', config: '{"basePath":"/var/www/html","keepReleases":5}' }}
          onFinish={async (v) => {
            await deployApi.createTarget(siteId!, v);
            message.success(t('目标已创建'));
            setTargetOpen(false);
            load();
          }}>
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="targetType" label={t('类型')} rules={[{ required: true }]}>
            <Select options={[{ value: 'LOCAL_NGINX', label: t('本地 Nginx') }, { value: 'GIT', label: t('Git 仓库') }]} />
          </Form.Item>
          <Form.Item name="config" label={t('配置 JSON')} rules={[{ required: true }]} extra={t('LOCAL_NGINX: basePath、healthCheckUrl；GIT: repositoryUrl、branch、healthCheckUrl。Git URL 不得包含凭据。')}><Input.TextArea rows={5} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={t('发起部署')} open={depOpen} onCancel={() => setDepOpen(false)}
        onOk={() => (document.getElementById('dep-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose>
        <Form id="dep-form" layout="vertical" initialValues={{ buildType: 'FULL' }}
          onFinish={async (v) => {
            const body = { ...v, scheduledAt: v.scheduledAt ? (dayjs.isDayjs(v.scheduledAt) ? v.scheduledAt.toISOString() : v.scheduledAt) : null };
            await deployApi.createDeployment(siteId!, body);
            message.success(t('部署已创建'));
            setDepOpen(false);
            load();
          }}>
          <Form.Item name="releaseId" label="Release" rules={[{ required: true }]}>
            <Select options={releases.filter((r) => r.status === 'FROZEN').map((r) => ({ value: r.id, label: r.name }))} onChange={async (id) => setArtifacts(await releasesApi.artifacts(id))} />
          </Form.Item>
          <Form.Item name="artifactId" label={t('构建产物')} rules={[{ required: true }]}>
            <Select options={artifacts.map((a) => ({ value: a.id, label: `${a.fileCount} files · ${a.inputDigest?.slice(0, 12) || a.id}` }))} />
          </Form.Item>
          <Form.Item name="deployTargetId" label={t('目标')} rules={[{ required: true }]}>
            <Select options={targets.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="buildType" label={t('构建类型')}>
            <Select options={[{ value: 'FULL' }, { value: 'INCREMENTAL' }]} />
          </Form.Item>
          <Form.Item name="scheduledAt" label={t('排期时间')} extra={t('留空表示立即发布；填写后将自动在到期时发布（可在发布队列手工提前触发）')}>
            <DatePicker showTime style={{ width: '100%' }} allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function PublishPage() {
  return <RequireSite><PublishInner /></RequireSite>;
}
