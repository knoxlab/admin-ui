import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, Col, Empty, Form, Input, Popover, Row, Segmented, Select, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  analyticsApi,
  type AnalyticsNode,
  type AssetRow,
  type BucketRow,
  type ClientRow,
  type ContentRankRow,
  type FolderRow,
  type HourPoint,
  type MinutePoint,
  type PageRankRow,
  type PublishDeptRow,
  type PublishFolderRow,
  type PublishTrendPoint,
  type PublishUserRow,
  type RealtimeSummary,
  type RecentVisitRow,
  type RegionRow,
  type SearchTermRow,
  type SourceRow,
  type TrendPoint,
  type TypeRow,
  type UrlRow,
  type WatchingRow,
} from '../api/analytics';
import { RequireSite, useSite } from '../context/SiteContext';
import { formatDateTime, formatDateTimeSeconds, formatHourMinute } from '../utils/datetime';
import { formatBytes } from '../utils/format';
import { t } from '../i18n/locale';

const { Text } = Typography;

const METRIC_NOTE =
  'UV/IP 跨天范围按去重基表 COUNT(DISTINCT) 精确去重；' +
  '回头率=范围内曾于历史访问的访客数÷UV；环比基期为紧邻等长周期，基期无数据显示「—」；' +
  '时间归属按站点时区计算。';

function MetricHelp() {
  return (
    <Popover content={<div style={{ maxWidth: 420 }}>{METRIC_NOTE}</div>} title={t('统计口径说明')}>
      <Text type="secondary" style={{ cursor: 'help' }}>{t('口径说明')}</Text>
    </Popover>
  );
}

// ---------- 日期范围（需求 3）：今日/昨日/近7天/近30天/自定义 ----------

function fmt(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

function presetRange(p: RangePreset): [string, string] | null {
  const to = new Date();
  const from = new Date();
  switch (p) {
    case 'today': return [fmt(to), fmt(to)];
    case 'yesterday': from.setDate(from.getDate() - 1); return [fmt(from), fmt(from)];
    case 'last7': from.setDate(from.getDate() - 6); return [fmt(from), fmt(to)];
    case 'last30': from.setDate(from.getDate() - 29); return [fmt(from), fmt(to)];
    default: return null;
  }
}

function useDateRange(initial: RangePreset = 'last7') {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [range, setRange] = useState<[string, string]>(() => presetRange(initial)!);
  const apply = (p: RangePreset, r?: [string, string]) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p)!);
    else if (r) setRange(r);
  };
  return { preset, range, apply };
}

function RangePicker({ preset, range, onChange }: {
  preset: RangePreset; range: [string, string];
  onChange: (p: RangePreset, r?: [string, string]) => void;
}) {
  return (
    <Space wrap>
      <Segmented
        value={preset}
        onChange={(v) => onChange(String(v) as RangePreset)}
        options={[
          { label: t('今日'), value: 'today' },
          { label: t('昨日'), value: 'yesterday' },
          { label: t('近 7 天'), value: 'last7' },
          { label: t('近 30 天'), value: 'last30' },
          { label: t('自定义'), value: 'custom' },
        ]}
      />
      {preset === 'custom' && (
        <input
          type="date"
          value={range[0]}
          max={range[1]}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onChange('custom', [v, range[1]]);
          }}
        />
      )}
      {preset === 'custom' && (
        <input
          type="date"
          value={range[1]}
          min={range[0]}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onChange('custom', [range[0], v]);
          }}
        />
      )}
    </Space>
  );
}

// ---------- SVG 图表（需求 4）：柱状/饼状/折线切换 + 点击联动过滤 ----------

export type ChartKind = 'bar' | 'pie' | 'line';

const PALETTE = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb', '#fadb14', '#8c8c8c'];

export interface ChartDatum { name: string; value: number }

