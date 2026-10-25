import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Empty, Input, Modal, Space, Table, Tag, Upload, message, type MenuProps } from 'antd';
import { EllipsisOutlined, ExportOutlined, FolderOpenOutlined, HistoryOutlined, ImportOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { visualLayoutApi } from '../api';
import type { ThemeRevision, VisualTheme } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import './Templates.css';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';
import { formatDateTime } from '../utils/datetime';

function ThemesInner() {
  const { siteId } = useSite();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [themes, setThemes] = useState<VisualTheme[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  /** 页面提示层（主题识别规则说明）：可关闭，「?」恢复。 */
  const hint = usePageHint();
  const [historyTheme, setHistoryTheme] = useState<VisualTheme>();
  const [history, setHistory] = useState<ThemeRevision[]>([]);
  const selectedId = params.get('item') || undefined;

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try { setThemes(await visualLayoutApi.themes(siteId)); }
    finally { setLoading(false); }
  }, [siteId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return themes.filter((theme) => !q || `${theme.name} ${theme.description || ''} ${theme.vendor || ''}`.toLowerCase().includes(q));
  }, [themes, keyword]);

  const openFiles = (theme: VisualTheme) => navigate(`/browser?path=${encodeURIComponent(`/application/themes/${theme.name}`)}`);
  const openHistory = async (theme: VisualTheme) => {
    if (!siteId || theme.readOnly) return;
    setHistoryTheme(theme);
    setHistory(await visualLayoutApi.themeHistory(siteId, theme.id));
  };
  const importZip = async (file: File) => {
    if (!siteId) return false;
    setImporting(true);
    try {
      const result = await visualLayoutApi.importTheme(siteId, file);
      message.success(`主题 ${result.manifest.name} 已导入并发布`);
      if (result.warnings.length) message.warning(result.warnings.join('；'));
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('主题导入失败'));
    } finally { setImporting(false); }
    return false;
  };
  const exportZip = async (theme: VisualTheme) => {
    if (!siteId || theme.readOnly) return;
    const blob = await visualLayoutApi.exportTheme(siteId, theme.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${theme.name}-v${theme.currentVersion}.zip`; link.click();
    URL.revokeObjectURL(url);
  };
  const rowMenu = (theme: VisualTheme): MenuProps => ({
    items: [
      { key: 'files', icon: <FolderOpenOutlined />, label: theme.readOnly ? t('查看主题文件') : t('管理主题文件') },
      { key: 'history', icon: <HistoryOutlined />, label: t('Revision 历史'), disabled: theme.readOnly },
      { key: 'export', icon: <ExportOutlined />, label: t('导出 ZIP'), disabled: theme.readOnly },
    ],
    onClick: async ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === 'files') openFiles(theme);
      else if (key === 'history') await openHistory(theme);
      else if (key === 'export') await exportZip(theme);
    },
  });

  return <div className="templates-page">
    <PageHintAlert
      hint={hint}
      message={t('主题由文件资产识别')}
      description={<>{t('请在目录浏览器的')} <b>{t('/application/themes/主题名/')}</b>  {t('管理文件。主题必须包含有效的')} <b>template.ftl</b>  {t('才会出现在此列表和模板设计器中；本页不创建空主题。')}</>}
    />
    <div className="templates-toolbar">
      <Space wrap><Input allowClear prefix={<SearchOutlined />} placeholder={t('搜索主题')} value={keyword} onChange={(event) => setKeyword(event.target.value)} /></Space>
      <Space>
        <PageHintRestore hint={hint} />
        <Button icon={<FolderOpenOutlined />} onClick={() => navigate('/browser?path=%2Fapplication%2Fthemes')}>{t('打开主题文件夹')}</Button>
        <Upload accept=".zip,application/zip" showUploadList={false} beforeUpload={importZip} disabled={importing}>
          <Button type="primary" icon={<ImportOutlined />} loading={importing}>{t('导入主题 ZIP')}</Button>
        </Upload>
      </Space>
    </div>
    <Table<VisualTheme> rowKey="id" loading={loading} dataSource={rows} rowClassName={(row) => row.id === selectedId ? 'ant-table-row-selected' : ''} onRow={(theme) => ({ onClick: () => setParams({ item: theme.id }), onDoubleClick: () => openFiles(theme) })} locale={{ emptyText: <Empty description={t('没有包含 template.ftl 的已发布主题')} /> }} columns={[
      { title: t('主题名称'), dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name), render: (value, theme) => <a onClick={(event) => { event.stopPropagation(); openFiles(theme); }}>{value}</a> },
      { title: t('来源'), width: 130, render: (_, theme) => theme.readOnly ? <Tag color="purple">{t('共享只读')}</Tag> : <Tag color="blue">{t('本站')}</Tag> },
      { title: t('状态'), dataIndex: 'status', width: 130, render: (value, theme) => <Tag color={theme.validity === 'VALID' && value === 'PUBLISHED' ? 'green' : 'gold'}>{value}</Tag> },
      { title: t('描述'), dataIndex: 'description', ellipsis: true, render: (value) => value || '—' },
      { title: t('当前版本'), dataIndex: 'currentVersion', width: 110, render: (value, theme) => `v${theme.pinnedVersion || value}` },
      { title: t('最后修改时间'), dataIndex: 'updatedAt', width: 190, sorter: (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt), render: (value) => formatDateTime(value) },
      { title: '', width: 64, fixed: 'right', render: (_, theme) => <Dropdown menu={rowMenu(theme)} trigger={['click']}><Button type="text" icon={<EllipsisOutlined />} onClick={(event) => event.stopPropagation()} aria-label={`${theme.name} 更多操作`} /></Dropdown> },
    ]} />
    <Modal title={`${historyTheme?.name || ''} · Revision 历史`} open={Boolean(historyTheme)} onCancel={() => setHistoryTheme(undefined)} footer={null} width={820}>
      <Table size="small" rowKey="id" dataSource={history} pagination={false} columns={[
        { title: t('版本'), dataIndex: 'version', width: 90 }, { title: t('作者'), dataIndex: 'author', width: 140 }, { title: t('说明'), dataIndex: 'message' },
        { title: t('时间'), dataIndex: 'createdAt', width: 190, render: (value) => formatDateTime(value) },
        { title: t('操作'), width: 90, render: (_, revision) => <Button type="link" size="small" disabled={revision.version === historyTheme?.currentVersion} onClick={() => Modal.confirm({ title: `恢复到 v${revision.version}？`, content: t('恢复会创建新的不可变 revision。'), onOk: async () => { if (!siteId || !historyTheme) return; await visualLayoutApi.restoreTheme(siteId, historyTheme.id, revision.version); await load(); setHistory(await visualLayoutApi.themeHistory(siteId, historyTheme.id)); message.success(t('主题已恢复为新 revision')); } })}>{t('恢复')}</Button> },
      ]} />
    </Modal>
  </div>;
}

export default function ThemesPage() { return <RequireSite><ThemesInner /></RequireSite>; }