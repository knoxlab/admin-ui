/**
 * 系统日志（FR-LOG）：双 Tab（运行日志 / 访问日志）+ 筛选 + 详情抽屉 + 自动刷新。
 * 权限：`logs` / `logs-admin` 能力键（菜单入口已按能力过滤；SITE 域强制站点过滤）。
 * 导出仅 system-admin（后端 FR-LOG-QR-008/009 强制，前端隐藏入口）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Descriptions, Drawer,
  Input, Progress, Row,
  Segmented, Select, Space, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { DownloadOutlined, FileTextOutlined, GlobalOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import { openInNewTab } from '../openInNewTab';
import { RequireSite, useSite } from '../context/SiteContext';
import { useI18n } from '../i18n/I18nProvider';
import { hasCapability, isSystemAdmin, useAuth } from '../auth/AuthContext';

const PAGE_SIZE = 50;

type RuntimeLogView = {
  id: string; occurredAt: string; level: string; service: string; module: string;
  node: string; thread: string; traceId: string | null; siteKey: string | null;
  message: string; exceptionType: string | null; stack: string | null;
  truncated: boolean; originalBytes: number | null;
};

type AccessLogView = {
  id: string; occurredAt: string; clientIp: string; method: string; path: string;
  status: number; durationMs: number; respBytes: number | null; identity: string | null;
  userAgent: string | null; traceId: string | null; siteKey: string | null;
  outcome: string; errorCode: string | null;
};

type LogPage = { items: (RuntimeLogView | AccessLogView)[]; nextCursorTime: string | null;
  nextCursorId: string | null; hasMore: boolean };

type StatsResponse = { total: number; byLevel: Record<string, number>;
  hourly: { hour: string; total: number }[]; cachedForSeconds: number; cached: boolean };

type LogRow = RuntimeLogView & Partial<AccessLogView>;
type DetailRow = RuntimeLogView | AccessLogView;

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'red', WARN: 'orange', INFO: 'blue', DEBUG: 'default', TRACE: 'default',
};

const OUTCOME_COLORS: Record<string, string> = {
  SUCCESS: 'green', BUSINESS_FAILURE: 'orange', AUTH_FAILURE: 'red',
  RATE_LIMITED: 'purple', SYSTEM_ERROR: 'red',
};

function fmtTime(value: string | null): string {
  if (!value) return '-';
  return value.replace('T', ' ').replace(/Z$/, 'Z');
}

function SystemLogsInner() {
  const { t } = useI18n();
  const { me } = useAuth();
  const { siteId } = useSite();
  const sysAdmin = isSystemAdmin(me);
  const canView = sysAdmin || hasCapability(me, siteId, 'logs') || hasCapability(me, siteId, 'logs-admin');

  const [type, setType] = useState<'runtime' | 'access'>('runtime');
  const [levels, setLevels] = useState<string[]>([]);
  const [module, setModule] = useState<string | undefined>();
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [traceId, setTraceId] = useState<string | null>(null);
  const [range, setRange] = useState<'1h' | '24h' | '7d' | '30d'>('1h');
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [cursor, setCursor] = useState<{ time: string; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const reloadRef = useRef<() => void>(() => {});
  // 定时器内读取实时值的 ref（避免为读取状态而重建 interval 或形成依赖循环）
  const loadingRef = useRef(false);
  const cursorRef = useRef<{ time: string; id: string } | null>(null);

  const spanMs = useMemo(() => {
    switch (range) {
      case '24h': return 24 * 3600_000;
      case '7d': return 7 * 24 * 3600_000;
      case '30d': return 30 * 24 * 3600_000;
      default: return 3600_000;
    }
  }, [range]);

  const params = useCallback((extra?: Record<string, unknown>) => ({
    siteId: siteId ?? undefined,
    from: new Date(Date.now() - spanMs).toISOString(),
    levels: levels.length ? levels.join(',') : undefined,
    modules: module,
    outcomes: outcomes.length ? outcomes.join(',') : undefined,
    keyword: keyword.trim() || undefined,
    traceId: traceId || undefined,
    pageSize,
    ...(extra ?? {}),
  }), [siteId, spanMs, levels, module, outcomes, keyword, traceId, pageSize]);

  const load = useCallback(async (opts?: { append?: boolean }) => {
    if (!canView) return;
    setLoading(true);
    loadingRef.current = true;
    setError(null);
    try {
      const extra: Record<string, unknown> = {};
      if (opts?.append && cursor) {
        extra.cursorTime = cursor.time;
        extra.cursorId = cursor.id;
      }
      const page = await api.get<LogPage>(`/system-logs/${type}`, { params: params(extra) })
        .then((r) => r.data);
      setRows((prev) => (opts?.append ? [...prev, ...page.items as LogRow[]] : page.items as LogRow[]));
      const next = page.hasMore && page.nextCursorTime && page.nextCursorId
        ? { time: page.nextCursorTime, id: page.nextCursorId } : null;
      setCursor(next);
      cursorRef.current = next;
      setMore(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [canView, type, params, cursor]);

  const loadStats = useCallback(async () => {
    if (!canView) return;
    try {
      const data = await api.get<StatsResponse>(`/system-logs/${type}/stats`, { params: params() })
        .then((r) => r.data);
      setStats(data);
    } catch { /* 统计失败不打断列表（观测旁路） */ }
  }, [canView, type, params]);

  const loadModules = useCallback(async () => {
    if (!canView) return;
    try {
      const list = await api.get<string[]>('/system-logs/modules', {
        params: { siteId: siteId ?? undefined, from: new Date(Date.now() - 7 * 24 * 3600_000).toISOString() },
      }).then((r) => r.data);
      setModules(list);
    } catch { /* 忽略 */ }
  }, [canView, siteId]);

  // 首次 / 条件变化：重置游标重新拉取；统计与模块聚合跟随。
  // 关键一：依赖「筛选条件序列化值」而非 load 函数身份 —— load 依赖 cursor，
  // 若 effect 依赖 load，则每次 load 完成设置游标后 effect 重跑，形成请求死循环
  // （数秒内耗尽 30 次/分钟限流配额，后续全部 429）。
  // 关键二：type（运行/访问 Tab）必须纳入触发键 —— 否则切 Tab 后沿用旧 Tab 的数据
  // 渲染新列（字段名不匹配），出现整行空白。
  const filterKey = useMemo(() => JSON.stringify({ type, ...params() }), [type, params]);
  useEffect(() => {
    setCursor(null);
    cursorRef.current = null;
    setDetail(null); // Tab/条件切换后旧详情不再对应新列表
    setRows([]);     // 清空旧 Tab/旧条件的数据行，避免以新列渲染错位字段（整行空白）
    load();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { loadModules(); }, [loadModules]);

  // 自动刷新（15s；仅第一页，避免游标错位）。同样依赖 filterKey 而非 load 身份。
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (!loadingRef.current && !cursorRef.current) { load(); loadStats(); }
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, filterKey]);

  reloadRef.current = () => { load(); loadStats(); };

  const openDetail = useCallback(async (row: LogRow) => {
    try {
      const fresh = await api.get<DetailRow>(`/system-logs/${type}/${row.id}`).then((r) => r.data);
      setDetail(fresh);
    } catch {
      setDetail(row);
    }
  }, [type]);

  const requestExport = useCallback(() => {
    // 回归缺陷 ④：window.open 需在用户手势内同步发生，导出 token 改为开窗后异步填充
    openInNewTab(
      async () => {
        const res = await api.get<{ token: string; expiresAt: string; count: number }>(
          `/system-logs/${type}/export`, { params: params({ format: 'csv' }) }).then((r) => r.data);
        return `/api/v1/system-logs/${type}/export/${res.token}?format=csv`;
      },
      undefined,
      () => { /* 全局拦截器已提示 */ },
    );
  }, [type, params]);

  const relatedByTrace = useCallback(async (tid: string) => {
    setTraceId(tid);
    setDetail(null);
  }, []);

  const columns = useMemo(() => {
    if (type === 'runtime') {
      return [
        { title: t('时间'), dataIndex: 'occurredAt', width: 170, render: fmtTime },
        { title: t('级别'), dataIndex: 'level', width: 80,
          render: (v: string) => <Tag color={LEVEL_COLORS[v] ?? 'default'}>{v}</Tag> },
        { title: t('来源模块'), dataIndex: 'module', width: 160, ellipsis: true },
        { title: t('消息'), dataIndex: 'message', ellipsis: true },
        { title: t('traceId'), dataIndex: 'traceId', width: 130, ellipsis: true,
          render: (v: string | null) => v ? (
            <a onClick={() => relatedByTrace(v)} title={v}>{v.slice(0, 10)}…</a>
          ) : '-' },
      ];
    }
    return [
      { title: t('时间'), dataIndex: 'occurredAt', width: 170, render: fmtTime },
      { title: t('方法'), dataIndex: 'method', width: 80 },
      { title: t('路径'), dataIndex: 'path', ellipsis: true },
      { title: t('状态码'), dataIndex: 'status', width: 90,
        render: (v: number) => <Tag color={v >= 500 ? 'red' : v >= 400 ? 'orange' : 'green'}>{v}</Tag> },
      { title: t('耗时(ms)'), dataIndex: 'durationMs', width: 100 },
      { title: t('来源 IP'), dataIndex: 'clientIp', width: 130 },
      { title: t('身份'), dataIndex: 'identity', width: 130, ellipsis: true },
      { title: t('结果分类'), dataIndex: 'outcome', width: 140,
        render: (v: string) => <Tag color={OUTCOME_COLORS[v] ?? 'default'}>{v}</Tag> },
    ];
  }, [type, t, relatedByTrace]);

  const levelOptions = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].map((lv) => ({ value: lv, label: lv }));
  const outcomeOptions = ['SUCCESS', 'BUSINESS_FAILURE', 'AUTH_FAILURE', 'RATE_LIMITED', 'SYSTEM_ERROR']
    .map((o) => ({ value: o, label: o }));

  const hourPeak = useMemo(() => Math.max(1, ...(stats?.hourly ?? []).map((h) => h.total)), [stats]);

  if (!canView) {
    return <Alert type="warning" showIcon message={t('没有权限查看系统日志')} />;
  }

  return (
    <div>
      <Typography.Title level={4}>{t('系统日志')}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {t('运行日志与访问日志双轨查询：时间窗、级别/结果分类、来源模块、关键词与 traceId 关联检索；导出仅系统管理员可用。')}
      </Typography.Paragraph>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} closable
        onClose={() => setError(null)} />}

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title={t('日志总数')} value={stats?.total ?? 0} /></Card>
        </Col>
        <Col xs={24} md={10}>
          <Card size="small" title={t('小时分布')}>
            {stats?.hourly?.length
              ? stats.hourly.slice(-12).map((h) => (
                <Tooltip key={h.hour} title={`${h.hour}: ${h.total}`}>
                  <Progress percent={Math.round((h.total / hourPeak) * 100)} showInfo={false}
                    size={['100%', 8]} format={() => ''} />
                </Tooltip>
              ))
              : <Spin size="small" />}
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small" title={t('级别分布')}>
            {stats && Object.entries(stats.byLevel).length
              ? Object.entries(stats.byLevel).map(([lv, n]) => (
                <div key={lv} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Tag color={LEVEL_COLORS[lv] ?? 'default'}>{lv}</Tag><span>{n}</span>
                </div>
              ))
              : <Spin size="small" />}
          </Card>
        </Col>
      </Row>

      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented value={type} onChange={(v) => setType(v as 'runtime' | 'access')}
          options={[
            { value: 'runtime', label: <span><FileTextOutlined /> {t('运行日志')}</span> },
            { value: 'access', label: <span><GlobalOutlined /> {t('访问日志')}</span> },
          ]} />
        <Select mode="multiple" allowClear placeholder={t('级别')} style={{ minWidth: 200 }}
          value={levels} onChange={setLevels} options={levelOptions} />
        {type === 'runtime' ? (
          <Select allowClear showSearch placeholder={t('来源模块')} style={{ minWidth: 180 }}
            value={module} onChange={setModule}
            options={modules.map((m) => ({ value: m, label: m }))} />
        ) : (
          <Select mode="multiple" allowClear placeholder={t('结果分类')} style={{ minWidth: 200 }}
            value={outcomes} onChange={setOutcomes} options={outcomeOptions} />
        )}
        <Select value={range} onChange={setRange} style={{ width: 130 }}
          options={[
            { value: '1h', label: t('最近 1 小时') },
            { value: '24h', label: t('最近 24 小时') },
            { value: '7d', label: t('最近 7 天') },
            { value: '30d', label: t('最近 30 天') },
          ]} />
        <Input.Search allowClear placeholder={t('关键词')} style={{ width: 220 }}
          onSearch={setKeyword} enterButton />
        {traceId && (
          <Tag closable onClose={() => setTraceId(null)} color="geekblue">
            {t('traceId')}: {traceId.slice(0, 12)}…
          </Tag>
        )}
        <Select value={pageSize} onChange={setPageSize} style={{ width: 110 }}
          options={[20, 50, 100, 200].map((n) => ({ value: n, label: `${n} / ${t('页')}` }))} />
        <Button icon={<ReloadOutlined />} onClick={() => reloadRef.current()}>{t('刷新')}</Button>
        <Button size="middle" type={autoRefresh ? 'primary' : 'default'} ghost={autoRefresh}
          onClick={() => setAutoRefresh((v) => !v)}>
          <Badge status={autoRefresh ? 'processing' : 'default'} text={t('自动刷新')} />
        </Button>
        {sysAdmin && (
          <Tooltip title={t('导出（一次性链接，30 分钟有效）')}>
            <Button icon={<DownloadOutlined />} onClick={requestExport}>{t('导出')}</Button>
          </Tooltip>
        )}
      </Space>

      <Table<LogRow>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns as never}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 960 }}
        onRow={(record) => ({ onClick: () => openDetail(record), style: { cursor: 'pointer' } })}
        footer={() => more ? (
          <Button block type="dashed" loading={loading}
            onClick={() => load({ append: true })}>{t('加载更多')}</Button>
        ) : (rows.length ? t('没有更多了') : null)}
      />

      <Drawer width={640} open={detail !== null} onClose={() => setDetail(null)}
        title={t('日志详情')}>
        {detail && ('level' in detail ? (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label={t('时间')}>{fmtTime(detail.occurredAt)}</Descriptions.Item>
              <Descriptions.Item label={t('级别')}>
                <Tag color={LEVEL_COLORS[detail.level] ?? 'default'}>{detail.level}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('服务')}>{detail.service}</Descriptions.Item>
              <Descriptions.Item label={t('来源模块')}>{detail.module}</Descriptions.Item>
              <Descriptions.Item label={t('节点')}>{detail.node}</Descriptions.Item>
              <Descriptions.Item label={t('线程')}>{detail.thread}</Descriptions.Item>
              <Descriptions.Item label={t('traceId')}>
                {detail.traceId
                  ? <a onClick={() => relatedByTrace(detail.traceId!)}>{detail.traceId}</a>
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('站点')}>{detail.siteKey ?? '-'}</Descriptions.Item>
            </Descriptions>
            <Typography.Paragraph code style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
              {detail.message}
              {detail.truncated && detail.originalBytes
                ? `\n(${t('已截断，原始')} ${detail.originalBytes} ${t('字节')})` : ''}
            </Typography.Paragraph>
            {detail.exceptionType && (
              <Alert type="error" showIcon message={detail.exceptionType} style={{ marginBottom: 8 }} />
            )}
            {detail.stack && (
              <pre style={{ maxHeight: 320, overflow: 'auto', background: '#fafafa', padding: 8, fontSize: 12 }}>
                {detail.stack}
              </pre>
            )}
          </>
        ) : (
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label={t('时间')}>{fmtTime(detail.occurredAt)}</Descriptions.Item>
            <Descriptions.Item label={t('状态码')}>
              <Tag color={detail.status >= 500 ? 'red' : detail.status >= 400 ? 'orange' : 'green'}>
                {detail.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('方法')}>{detail.method}</Descriptions.Item>
            <Descriptions.Item label={t('来源 IP')}>{detail.clientIp}</Descriptions.Item>
            <Descriptions.Item label={t('身份')}>{detail.identity ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('结果分类')}>
              <Tag color={OUTCOME_COLORS[detail.outcome] ?? 'default'}>{detail.outcome}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('耗时(ms)')}>{detail.durationMs}</Descriptions.Item>
            <Descriptions.Item label={t('响应字节')}>{detail.respBytes ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('traceId')}>
              {detail.traceId
                ? <a onClick={() => relatedByTrace(detail.traceId!)}>{detail.traceId}</a>
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('站点')}>{detail.siteKey ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('路径')} span={2}>
              <code style={{ wordBreak: 'break-all' }}>{detail.path}</code>
            </Descriptions.Item>
            <Descriptions.Item label="User-Agent" span={2}>
              <span style={{ wordBreak: 'break-all' }}>{detail.userAgent ?? '-'}</span>
            </Descriptions.Item>
          </Descriptions>
        ))}
      </Drawer>
    </div>
  );
}

export default function SystemLogsPage() {
  return <RequireSite><SystemLogsInner /></RequireSite>;
}