function ChartBlock({ kind, data, valueLabel, onPick, picked }: {
  kind: ChartKind; data: ChartDatum[]; valueLabel: string;
  onPick?: (name: string | null) => void; picked?: string | null;
}) {
  const W = 860, H = 300, padL = 46, padB = 46, padT = 16, padR = 16;
  const clean = data.filter((d) => Number.isFinite(d.value));
  if (!clean.length) return <Empty description={t('暂无数据')} style={{ padding: 32 }} />;
  const max = Math.max(...clean.map((d) => d.value), 1);
  const iw = W - padL - padR, ih = H - padT - padB;
  const click = (name: string) => onPick?.(picked === name ? null : name);
  const pickedColor = (i: number) => (picked == null || clean[i]?.name === picked ? PALETTE[i % PALETTE.length] : '#d9d9d9');

  if (kind === 'pie') {
    const total = clean.reduce((s, d) => s + d.value, 0) || 1;
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 30;
    let acc = -Math.PI / 2;
    const slices = clean.map((d, i) => {
      const ang = (d.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(acc), y1 = cy + r * Math.sin(acc);
      acc += ang;
      const x2 = cx + r * Math.cos(acc), y2 = cy + r * Math.sin(acc);
      const large = ang > Math.PI ? 1 : 0;
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      const mid = acc - ang / 2;
      const lx = cx + (r * 0.72) * Math.cos(mid), ly = cy + (r * 0.72) * Math.sin(mid);
      const pct = ((d.value / total) * 100).toFixed(1);
      return { path, name: d.name, value: d.value, pct, color: pickedColor(i), lx, ly, i };
    });
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img">
        {slices.map((s) => (
          <g key={s.name} onClick={() => click(s.name)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <path d={s.path} fill={s.color} stroke="#fff" strokeWidth={1} opacity={picked == null || picked === s.name ? 1 : 0.35} />
            {s.value / total > 0.04 && (
              <text x={s.lx} y={s.ly} textAnchor="middle" fontSize={11} fill="#fff" style={{ pointerEvents: 'none' }}>
                {s.pct}%
              </text>
            )}
          </g>
        ))}
        <g>
          {slices.slice(0, 12).map((s, i) => (
            <g key={s.name} transform={`translate(${W - 130}, ${40 + i * 20})`} onClick={() => click(s.name)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
              <rect width={12} height={12} y={-10} fill={s.color} rx={2} />
              <text x={18} y={0} fontSize={12} fill="#555">{s.name.length > 10 ? `${s.name.slice(0, 10)}…` : s.name}（{s.value}）</text>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  if (kind === 'line') {
    const stepX = clean.length > 1 ? iw / (clean.length - 1) : 0;
    const px = (i: number) => padL + i * stepX;
    const py = (v: number) => padT + ih - (v / max) * ih;
    const path = clean.map((d, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(d.value)}`).join(' ');
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={py(t)} x2={W - padR} y2={py(t)} stroke="#f0f0f0" />
            <text x={padL - 6} y={py(t) + 4} textAnchor="end" fontSize={10} fill="#999">{t}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={PALETTE[0]} strokeWidth={2} />
        {clean.map((d, i) => (
          <g key={d.name} onClick={() => click(d.name)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <circle cx={px(i)} cy={py(d.value)} r={picked === d.name ? 6 : 4} fill={pickedColor(i)} />
            {(clean.length <= 16 || i % Math.ceil(clean.length / 16) === 0) && (
              <text x={px(i)} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#666">
                {d.name.length > 8 ? `${d.name.slice(0, 8)}…` : d.name}
              </text>
            )}
            <title>{`${d.name}：${d.value}`}</title>
          </g>
        ))}
        <text x={4} y={12} fontSize={11} fill="#999">{valueLabel}</text>
      </svg>
    );
  }

  // bar
  const bw = iw / clean.length;
  const barW = Math.min(42, bw * 0.6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={padT + ih - (t / max) * ih} x2={W - padR} y2={padT + ih - (t / max) * ih} stroke="#f0f0f0" />
          <text x={padL - 6} y={padT + ih - (t / max) * ih + 4} textAnchor="end" fontSize={10} fill="#999">{t}</text>
        </g>
      ))}
      {clean.map((d, i) => {
        const h = (d.value / max) * ih;
        const x = padL + i * bw + (bw - barW) / 2;
        const y = padT + ih - h;
        return (
          <g key={d.name} onClick={() => click(d.name)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <rect x={x} y={y} width={barW} height={h} fill={pickedColor(i)} rx={3}
              opacity={picked == null || picked === d.name ? 1 : 0.45} />
            {(clean.length <= 14 || i % Math.ceil(clean.length / 14) === 0) && (
              <text x={x + barW / 2} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#666">
                {d.name.length > 8 ? `${d.name.slice(0, 8)}…` : d.name}
              </text>
            )}
            <title>{`${d.name}：${d.value}`}</title>
          </g>
        );
      })}
      <text x={4} y={12} fontSize={11} fill="#999">{valueLabel}</text>
    </svg>
  );
}

function KindSwitch({ kind, onChange }: { kind: ChartKind; onChange: (k: ChartKind) => void }) {
  return (
    <Segmented size="small" value={kind} onChange={(v) => onChange(String(v) as ChartKind)}
      options={[{ label: t('柱状图'), value: 'bar' }, { label: t('饼状图'), value: 'pie' }, { label: t('折线图'), value: 'line' }]} />
  );
}

/**
 * 图表 + 明细表格联动卡片：点击图表元素过滤表格，再次点击取消（需求 4）。
 */
function ChartTableCard<T>(props: {
  title: string; data: ChartDatum[]; valueLabel: string;
  defaultKind?: ChartKind;
  rowKey: (r: T) => string;
  columns: { title: string; dataIndex?: string; ellipsis?: boolean; render?: (v: unknown, r: T) => React.ReactNode }[];
  filterKey: (r: T) => string;
  tableRows: T[];
  emptyText?: string;
}) {
  const { title, data, valueLabel, defaultKind = 'bar', rowKey, columns, filterKey, tableRows, emptyText } = props;
  const [kind, setKind] = useState<ChartKind>(defaultKind);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [tableRows]);
  const filtered = useMemo(
    () => (picked == null ? tableRows : tableRows.filter((r) => filterKey(r) === picked)),
    [tableRows, picked, filterKey]);
  return (
    <Card title={title} size="small" extra={<KindSwitch kind={kind} onChange={setKind} />}>
      <ChartBlock kind={kind} data={data} valueLabel={valueLabel} picked={picked}
        onPick={(n) => setPicked(n)} />
      {picked != null && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          
          {t('已筛选：')}{picked}
          <Button type="link" size="small" onClick={() => setPicked(null)}>{t('清除')}</Button>
        </Text>
      )}
      <Table<T>
        rowKey={rowKey} size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }}
        dataSource={filtered}
        locale={{ emptyText: <Empty description={emptyText ?? t('暂无数据')} /> }}
        columns={columns as never}
      />
    </Card>
  );
}

function StatCards({ summary }: { summary: { pv: number; uv: number; ipCount: number; sessionCount: number; returnRate?: number; wowPv?: number; dataFrom?: string | null } | null }) {
  const wow = summary?.wowPv;
  return (
    <Row gutter={16}>
      <Col span={4}><Card><Statistic title="PV" value={summary?.pv ?? 0} prefix={wow != null && wow !== 0 ? (wow > 0 ? '↑' : '↓') : undefined} suffix={wow != null ? <Text type="secondary" style={{ fontSize: 12 }}>{wow > 0 ? '+' : ''}{(wow * 100).toFixed(1)}%</Text> : <Text type="secondary" style={{ fontSize: 12 }}>{t('环比 —')}</Text>} /></Card></Col>
      <Col span={4}><Card><Statistic title="UV" value={summary?.uv ?? 0} /></Card></Col>
      <Col span={4}><Card><Statistic title={t('IP 数')} value={summary?.ipCount ?? 0} /></Card></Col>
      <Col span={4}><Card><Statistic title={t('会话数')} value={summary?.sessionCount ?? 0} /></Card></Col>
      <Col span={4}><Card><Statistic title={t('回头率')} value={summary?.returnRate != null ? `${(summary.returnRate * 100).toFixed(1)}%` : '—'} /></Card></Col>
      <Col span={4}><Card><Statistic title={t('数据起始')} value={summary?.dataFrom ?? '—'} /></Card></Col>
    </Row>
  );
}

// ---------- 网站概况（页签：综合报告/访问趋势/时段分布/区域分布） ----------

function OverviewInner() {
  const { siteId } = useSite();
  const { preset, range, apply } = useDateRange();
  const [tab, setTab] = useState<'summary' | 'trend' | 'hourly' | 'region'>('summary');
  const [overview, setOverview] = useState<{ pv: number; uv: number; ipCount: number; sessionCount: number; returnRate: number; wowPv: number; dataFrom?: string | null; metricNote?: string } | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [hourly, setHourly] = useState<HourPoint[]>([]);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [recent, setRecent] = useState<RecentVisitRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [o, t, h, r, s, rc] = await Promise.all([
        analyticsApi.overview(siteId, range[0], range[1]),
        analyticsApi.trend(siteId, range[0], range[1]),
        analyticsApi.hourly(siteId, range[0], range[1]),
        analyticsApi.regions(siteId, range[0], range[1]),
        analyticsApi.sources(siteId, range[0], range[1]),
        analyticsApi.recentVisits(siteId, 50),
      ]);
      setOverview(o); setTrend(t); setHourly(h); setRegions(r); setSources(s); setRecent(rc);
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  }, [siteId, range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <RangePicker preset={preset} range={range} onChange={apply} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
        <MetricHelp />
      </Space>
      <Spin spinning={loading}>
        <StatCards summary={overview} />
      </Spin>
      <Segmented value={tab} onChange={(v) => setTab(String(v) as typeof tab)} options={[
        { label: t('综合报告'), value: 'summary' },
        { label: t('访问趋势'), value: 'trend' },
        { label: t('时段分布'), value: 'hourly' },
        { label: t('区域分布'), value: 'region' },
      ]} />
      {tab === 'summary' && (
        <>
          <Row gutter={16}>
            <Col span={12}>
              <ChartTableCard<SourceRow>
                title={t('来源组成')} valueLabel="PV" defaultKind="pie"
                data={sources.map((s) => ({ name: s.detail ? `${s.sourceType}(${s.detail})` : s.sourceType, value: s.pv }))}
                rowKey={(r) => `${r.sourceType}-${r.detail}`}
                filterKey={(r) => r.detail ? `${r.sourceType}(${r.detail})` : r.sourceType}
                tableRows={sources}
                emptyText={t('暂无来源数据')}
                columns={[
                  { title: t('来源'), dataIndex: 'sourceType', render: (v: unknown) => ({
                    DIRECT: t('直接输入'), SEARCH_ENGINE: t('搜索引擎'), REFERRAL: t('外部链接'), CAMPAIGN: t('营销活动'),
                  }[String(v)] ?? String(v)) },
                  { title: t('明细'), dataIndex: 'detail' },
                  { title: 'PV', dataIndex: 'pv' },
                  { title: 'UV', dataIndex: 'uv' },
                ]}
              />
            </Col>
            <Col span={12}>
              <ChartTableCard<RegionRow>
                title={t('区域分布（省份）')} valueLabel="PV" defaultKind="bar"
                data={aggregateProvince(regions)}
                rowKey={(r) => `${r.province}-${r.city}`}
                filterKey={(r) => r.province}
                tableRows={regions}
                emptyText={t('暂无区域数据；区域由 IP 离线库解析')}
                columns={[
                  { title: t('省份'), dataIndex: 'province' },
                  { title: t('城市'), dataIndex: 'city', render: (v: unknown) => String(v) || '—' },
                  { title: 'PV', dataIndex: 'pv' },
                  { title: 'UV', dataIndex: 'uv' },
                ]}
              />
            </Col>
          </Row>
          <Card title={t('最近访问（近 24 小时）')} size="small">
            <Table<RecentVisitRow>
              rowKey={(r) => `${r.occurredAt}-${r.routePath}-${r.ipMasked}`} size="small" pagination={{ pageSize: 10 }} dataSource={recent} loading={loading}
              locale={{ emptyText: <Empty description={t('暂无访问记录')} /> }}
              columns={[
                { title: t('时间'), dataIndex: 'occurredAt', width: 160, render: (v: string) => formatDateTimeSeconds(v) },
                { title: t('IP（匿名化）'), dataIndex: 'ipMasked' },
                { title: 'URL', dataIndex: 'routePath', ellipsis: true },
                { title: t('标题'), dataIndex: 'title', ellipsis: true },
                { title: t('来源'), dataIndex: 'sourceType' },
                { title: t('客户端'), key: 'ua', render: (_: unknown, r: RecentVisitRow) => `${r.os} · ${r.browser}` },
                { title: t('访客'), dataIndex: 'isNewVisitor', render: (v: boolean) => v ? <Tag color="blue">{t('回头')}</Tag> : <Tag>{t('新访客')}</Tag> },
              ]}
            />
          </Card>
        </>
      )}
      {tab === 'trend' && (
        <ChartTableCard<TrendPoint>
          title={t('访问趋势（日粒度）')} valueLabel="PV" defaultKind="line"
          data={trend.map((t) => ({ name: t.statDate, value: t.pv }))}
          rowKey={(r) => r.statDate}
          filterKey={(r) => r.statDate}
          tableRows={trend}
          emptyText={t('暂无数据：开启采集后浏览站点页面即可产生访问统计')}
          columns={[
            { title: t('日期'), dataIndex: 'statDate' },
            { title: 'PV', dataIndex: 'pv' },
            { title: 'UV', dataIndex: 'uv' },
            { title: t('IP 数'), dataIndex: 'ipCount' },
            { title: t('会话数'), dataIndex: 'sessionCount' },
          ]}
        />
      )}
      {tab === 'hourly' && (
        <ChartTableCard<HourPoint>
          title={t('时段分布（0–23 时）')} valueLabel="PV" defaultKind="bar"
          data={hourly.map((h) => ({ name: `${String(h.hour).padStart(2, '0')}:00`, value: h.pv }))}
          rowKey={(r) => String(r.hour)}
          filterKey={(r) => `${String(r.hour).padStart(2, '0')}:00`}
          tableRows={hourly}
          emptyText={t('时段聚合由每日定时任务生成')}
          columns={[
            { title: t('小时'), dataIndex: 'hour', render: (v: unknown) => `${String(v).padStart(2, '0')}:00` },
            { title: 'PV', dataIndex: 'pv' },
            { title: 'UV', dataIndex: 'uv' },
            { title: t('IP 数'), dataIndex: 'ipCount' },
          ]}
        />
      )}
      {tab === 'region' && (
        <ChartTableCard<RegionRow>
          title={t('区域分布')} valueLabel="PV" defaultKind="bar"
          data={aggregateProvince(regions)}
          rowKey={(r) => `${r.province}-${r.city}`}
          filterKey={(r) => r.province}
          tableRows={regions}
          emptyText={t('暂无区域数据；区域由 IP 离线库解析')}
          columns={[
            { title: t('省份'), dataIndex: 'province' },
            { title: t('城市'), dataIndex: 'city', render: (v: unknown) => String(v) || '—' },
            { title: 'PV', dataIndex: 'pv' },
            { title: 'UV', dataIndex: 'uv' },
          ]}
        />
      )}
    </Space>
  );
}

function aggregateProvince(rows: RegionRow[]): ChartDatum[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.province, (map.get(r.province) ?? 0) + r.pv);
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

// ---------- 实时监控 ----------

const NODE_STATUS: Record<string, { label: string; color: string }> = {
  ONLINE: { label: '在线', color: 'green' },
  DRAINING: { label: '下线中', color: 'orange' },
  OFFLINE: { label: '离线', color: 'red' },
};

/** 播放状态标签（服务端 playState 推导：会话收口 > 暂停位 > 播放中）。 */
const PLAY_STATE: Record<string, { label: string; color: string }> = {
  PLAYING: { label: '播放中', color: 'green' },
  PAUSED: { label: '已暂停', color: 'orange' },
  STOPPED: { label: '已停止', color: 'default' },
};

function RealtimeInner() {
  const { siteId } = useSite();
  const [summary, setSummary] = useState<RealtimeSummary | null>(null);
  const [trend, setTrend] = useState<MinutePoint[]>([]);
  const [nodes, setNodes] = useState<AnalyticsNode[]>([]);
  const [serverNode, setServerNode] = useState<string | undefined>(undefined);
  const [q, setQ] = useState('');
  const [searchIn, setSearchIn] = useState<string>('title');
  const [watching, setWatching] = useState<{ total: number; rows: WatchingRow[] }>({ total: 0, rows: [] });
  const [canWatch, setCanWatch] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadRealtime = useCallback(async () => {
    if (!siteId) return;
    try {
      const [s, t] = await Promise.all([
        analyticsApi.realtimeSummary(siteId, serverNode),
        analyticsApi.realtimeTrend(siteId, 60, serverNode),
      ]);
      setSummary(s);
      setTrend(t);
    } catch { /* 拦截器已提示 */ }
  }, [siteId, serverNode]);

  const loadWatching = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await analyticsApi.realtimeWatching(siteId, {
        q: q || undefined, searchIn, serverNode, page: 0, size: 50,
      });
      setWatching(data);
      setCanWatch(true);
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 403) setCanWatch(false);
    } finally {
      setLoading(false);
    }
  }, [siteId, q, searchIn, serverNode]);

  const loadNodes = useCallback(async () => {
    if (!siteId) return;
    try { setNodes(await analyticsApi.nodes(siteId)); } catch { setCanWatch(false); }
  }, [siteId]);

  useEffect(() => {
    void loadRealtime();
    void loadNodes();
  }, [loadRealtime, loadNodes]);

  useEffect(() => {
    const timer = setInterval(() => void loadRealtime(), 15000);
    return () => clearInterval(timer);
  }, [loadRealtime]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <Select
          allowClear
          placeholder={t('全部节点（全局去重视角）')}
          style={{ width: 260 }}
          value={serverNode}
          onChange={(v) => setServerNode(v)}
          options={nodes.map((n) => ({ value: n.serverNode, label: `${n.serverNode}（${NODE_STATUS[n.status]?.label ?? n.status}）`, disabled: n.status === 'OFFLINE' }))}
        />
        <Tag color={serverNode ? 'orange' : 'green'}>{serverNode ? t('该节点视角，非全局') : t('全局跨节点去重')}</Tag>
        <Button icon={<ReloadOutlined />} onClick={() => { void loadRealtime(); void loadWatching(); }}>{t('刷新')}</Button>
        <Text type="secondary">{t('每 15 秒自动刷新；在线窗口 300 秒')}</Text>
      </Space>
      <Row gutter={16}>
        <Col span={6}><Card><Statistic title={t('实时在线人数')} value={summary?.onlineCount ?? 0} /></Card></Col>
        <Col span={6}><Card><Statistic title={t('实时观看人数')} value={summary?.watchingCount ?? 0} /></Card></Col>
      </Row>
      <ChartTableCard<MinutePoint>
        title={t('最近 60 分钟在线曲线')} valueLabel={t('人数')} defaultKind="line"
        data={trend.map((p) => ({ name: formatHourMinute(p.minute), value: p.onlineCount }))}
        rowKey={(r) => r.minute}
        filterKey={(r) => formatHourMinute(r.minute)}
        tableRows={trend}
        emptyText={t('暂无快照数据；分钟快照由定时任务每分钟生成')}
        columns={[
          // 后端回带 Z 的 UTC 瞬时；直接切片会把 UTC 墙钟上屏（东八区差 8 小时），统一走展示时区渲染
          { title: t('分钟'), dataIndex: 'minute', render: (v: unknown) => formatDateTime(v as string) },
          { title: t('在线人数'), dataIndex: 'onlineCount' },
          { title: t('观看人数'), dataIndex: 'watchingCount' },
        ]}
      />
      {canWatch && (
        <Card title={t('实时观看列表')} size="small" extra={
          <Form layout="inline" onFinish={() => void loadWatching()}>
            <Form.Item><Select value={searchIn} onChange={setSearchIn} style={{ width: 120 }} options={[
              { value: 'title', label: t('内容标题') },
              { value: 'user', label: t('用户') },
              { value: 'ip', label: 'IP' },
              { value: 'region', label: t('地区') },
            ]} /></Form.Item>
            <Form.Item><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('检索关键词')} allowClear /></Form.Item>
            <Form.Item><Button htmlType="submit" type="primary" size="small">{t('检索')}</Button></Form.Item>
          </Form>
        }>
          <Table<WatchingRow>
            rowKey="visitorId" size="small" loading={loading}
            pagination={{ total: watching.total, pageSize: 50, showTotal: (t) => `共 ${t} 人` }}
            dataSource={watching.rows}
            locale={{ emptyText: <Empty description={t('在线窗口内暂无观看记录')} /> }}
            columns={[
              { title: t('最近活动'), dataIndex: 'lastActiveAt', width: 150, render: (v: string) => formatDateTimeSeconds(v) },
              { title: t('内容标题'), dataIndex: 'contentTitle', ellipsis: true },
              { title: t('会员账号'), dataIndex: 'memberAccount', render: (v?: string) => v || <Text type="secondary">{t('匿名')}</Text> },
              { title: t('IP（匿名化）'), dataIndex: 'ipMasked' },
              { title: t('地区'), key: 'region', render: (_: unknown, r: WatchingRow) => [r.regionProvince, r.regionCity].filter(Boolean).join(' / ') || t('未知地区') },
              { title: t('客户端'), key: 'ua', render: (_: unknown, r: WatchingRow) => `${r.os ?? t('未知')} · ${r.browser ?? t('未知')}` },
              { title: t('播放状态'), key: 'playState', render: (_: unknown, r: WatchingRow) => {
                const s = PLAY_STATE[r.playState ?? ''];
                return s ? <Tag color={s.color}>{t(s.label)}</Tag> : <Text type="secondary">{r.playState ?? '—'}</Text>;
              } },
              { title: t('播放进度'), dataIndex: 'playPositionMs', render: (v: number) => `${Math.floor(v / 1000)}s` },
              { title: t('观看时长'), dataIndex: 'watchedMs', render: (v?: number) => `${Math.floor((v ?? 0) / 1000)}s` },
              { title: t('流量'), dataIndex: 'trafficBytes', render: (v?: number) => formatBytes(v) },
              { title: t('采集节点'), dataIndex: 'serverNode' },
            ]}
          />
          <Text type="secondary">{t('列表需 stats-admin 能力；IP 以末段置零展示，完整 IP 不落库')}</Text>
        </Card>
      )}
      {canWatch && nodes.length > 0 && (
        <Card title={t('采集节点')} size="small">
          <Table<AnalyticsNode>
            rowKey="serverNode" size="small" pagination={false} dataSource={nodes}
            columns={[
              { title: t('节点'), dataIndex: 'serverNode' },
              { title: t('状态'), dataIndex: 'status', render: (v: string) => <Tag color={NODE_STATUS[v]?.color}>{NODE_STATUS[v]?.label ?? v}</Tag> },
              { title: t('版本'), dataIndex: 'version' },
              { title: t('队列积压'), dataIndex: 'queueDepth' },
              { title: t('丢弃计数'), dataIndex: 'droppedCount' },
              { title: t('最后心跳'), dataIndex: 'lastHeartbeatAt', render: (v: string) => formatDateTimeSeconds(v) },
            ]}
          />
        </Card>
      )}
    </Space>
  );
}

// ---------- 访问分析（页签：栏目统计/内容与排行） ----------

function VisitsInner() {
  const { siteId } = useSite();
  const { preset, range, apply } = useDateRange();
  const [tab, setTab] = useState<'folders' | 'contents'>('folders');
  const [folderData, setFolderData] = useState<{ rows: FolderRow[]; deleted: FolderRow[] }>({ rows: [], deleted: [] });
  const [metric, setMetric] = useState<'pv' | 'play'>('pv');
  const [period, setPeriod] = useState<'total' | 'month' | 'week' | 'range'>('total');
  const [rank, setRank] = useState<{ from: string; to: string; totalFrom: string; rows: ContentRankRow[] }>({ from: '', to: '', totalFrom: '', rows: [] });
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [urls, setUrls] = useState<UrlRow[]>([]);
  const [searchTerms, setSearchTerms] = useState<SearchTermRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFolders = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try { setFolderData(await analyticsApi.folders(siteId, range[0], range[1])); }
    catch { /* 拦截器已提示 */ }
    finally { setLoading(false); }
  }, [siteId, range]);

  const loadContents = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [rk, tp, u, st, ar] = await Promise.all([
        analyticsApi.contentRank(siteId, {
          period: period === 'range' ? undefined : period,
          metric,
          from: period === 'range' ? range[0] : undefined,
          to: period === 'range' ? range[1] : undefined,
        }),
        analyticsApi.contentTypes(siteId, range[0], range[1]),
        analyticsApi.urlRank(siteId, range[0], range[1]),
        analyticsApi.searchTerms(siteId, range[0], range[1]),
        analyticsApi.assetRank(siteId, range[0], range[1]),
      ]);
      setRank(rk); setTypes(tp); setUrls(u); setSearchTerms(st); setAssets(ar);
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  }, [siteId, range, metric, period]);

  useEffect(() => { if (tab === 'folders') void loadFolders(); }, [tab, loadFolders]);
  useEffect(() => { if (tab === 'contents') void loadContents(); }, [tab, loadContents]);

  const folderColumns = [
    { title: t('栏目'), dataIndex: 'title', render: (v: string) => v || <Text type="secondary">{t('已删除栏目')}</Text> },
    { title: t('路径'), dataIndex: 'path', ellipsis: true },
    { title: t('PV（含子栏目）'), dataIndex: 'pv' },
    { title: t('直接 PV'), dataIndex: 'directPv' },
    { title: 'UV', dataIndex: 'uv' },
    { title: t('IP 数'), dataIndex: 'ipCount' },
    { title: t('会话数'), dataIndex: 'sessionCount' },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <RangePicker preset={preset} range={range} onChange={apply} />
        {tab === 'contents' && (
          <>
            <Segmented value={period} onChange={(v) => setPeriod(String(v) as typeof period)} options={[
              { label: t('总排行'), value: 'total' }, { label: t('月排行'), value: 'month' },
              { label: t('周排行'), value: 'week' }, { label: t('范围排行'), value: 'range' },
            ]} />
            <Segmented value={metric} onChange={(v) => setMetric(String(v) as typeof metric)} options={[
              { label: t('按浏览量'), value: 'pv' }, { label: t('按播放量'), value: 'play' },
            ]} />
          </>
        )}
        <Button icon={<ReloadOutlined />} onClick={() => void (tab === 'folders' ? loadFolders() : loadContents())}>{t('刷新')}</Button>
        {tab === 'contents' && rank.totalFrom && <Text type="secondary">{t('总排行自')} {rank.totalFrom}  {t('起累计')}</Text>}
      </Space>
      <Segmented value={tab} onChange={(v) => setTab(String(v) as typeof tab)} options={[
        { label: t('栏目统计'), value: 'folders' },
        { label: t('内容与排行'), value: 'contents' },
      ]} />
      {tab === 'folders' && (
        <>
          <ChartTableCard<FolderRow>
            title={t('栏目访问统计（逐级下钻，按含子栏目 PV）')} valueLabel="PV" defaultKind="bar"
            data={folderData.rows.slice(0, 15).map((r) => ({ name: r.title || t('已删除栏目'), value: r.pv }))}
            rowKey={(r) => r.folderId}
            filterKey={(r) => r.title || t('已删除栏目')}
            tableRows={folderData.rows}
            emptyText={t('暂无栏目数据')}
            columns={folderColumns as never}
          />
          {folderData.deleted.length > 0 && (
            <Card title={t('已删除栏目的历史数据')} size="small">
              <Table<FolderRow>
                rowKey="folderId" size="small" pagination={false} dataSource={folderData.deleted}
                columns={folderColumns as never}
              />
            </Card>
          )}
        </>
      )}
      {tab === 'contents' && (
        <>
          <Card title={t('内容点击排行')} size="small">
            <Table<ContentRankRow>
              rowKey="contentId" size="small" pagination={{ pageSize: 10 }} dataSource={rank.rows} loading={loading}
              locale={{ emptyText: <Empty description={t('暂无数据')} /> }}
              columns={[
                { title: t('标题'), dataIndex: 'title', ellipsis: true },
                { title: t('栏目'), dataIndex: 'folderTitle' },
                { title: t('类型'), dataIndex: 'typeName' },
                {
                  // OBS-11-04：AI 批量建稿写入的 actor 是用户 ID，后端已解析为用户名（createdByName）并回退
                  title: t('创建者'), dataIndex: 'createdBy',
                  render: (v: string | null | undefined, row: ContentRankRow) =>
                    row.createdByName || v || '—',
                },
                { title: 'PV', dataIndex: 'pv' },
                { title: 'UV', dataIndex: 'uv' },
                { title: t('播放量'), dataIndex: 'playCount' },
                { title: t('页均停留(ms)'), dataIndex: 'avgDurationMs' },
              ]}
            />
          </Card>
          <Row gutter={16}>
            <Col span={12}>
              <ChartTableCard<TypeRow>
                title={t('内容类型统计')} valueLabel="PV" defaultKind="pie"
                data={types.map((t) => ({ name: t.typeName, value: t.pv }))}
                rowKey={(r) => r.contentTypeId}
                filterKey={(r) => r.typeName}
                tableRows={types}
                emptyText={t('暂无数据')}
                columns={[
                  { title: t('类型'), dataIndex: 'typeName' },
                  { title: 'PV', dataIndex: 'pv' },
                  { title: 'UV', dataIndex: 'uv' },
                ]}
              />
            </Col>
            <Col span={12}>
              <ChartTableCard<UrlRow>
                title={t('URL 点击排行（90 天明细）')} valueLabel="PV" defaultKind="bar"
                data={urls.slice(0, 10).map((u) => ({ name: u.path, value: u.pv }))}
                rowKey={(r) => r.path}
                filterKey={(r) => r.path}
                tableRows={urls}
                emptyText={t('暂无数据')}
                columns={[
                  { title: 'URL', dataIndex: 'path', ellipsis: true },
                  { title: 'PV', dataIndex: 'pv' },
                  { title: 'UV', dataIndex: 'uv' },
                ]}
              />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Card title={t('站内搜索词排行')} size="small">
                <Table<SearchTermRow>
                  rowKey="keyword" size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={searchTerms} loading={loading}
                  locale={{ emptyText: <Empty description={t('暂无搜索词数据')} /> }}
                  columns={[
                    { title: t('关键词'), dataIndex: 'keyword' },
                    { title: t('搜索次数'), dataIndex: 'searchCount' },
                    { title: t('独立访客'), dataIndex: 'uv' },
                    { title: t('无结果'), dataIndex: 'zeroHitCount' },
                  ]}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card title={t('媒体资产排行')} size="small">
                <Table<AssetRow>
                  rowKey="mediaAssetId" size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={assets} loading={loading}
                  locale={{ emptyText: <Empty description={t('暂无数据')} /> }}
                  columns={[
                    { title: t('资产'), dataIndex: 'mediaAssetId', ellipsis: true },
                    { title: t('播放量'), dataIndex: 'playCount' },
                    { title: t('会话数'), dataIndex: 'playSessionCount' },
                    { title: t('观看时长(ms)'), dataIndex: 'watchedMsTotal' },
                    { title: t('流量(bytes)'), dataIndex: 'trafficBytesTotal' },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Space>
  );
}

// ---------- 来源分析 ----------

function SourcesInner() {
  const { siteId } = useSite();
  const { preset, range, apply } = useDateRange();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try { setSources(await analyticsApi.sources(siteId, range[0], range[1])); }
    catch { /* 拦截器已提示 */ }
    finally { setLoading(false); }
  }, [siteId, range]);

  useEffect(() => { void load(); }, [load]);

  const SOURCE_LABEL: Record<string, string> = {
    DIRECT: t('直接输入'), SEARCH_ENGINE: t('搜索引擎'), REFERRAL: t('外部链接'), CAMPAIGN: t('营销活动'),
  };
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sources) {
      const name = SOURCE_LABEL[s.sourceType] ?? s.sourceType;
      map.set(name, (map.get(name) ?? 0) + s.pv);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [sources]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <RangePicker preset={preset} range={range} onChange={apply} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
      </Space>
      <Spin spinning={loading}>
      <ChartTableCard<SourceRow>
        title={t('来源分布')} valueLabel="PV" defaultKind="pie"
        data={data}
        rowKey={(r) => `${r.sourceType}-${r.detail}`}
        filterKey={(r) => SOURCE_LABEL[r.sourceType] ?? r.sourceType}
        tableRows={sources}
        emptyText={t('暂无来源数据')}
        columns={[
          { title: t('来源'), dataIndex: 'sourceType', render: (v: unknown) => SOURCE_LABEL[String(v)] ?? String(v) },
          { title: t('明细'), dataIndex: 'detail' },
          { title: 'PV', dataIndex: 'pv' },
          { title: 'UV', dataIndex: 'uv' },
        ]}
      />
      </Spin>
    </Space>
  );
}

// ---------- 客户端分析（操作系统/浏览器/语言/屏幕分辨率/设备类型） ----------

const CLIENT_DIMS = [
  { value: 'os', label: '操作系统' },
  { value: 'browser', label: '浏览器' },
  { value: 'language', label: '语言' },
  { value: 'screen', label: '屏幕分辨率' },
  { value: 'device', label: '设备类型' },
] as const;

function ClientsInner() {
  const { siteId } = useSite();
  const { preset, range, apply } = useDateRange();
  const [dim, setDim] = useState<string>('os');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try { setClients(await analyticsApi.clients(siteId, dim, range[0], range[1])); }
    catch { /* 拦截器已提示 */ }
    finally { setLoading(false); }
  }, [siteId, dim, range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <RangePicker preset={preset} range={range} onChange={apply} />
        <Segmented value={dim} onChange={(v) => setDim(String(v))} options={CLIENT_DIMS.map((d) => ({ label: d.label, value: d.value }))} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
      </Space>
      <Spin spinning={loading}>
      <ChartTableCard<ClientRow>
        title={`客户端分布（${CLIENT_DIMS.find((d) => d.value === dim)?.label}）`} valueLabel="PV" defaultKind="bar"
        data={clients.map((c) => ({ name: c.value || t('未知'), value: c.pv }))}
        rowKey={(r) => r.value}
        filterKey={(r) => r.value || t('未知')}
        tableRows={clients}
        emptyText={t('暂无客户端数据')}
        columns={[
          { title: t('取值'), dataIndex: 'value' },
          { title: 'PV', dataIndex: 'pv' },
          { title: 'UV', dataIndex: 'uv' },
        ]}
      />
      </Spin>
    </Space>
  );
}

// ---------- 忠诚度分析（访问深度/访问频度/入口页） ----------

function LoyaltyInner() {
  const { siteId } = useSite();
  const { preset, range, apply } = useDateRange();
  const [depth, setDepth] = useState<BucketRow[]>([]);
  const [frequency, setFrequency] = useState<BucketRow[]>([]);
  const [entry, setEntry] = useState<{ bounceRate: number; rows: PageRankRow[] }>({ bounceRate: 0, rows: [] });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [d, f, e] = await Promise.all([
        analyticsApi.loyalty(siteId, 'depth', range[0], range[1]),
        analyticsApi.loyalty(siteId, 'frequency', range[0], range[1]),
        analyticsApi.pageRank(siteId, 'entry', range[0], range[1]),
      ]);
      setDepth(d); setFrequency(f); setEntry(e);
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  }, [siteId, range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <RangePicker preset={preset} range={range} onChange={apply} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
        <MetricHelp />
      </Space>
      <Row gutter={16}>
        <Col span={12}>
          <ChartTableCard<BucketRow>
            title={t('访问深度分布（会话浏览页数）')} valueLabel={t('会话数')} defaultKind="bar"
            data={depth.map((d) => ({ name: d.bucket, value: d.count }))}
            rowKey={(r) => r.bucket}
            filterKey={(r) => r.bucket}
            tableRows={depth}
            emptyText={t('暂无数据')}
            columns={[
              { title: t('浏览页数'), dataIndex: 'bucket' },
              { title: t('会话数'), dataIndex: 'count' },
            ]}
          />
        </Col>
        <Col span={12}>
          <ChartTableCard<BucketRow>
            title={t('访问频度分布（访客访问次数）')} valueLabel={t('访客数')} defaultKind="bar"
            data={frequency.map((d) => ({ name: d.bucket, value: d.count }))}
            rowKey={(r) => r.bucket}
            filterKey={(r) => r.bucket}
            tableRows={frequency}
            emptyText={t('暂无数据')}
            columns={[
              { title: t('访问次数'), dataIndex: 'bucket' },
              { title: t('访客数'), dataIndex: 'count' },
            ]}
          />
        </Col>
      </Row>
      <Card title={`入口页排行（跳出率 ${(entry.bounceRate * 100).toFixed(1)}%）`} size="small">
        <Table<PageRankRow>
          rowKey="path" size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={entry.rows} loading={loading}
          locale={{ emptyText: <Empty description={t('暂无数据')} /> }}
          columns={[
            { title: t('入口路径'), dataIndex: 'path', ellipsis: true },
            { title: t('进入会话数'), dataIndex: 'sessionCount' },
          ]}
        />
      </Card>
    </Space>
  );
}

// ---------- 访问记录（日期范围 + IP/标题/来源/客户端/访客筛选） ----------

function VisitsLogInner() {
  const { siteId } = useSite();
  const { preset, range, apply } = useDateRange('today');
  const [searchIn, setSearchIn] = useState<string>('ip');
  const [q, setQ] = useState('');
  const [visitorKind, setVisitorKind] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; rows: RecentVisitRow[] }>({ total: 0, rows: [] });
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setData(await analyticsApi.visitLog(siteId, {
        from: range[0], to: range[1],
        searchIn, q: q || undefined,
        visitorKind, page, size: pageSize,
      }));
    } catch { /* 拦截器已提示 */ }
    finally { setLoading(false); }
  }, [siteId, range, searchIn, q, visitorKind, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); }, [range, searchIn, q, visitorKind]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <RangePicker preset={preset} range={range} onChange={apply} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
        <Text type="secondary">{t('IP 为匿名化掩码；时间归属按站点时区')}</Text>
      </Space>
      <Card size="small">
        <Form layout="inline" onFinish={() => void load()}>
          <Form.Item label={t('筛选维度')}>
            <Select value={searchIn} onChange={setSearchIn} style={{ width: 110 }} options={[
              { value: 'ip', label: 'IP' },
              { value: 'title', label: t('标题') },
              { value: 'source', label: t('来源') },
              { value: 'client', label: t('客户端') },
              { value: 'os', label: t('操作系统') },
              { value: 'browser', label: t('浏览器') },
            ]} />
          </Form.Item>
          <Form.Item>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('输入关键词（模糊匹配）')} allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label={t('访客')}>
            <Select allowClear placeholder={t('全部')} value={visitorKind} onChange={setVisitorKind} style={{ width: 110 }} options={[
              { value: 'new', label: t('新访客') },
              { value: 'returning', label: t('回头访客') },
            ]} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button htmlType="submit" type="primary">{t('查询')}</Button>
              <Button onClick={() => { setQ(''); setVisitorKind(undefined); setSearchIn('ip'); }}>{t('重置')}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card title={t('访问记录')} size="small">
        <Table<RecentVisitRow>
          rowKey={(r) => `${r.occurredAt}-${r.routePath}-${r.ipMasked}`} size="small" loading={loading}
          pagination={{
            total: data.total, pageSize, current: page + 1,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p - 1),
          }}
          dataSource={data.rows}
          locale={{ emptyText: <Empty description={t('所选条件下暂无访问记录')} /> }}
          columns={[
            { title: t('时间'), dataIndex: 'occurredAt', width: 160, render: (v: string) => formatDateTimeSeconds(v) },
            { title: t('IP（匿名化）'), dataIndex: 'ipMasked' },
            { title: 'URL', dataIndex: 'routePath', ellipsis: true },
            { title: t('标题'), dataIndex: 'title', ellipsis: true },
            { title: t('来源'), dataIndex: 'sourceType', render: (v: string) => ({
              DIRECT: t('直接输入'), SEARCH_ENGINE: t('搜索引擎'), REFERRAL: t('外部链接'), CAMPAIGN: t('营销活动'),
            }[v] ?? v) },
            { title: t('客户端'), key: 'ua', render: (_: unknown, r: RecentVisitRow) => `${r.os} · ${r.browser}` },
            { title: t('访客'), dataIndex: 'isNewVisitor', render: (v: boolean) => v ? <Tag color="blue">{t('回头')}</Tag> : <Tag>{t('新访客')}</Tag> },
          ]}
        />
      </Card>
    </Space>
  );
}

// ---------- 发布统计 ----------

function PublishInner() {
  const { siteId } = useSite();
  const { preset, range, apply } = useDateRange();
  const [byUser, setByUser] = useState<PublishUserRow[]>([]);
  const [byDept, setByDept] = useState<PublishDeptRow[]>([]);
  const [byFolder, setByFolder] = useState<PublishFolderRow[]>([]);
  const [trend, setTrend] = useState<PublishTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [u, d, f, t] = await Promise.all([
        analyticsApi.publishByUser(siteId, range[0], range[1]),
        analyticsApi.publishByDepartment(siteId, range[0], range[1]),
        analyticsApi.publishByFolder(siteId),
        analyticsApi.publishTrend(siteId, range[0], range[1]),
      ]);
      setByUser(u); setByDept(d); setByFolder(f); setTrend(t);
    } catch {
      // 拦截器已提示（403 = 仅 stats 能力不可看跨用户）
    } finally {
      setLoading(false);
    }
  }, [siteId, range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <RangePicker preset={preset} range={range} onChange={apply} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('刷新')}</Button>
        <MetricHelp />
      </Space>
      <ChartTableCard<PublishTrendPoint>
        title={t('工作量趋势（每日环节计数）')} valueLabel={t('操作数')} defaultKind="line"
        data={trend.map((t) => ({ name: t.statDate, value: t.submits + t.approvals + t.rejections + t.publishes }))}
        rowKey={(r) => r.statDate}
        filterKey={(r) => r.statDate}
        tableRows={trend}
        emptyText={t('暂无流转数据')}
        columns={[
          { title: t('日期'), dataIndex: 'statDate' },
          { title: t('提交审核'), dataIndex: 'submits' },
          { title: t('批准'), dataIndex: 'approvals' },
          { title: t('驳回'), dataIndex: 'rejections' },
          { title: t('发布'), dataIndex: 'publishes' },
        ]}
      />
      <Card title={t('按用户工作量（需 stats-admin）')} size="small">
        <Table<PublishUserRow>
          rowKey="actor" size="small" pagination={{ pageSize: 10 }} dataSource={byUser} loading={loading}
          locale={{ emptyText: <Empty description={t('暂无数据或无跨用户权限')} /> }}
          columns={[
            { title: t('用户'), dataIndex: 'actor' },
            { title: t('提交'), dataIndex: 'submitted' },
            { title: t('批准'), dataIndex: 'approved' },
            { title: t('驳回'), dataIndex: 'rejected' },
            { title: t('发布'), dataIndex: 'published' },
            { title: t('撤回'), dataIndex: 'withdrawn' },
            { title: t('归档'), dataIndex: 'archived' },
            { title: t('平均审核(分)'), dataIndex: 'avgReviewMinutes' },
          ]}
        />
      </Card>
      <Row gutter={16}>
        <Col span={12}>
          <ChartTableCard<PublishDeptRow>
            title={t('按部门工作量')} valueLabel={t('操作数')} defaultKind="bar"
            data={byDept.map((d) => ({ name: d.deptName, value: d.submitted + d.approved + d.published }))}
            rowKey={(r) => r.deptName}
            filterKey={(r) => r.deptName}
            tableRows={byDept}
            emptyText={t('暂无数据')}
            columns={[
              { title: t('部门'), dataIndex: 'deptName' },
              { title: t('人数'), dataIndex: 'members' },
              { title: t('提交'), dataIndex: 'submitted' },
              { title: t('批准'), dataIndex: 'approved' },
              { title: t('发布'), dataIndex: 'published' },
            ]}
          />
        </Col>
        <Col span={12}>
          <ChartTableCard<PublishFolderRow>
            title={t('按栏目工作量（内容状态分布）')} valueLabel={t('内容数')} defaultKind="bar"
            data={byFolder.slice(0, 15).map((f) => ({ name: f.folderTitle || t('已删除栏目'), value: f.total }))}
            rowKey={(r) => r.folderId}
            filterKey={(r) => r.folderTitle || t('已删除栏目')}
            tableRows={byFolder}
            emptyText={t('暂无数据')}
            columns={[
              { title: t('栏目'), dataIndex: 'folderTitle', ellipsis: true },
              { title: t('总数'), dataIndex: 'total' },
              { title: t('草稿'), dataIndex: 'drafts' },
              { title: t('待审'), dataIndex: 'inReview' },
              { title: t('已发布'), dataIndex: 'published' },
            ]}
          />
        </Col>
      </Row>
    </Space>
  );
}

// ---------- 分区路由容器 ----------

const SECTIONS = ['overview', 'realtime', 'visits', 'sources', 'clients', 'loyalty', 'visits-log', 'publish'] as const;
type Section = (typeof SECTIONS)[number];

function sectionFromPath(pathname: string): Section {
  const last = pathname.split('/').pop() ?? '';
  return (SECTIONS as readonly string[]).includes(last) ? (last as Section) : 'overview';
}

export default function AnalyticsPage() {
  const location = useLocation();
  // 路由路径实时派生分区：点击左侧菜单（navigate）即可切换，无需重新挂载组件
  const section = sectionFromPath(location.pathname);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('section') !== section) {
      url.searchParams.set('section', section);
      window.history.replaceState(null, '', url.toString());
    }
  }, [section]);
  return (
    <RequireSite>
      {section === 'overview' && <OverviewInner />}
      {section === 'realtime' && <RealtimeInner />}
      {section === 'visits' && <VisitsInner />}
      {section === 'sources' && <SourcesInner />}
      {section === 'clients' && <ClientsInner />}
      {section === 'loyalty' && <LoyaltyInner />}
      {section === 'visits-log' && <VisitsLogInner />}
      {section === 'publish' && <PublishInner />}
    </RequireSite>
  );
}
