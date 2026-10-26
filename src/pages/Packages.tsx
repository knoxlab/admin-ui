import { useEffect, useState } from 'react';
import {
  Alert, Button, Descriptions, Modal, Radio, Space, Table, Tag, Typography, Upload, message,
} from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { packagesApi } from '../api';
import type { SitePackage, SitePackagePrecheckReport, SitePackageSignatureInfo } from '../api/types';
import { useSite } from '../context/SiteContext';
import { isSystemAdmin, useAuth } from '../auth/AuthContext';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';

/** 预检报告 + 待导入文件：两步导入的中间态（FR-PACKAGE-005 先看报告，再确认落库）。 */
interface PendingImport {
  file: File;
  report: SitePackagePrecheckReport;
}

const SEVERITY_COLOR: Record<string, string> = {
  BLOCKING: 'red',
  CONFIRMABLE: 'orange',
  WARN: 'gold',
};

/** 冲突处理策略的说明（保持中文原文，渲染时经 t() 翻译）。 */
const STRATEGY_HINT: Record<string, string> = {
  RENAME: '重命名站点键：保留既有站点，新建带 -2 后缀的站点',
  OVERWRITE: '覆盖同名对象：以包内定义替换既有对象，风险较高',
  SKIP: '跳过冲突对象：仅导入其余不冲突的内容',
};

function SeverityTag({ severity }: { severity: string }) {
  return <Tag color={SEVERITY_COLOR[severity] ?? 'default'}>{severity}</Tag>;
}

/** 签名附注：与标签文案重复时省略，其余原因（如「未解析清单」）照实展示。 */
function signatureNote(info: SitePackageSignatureInfo | undefined, unsignedLabel: string): string {
  const detail = info?.detail ?? '';
  if (!detail) return '';
  if (!info?.present && detail.startsWith(unsignedLabel)) return '';
  return ` ${detail}`;
}

