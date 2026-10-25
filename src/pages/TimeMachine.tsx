import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  List,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd';
import { ClockCircleOutlined, HistoryOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { categoriesApi, modelsApi, timeMachineApi } from '../api';
import { setReadOnlySnapshot } from '../api/client';
import type { Category, ContentType, TimeMachineSnapshot, TimeMachineSnapshotItem } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';
import { formatDateTime } from '../utils/datetime';
import { collectFields } from '../utils/contentFields';
import { versionSnapshotRows } from '../utils/contentVersion';
import {
  allCategoryKeys,
  categoryScopeIds,
  categoryTreeOptions,
  emptySnapshotReason,
  filterSnapshot,
  subtreeCounts,
  timePointInFuture,
  type CategoryTreeOption,
} from '../utils/timeMachine';
import './TimeMachine.css';

/** 左栏「全部分类」节点：不按栏目过滤（区别于某个真实栏目 id）。 */
const ALL_CATEGORIES = '__all__';

/** 列表/详情里展示的时间：该时刻生效版本的保存时间（不是条目的 updated_at）。 */
function versionTime(item: TimeMachineSnapshotItem): string {
  return formatDateTime(item.versionCreatedAt);
}

function TimeMachineInner() {
  const { siteId } = useSite();
  const [atPoint, setAtPoint] = useState<Dayjs>(() => dayjs());
  const [snapshot, setSnapshot] = useState<TimeMachineSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>(ALL_CATEGORIES);
  const [expandedCatKeys, setExpandedCatKeys] = useState<string[]>([ALL_CATEGORIES]);
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 只读快照提示：可关闭；查询新的时间点（进入新快照上下文）时自动重新显示。 */
  const hint = usePageHint();
  /** 连点「查询」时用递增令牌丢弃过期响应，避免先发的慢响应覆盖后发的结果。 */
  const requestRef = useRef(0);

  const load = useCallback(
    async (point: Dayjs) => {
      if (!siteId) return;
      const token = ++requestRef.current;
      setLoading(true);
      // FR-CV-VER-010：一进入只读浏览就置位，页面拿到数据前写请求也不该被放行
      setReadOnlySnapshot(point.toDate().toISOString());
      try {
        const data = await timeMachineApi.at(siteId, point.toDate().toISOString());
        if (token !== requestRef.current) return;
        setSnapshot(data);
        // 以服务端回显的时刻为准：前端时区换算若与后端不一致，状态栏显示的必须是真正查的那一刻
        setReadOnlySnapshot(data.at);
      } catch {
        if (token === requestRef.current) message.error(t('加载历史快照失败'));
      } finally {
        if (token === requestRef.current) setLoading(false);
      }
    },
    [siteId],
  );

  useEffect(() => {
    void load(atPoint);
    // 离开页面即撤销只读标记：只读是「这一次浏览」的属性，不该残留成会话状态
    return () => setReadOnlySnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    void Promise.all([categoriesApi.tree(siteId), modelsApi.list(siteId)])
      .then(([catRows, typeRows]) => {
        if (!active) return;
        setCats(catRows);
        setTypes(typeRows);
      })
      .catch(() => {
        // 栏目树只用于左栏导航，拉不到不影响快照浏览本身，故不弹错误提示
        if (active) {
          setCats([]);
          setTypes([]);
        }
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const scope = useMemo(
    () => categoryScopeIds(cats, selectedCatId === ALL_CATEGORIES ? null : selectedCatId),
    [cats, selectedCatId],
  );
  const rows = useMemo(
    () => filterSnapshot(snapshot?.items || [], { categoryIds: scope, keyword }),
    [snapshot, scope, keyword],
  );
  const counts = useMemo(() => subtreeCounts(cats, snapshot?.items || []), [cats, snapshot]);
  const emptyReason = useMemo(() => emptySnapshotReason(snapshot), [snapshot]);
  const inFuture = useMemo(() => timePointInFuture(snapshot?.at), [snapshot]);

  // 栏目树异步到达：显式展开，避免「点进来只看到一个折叠的根节点」
  useEffect(() => {
    setExpandedCatKeys([ALL_CATEGORIES, ...allCategoryKeys(cats)]);
  }, [cats]);

  // 列表变化后保持「详情永远指向列表里的一行」：原选中行被筛掉时自动落到第一行
  useEffect(() => {
    if (!rows.length) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!rows.some((r) => r.id === selectedId)) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);
  const selectedFields = useMemo(
    () => collectFields(selected ? types.find((ty) => ty.id === selected.contentTypeId) : undefined),
    [selected, types],
  );
  const selectedFieldRows = useMemo(
    () => (selected ? versionSnapshotRows({ fieldValues: selected.fieldValues }, selectedFields) : []),
    [selected, selectedFields],
  );
  const treeData = useMemo(() => {
    const total = snapshot?.items.length ?? 0;
    // 节点标题带上「该时刻（含子树）的条数」，与点击后的筛选结果一致
    const decorate = (nodes: CategoryTreeOption[]): CategoryTreeOption[] =>
      nodes.map((node) => ({
        ...node,
        title: `${node.title} (${counts.get(node.key) ?? 0})`,
        children: node.children ? decorate(node.children) : undefined,
      }));
    return [
      {
        key: ALL_CATEGORIES,
        title: `${t('全部分类')} (${total})`,
        children: decorate(categoryTreeOptions(cats)),
      },
    ];
  }, [cats, snapshot, counts, t]);

  const browseLabel = formatDateTime(snapshot?.at ?? atPoint.toDate().toISOString());

  // 快照时间变化 = 新的浏览上下文：即使用户关闭过提示，也重新提醒「只读快照」。
  useEffect(() => {
    hint.show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseLabel]);

  return (
    <div className="time-machine" data-testid="time-machine-page">
      <Space wrap style={{ marginBottom: 12 }} align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          <HistoryOutlined style={{ marginRight: 8 }} />
          {t('时间机器')}
        </Typography.Title>
        <span className="time-machine-label">{t('历史时间点')}</span>
        <DatePicker
          showTime
          allowClear={false}
          value={atPoint}
          onChange={(value) => value && setAtPoint(value)}
          data-testid="time-machine-at"
        />
        <Button type="primary" loading={loading} onClick={() => void load(atPoint)} data-testid="time-machine-query">
          {t('查询')}
        </Button>
        <Button
          disabled={loading}
          data-testid="time-machine-now"
          onClick={() => {
            const now = dayjs();
            setAtPoint(now);
            void load(now);
          }}
        >
          <ReloadOutlined style={{ marginRight: 4 }} />
          {t('回到现在')}
        </Button>
        <PageHintRestore hint={hint} />
      </Space>

      <PageHintAlert
        data-testid="time-machine-readonly-alert"
        hint={hint}
        message={t('您正在浏览 {time} 的历史快照（只读）', { time: browseLabel })}
        description={t('栏目树与状态显示的是当前值（栏目与状态流转未纳入版本快照）；标题、页面路径、页面模板与字段值均为该时刻的版本快照。')}
      />
      {inFuture && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8 }}
          data-testid="time-machine-future-hint"
          message={t('所选时间点晚于当前时刻，快照内容与现在的站点一致。')}
        />
      )}

      <div className="time-machine-panes">
        <aside className="time-machine-pane time-machine-categories">
          <div className="time-machine-pane-title">{t('栏目树')}</div>
          <Tree
            treeData={treeData}
            expandedKeys={expandedCatKeys}
            onExpand={(keys) => setExpandedCatKeys(keys as string[])}
            selectedKeys={[selectedCatId]}
            onSelect={(keys) => setSelectedCatId(String(keys[0] || ALL_CATEGORIES))}
            data-testid="time-machine-category-tree"
          />
          <Typography.Text type="secondary" className="time-machine-hint">
            {t('只读：栏目树不可增删改，且为当前结构。')}
          </Typography.Text>
        </aside>

        <section className="time-machine-pane time-machine-list">
          <div className="time-machine-pane-title">
            {t('内容列表')}
            <span className="time-machine-count" data-testid="time-machine-count">
              {t('{n} 条', { n: rows.length })}
            </span>
          </div>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('按标题或页面路径筛选')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            data-testid="time-machine-keyword"
          />
          <div className="time-machine-list-body">
            {loading && !snapshot ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <Spin />
              </div>
            ) : emptyReason === 'before-creation' ? (
              <Alert
                type="warning"
                showIcon
                data-testid="time-machine-before-creation"
                message={t('该时间点早于内容创建时间')}
                description={t('该站点最早的内容创建于 {time}，早于此时间点的快照为空。', {
                  time: formatDateTime(snapshot?.earliestContentCreatedAt),
                })}
              />
            ) : emptyReason === 'no-content-in-site' ? (
              <Empty description={t('该站点暂无内容')} />
            ) : rows.length ? (
              <List
                size="small"
                dataSource={rows}
                renderItem={(item) => (
                  <List.Item
                    className={`time-machine-item${item.id === selectedId ? ' is-selected' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                    data-testid="time-machine-item"
                    data-content-id={item.id}
                  >
                    <div className="time-machine-item-body">
                      <div className="time-machine-item-title">
                        {item.title || t('（无标题）')}
                        <Tag>{item.contentTypeName || item.contentTypeCode || t('未知模型')}</Tag>
                      </div>
                      <div className="time-machine-item-meta">
                        <span>{item.routePath || '—'}</span>
                        <span>
                          {`v${item.version}`} · {t('保存于 {time}', { time: versionTime(item) })}
                        </span>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description={snapshot ? t('没有符合条件的内容') : t('暂无快照')} />
            )}
          </div>
          {snapshot && snapshot.notYetCreated > 0 && (
            <Typography.Text type="secondary" className="time-machine-hint" data-testid="time-machine-not-yet-created">
              {t('另有 {n} 条内容在该时间点之后才创建，故不在本快照中。', { n: snapshot.notYetCreated })}
            </Typography.Text>
          )}
        </section>

        <section className="time-machine-pane time-machine-detail">
          <div className="time-machine-pane-title">{t('内容详情')}</div>
          {!selected ? (
            <Empty description={t('请选择左侧的内容查看该时刻的详情')} />
          ) : (
            <div className="time-machine-detail-body" data-testid="time-machine-detail">
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('标题')}>{selected.title || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('版本')}>
                  {`v${selected.version}`}
                  <Tag style={{ marginLeft: 8 }}>{t('模型 v{version}', { version: selected.modelVersion })}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('版本保存时间')}>{versionTime(selected)}</Descriptions.Item>
                {/* OBS-11-04：AI 版本的 actor 落库为 ID，展示后端解析出的用户名 */}
                <Descriptions.Item label={t('作者')}>
                  {selected.createdByName || selected.createdBy || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('内容模型')}>
                  {selected.contentTypeName || selected.contentTypeCode || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('页面路径')}>{selected.routePath || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('页面模板')}>{selected.templatePath || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('当前状态')}>
                  <Tooltip title={t('状态流转未纳入版本快照，此处为内容的当前状态，不代表该时刻的状态。')}>
                    <Tag data-testid="time-machine-current-status">{selected.currentStatus || '—'}</Tag>
                  </Tooltip>
                </Descriptions.Item>
              </Descriptions>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                {t('字段快照')}
              </Typography.Title>
              <Table
                rowKey="code"
                size="small"
                pagination={false}
                dataSource={selectedFieldRows}
                columns={[
                  {
                    title: t('字段'),
                    dataIndex: 'code',
                    width: 180,
                    render: (code: string, row: { label: string }) => (
                      <span title={code}>
                        {row.label}
                        {row.label !== code && (
                          <Typography.Text type="secondary" className="time-machine-field-code">
                            {code}
                          </Typography.Text>
                        )}
                      </span>
                    ),
                  },
                  {
                    title: t('该时刻的值'),
                    dataIndex: 'text',
                    render: (text: string) =>
                      text === '' ? (
                        <Typography.Text type="secondary">{t('（空）')}</Typography.Text>
                      ) : (
                        <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{text}</Typography.Text>
                      ),
                  },
                ]}
              />
            </div>
          )}
        </section>
      </div>

      {/* 规范 §15.5：状态栏标识只读模式 */}
      <div className="time-machine-statusbar" data-testid="time-machine-mode">
        <ClockCircleOutlined style={{ marginRight: 6 }} />
        {t('时间机器模式（只读）')}
        <span className="time-machine-statusbar-at">{browseLabel}</span>
        <span className="time-machine-statusbar-hint">
          {t('浏览历史不会影响当前数据：本页面不提供任何编辑、发布与删除入口。')}
        </span>
      </div>
    </div>
  );
}

export default function TimeMachinePage() {
  return (
    <RequireSite>
      <TimeMachineInner />
    </RequireSite>
  );
}