function PackagesInner() {
  const { siteId, refresh } = useSite();
  const { me } = useAuth();
  const admin = isSystemAdmin(me);
  const [list, setList] = useState<SitePackage[]>([]);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  /** 页面提示层（非管理员权限说明）：可关闭，「?」恢复。 */
  const hint = usePageHint();

  const load = async () => {
    if (!admin) return; // 列表接口仅系统管理员可读：非管理员不发请求，避免 403 噪音
    setList(await packagesApi.list());
  };
  useEffect(() => { void load(); }, [admin]);

  const report = pending?.report;
  const blocked = !!report?.blocked;
  const confirmable = !!report?.confirmable && !blocked;
  const canSubmit = !!pending && !blocked && (!confirmable || !!strategy);

  const openPrecheck = async (file: File) => {
    try {
      const pre = await packagesApi.precheck(file);
      setPending({ file, report: pre });
      setStrategy(pre.resolutions[0]?.strategy ?? null);
    } catch (e) {
      const detail = axios.isAxiosError(e)
        ? (e.response?.data as { message?: string; code?: string } | undefined)
        : undefined;
      message.error(detail?.message || t('预检失败'));
    }
  };

  const doImport = async () => {
    if (!pending) return;
    setImporting(true);
    try {
      const resolution = confirmable
        ? report?.resolutions.find((r) => r.strategy === strategy)
        : undefined;
      const result = await packagesApi.import(pending.file, resolution?.strategy, resolution?.token);
      message.success(t('导入成功：站点 {siteKey}', { siteKey: result.siteKey }));
      setPending(null);
      await load();
      refresh();
    } catch (e) {
      const detail = axios.isAxiosError(e)
        ? (e.response?.data as { message?: string; code?: string } | undefined)
        : undefined;
      message.error(detail?.message || t('导入失败'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{t('站点包')}</Typography.Title>
        <Space>
          <PageHintRestore hint={hint} />
          <Upload
            showUploadList={false}
            accept=".zip"
            disabled={!admin}
            beforeUpload={(file) => { void openPrecheck(file); return Upload.LIST_IGNORE; }}
          >
            <Button icon={<UploadOutlined />} type="primary" disabled={!admin}>{t('导入 ZIP')}</Button>
          </Upload>
          <Button
            icon={<DownloadOutlined />}
            disabled={!siteId || !admin}
            onClick={async () => {
              const blob = await packagesApi.export(siteId!);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'site-package.zip';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('导出当前站点')}
          </Button>
        </Space>
      </Space>

      {!admin && (
        <PageHintAlert
          hint={hint}
          message={t('站点包导入/导出仅系统管理员可操作')}
        />
      )}

      <Table
        rowKey="id"
        dataSource={list}
        locale={{ emptyText: admin ? t('暂无数据') : t('站点包列表仅系统管理员可见') }}
        columns={[
          { title: 'Package ID', dataIndex: 'packageId' },
          { title: t('名称'), dataIndex: 'name' },
          { title: t('版本'), dataIndex: 'version' },
          {
            title: t('导入站点'),
            dataIndex: 'importedSiteId',
            ellipsis: true,
            render: (id?: string) => id
              ? <Typography.Text copyable={{ text: id }}>{id}</Typography.Text>
              : '—',
          },
          { title: t('导入时间'), dataIndex: 'importedAt' },
        ]}
      />

      <Modal
        open={!!pending}
        width={760}
        title={t('导入预检报告')}
        okText={blocked ? t('已阻断') : t('确认导入')}
        okButtonProps={{ disabled: !canSubmit, loading: importing }}
        onOk={doImport}
        onCancel={() => { setPending(null); setStrategy(null); }}
      >
        {report && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {blocked && (
              <Alert
                type="error"
                showIcon
                message={t('站点包未通过校验，导入已阻断（不留任何半成品）')}
                description={(
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {report.violations
                      .filter((v) => v.severity === 'BLOCKING')
                      .map((v, i) => <li key={`${v.code}-${i}`}>{`${v.object}：${v.detail}`}</li>)}
                  </ul>
                )}
              />
            )}

            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Package ID">{report.packageId || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('版本')}>{report.version || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('名称')}>{report.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="siteKey">{report.siteKey || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('CMS 版本要求')}>
                {report.cmsVersionRange || '-'}
                {' '}
                <Tag color={report.versionCompatible ? 'green' : 'red'}>
                  {report.versionCompatible ? t('兼容') : t('不兼容')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('签名')}>
                {report.signature?.present
                  ? <Tag color={report.signature.verified ? 'green' : 'red'}>
                      {report.signature.keyId || report.signature.algorithm}
                    </Tag>
                  : <Tag>{t('未签名')}</Tag>}
                {/* 未签名时后端 detail 亦以「未签名」开头，避免与标签重复；其余原因（如「未解析清单」）照实展示 */}
                {signatureNote(report.signature, t('未签名'))}
              </Descriptions.Item>
              <Descriptions.Item label={t('文件数')}>{report.fileCount}</Descriptions.Item>
              <Descriptions.Item label={t('包摘要')}>
                <Typography.Text style={{ fontSize: 12 }} ellipsis>{report.packageDigest}</Typography.Text>
              </Descriptions.Item>
            </Descriptions>

            {report.violations.some((v) => v.severity === 'WARN') && (
              <Alert
                type="warning"
                showIcon
                message={t('存在告警项（不阻断导入）')}
                description={(
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {report.violations
                      .filter((v) => v.severity === 'WARN')
                      .map((v, i) => <li key={`${v.code}-w-${i}`}>{`${v.object}：${v.detail}`}</li>)}
                  </ul>
                )}
              />
            )}

            {report.conflicts.length > 0 && (
              <Table
                size="small"
                rowKey={(c) => `${c.type}-${c.objectKey}`}
                pagination={false}
                dataSource={report.conflicts}
                columns={[
                  { title: t('类别'), dataIndex: 'type', width: 110 },
                  { title: t('对象'), dataIndex: 'objectKey', width: 200, ellipsis: true },
                  {
                    title: t('级别'),
                    dataIndex: 'severity',
                    width: 130,
                    render: (s: string) => <SeverityTag severity={s} />,
                  },
                  { title: t('说明'), dataIndex: 'detail' },
                ]}
              />
            )}

            {confirmable && (
              <Alert
                type="warning"
                showIcon
                message={t('存在可确认的冲突，请选择处理策略后导入')}
                description={(
                  <Radio.Group
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value as string)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}
                  >
                    {report.resolutions.map((r) => (
                      <Radio key={r.strategy} value={r.strategy}>
                        {`${r.strategy}｜${t(STRATEGY_HINT[r.strategy] ?? '按服务端建议处理冲突')}`}
                      </Radio>
                    ))}
                  </Radio.Group>
                )}
              />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}

/**
 * 站点包页**不套 RequireSite**：导入包正是「尚无站点」时创建首个站点的入口，
 * 套上会变成鸡生蛋——列表为空时反而看不到导入按钮。
 * 仅「导出当前站点」需要 siteId，按钮已按 `!siteId` 禁用。
 */
export default function PackagesPage() {
  return <PackagesInner />;
}
