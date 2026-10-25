import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Input, Space, Table, Tag, Typography, message } from 'antd';
import { LinkOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { relationsApi, searchApi } from '../api';
import type { RelatedContent } from '../api/types';
import { RequireSite, useSite } from '../context/SiteContext';
import { isSystemAdmin, useAuth } from '../auth/AuthContext';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';

interface SearchHit {
  contentId: string;
  title: string;
  status?: string | null;
  highlight?: Record<string, string[]> | null;
}

/** 把后端高亮片段渲染为 {@code <mark>}：只识别索引层的 em/mark 标签，其余内容一律转义展示。 */
function HighlightFragment({ html }: { html: string }) {
  const parts = html.split(/(<em>.*?<\/em>|<mark>.*?<\/mark>)/gs).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^<(em|mark)>(.*)<\/(?:em|mark)>$/s.exec(part);
        return match
          ? <mark key={index}>{stripTags(match[2])}</mark>
          : <span key={index}>{stripTags(part)}</span>;
      })}
    </>
  );
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, '');
}

/** 高亮键是索引键（`f_<code>` / `f_<code>.kw`），展示时还原为字段 code。 */
function highlightFieldLabel(key: string): string {
  return key.replace(/^f_/, '').replace(/\.kw$/, '');
}

function SearchInner() {
  const { siteId } = useSite();
  const { me } = useAuth();
  const admin = isSystemAdmin(me);
  const hint = usePageHint();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mappingStale, setMappingStale] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [relQuery, setRelQuery] = useState('');
  const [relResults, setRelResults] = useState<RelatedContent[]>([]);

  const loadMappingState = useCallback(async (site: string) => {
    try {
      const state = await searchApi.mappingState(site);
      setMappingStale(state.rebuildRequired);
    } catch {
      // 映射状态是辅助信息，读取失败不阻塞检索
    }
  }, []);

  useEffect(() => {
    if (siteId) void loadMappingState(siteId);
  }, [siteId, loadMappingState]);

  const runSearch = async () => {
    if (!q.trim()) {
      message.warning(t('请输入搜索关键词'));
      return;
    }
    setSearching(true);
    setSearched(true);
    try {
      const data = await searchApi.query(siteId!, { query: q.trim() });
      setHits(data.hits || []);
      setCursor(data.nextCursor || null);
    } catch {
      // axios 拦截器已提示错误原因
    } finally {
      setSearching(false);
    }
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const data = await searchApi.query(siteId!, { query: q.trim(), cursor });
      setHits((prev) => [...prev, ...(data.hits || [])]);
      setCursor(data.nextCursor || null);
    } catch {
      // 拦截器已提示
    } finally {
      setLoadingMore(false);
    }
  };

  const runRebuild = async () => {
    setRebuilding(true);
    try {
      await searchApi.rebuild(siteId!);
      try {
        await searchApi.rebuildPublic(siteId!);
      } catch {
        // 访客索引重建失败不阻断，最终以服务端 mapping-state 为准
      }
      const state = await searchApi.mappingState(siteId!);
      setMappingStale(state.rebuildRequired);
      if (state.rebuildRequired) {
        message.warning(t('管理索引已重建，访客索引仍待重建'));
      } else {
        message.success(t('索引重建完成，可重新搜索'));
      }
    } catch {
      // axios 拦截器已提示错误原因
    } finally {
      setRebuilding(false);
    }
  };

  const runRelatedQuery = async () => {
    setRelResults(await relationsApi.searchByRelated(siteId!, relQuery));
  };

  const directionTag = (direction: RelatedContent['direction']) => {
    if (direction === 'both') return <Tag color="geekblue">{t('双向')}</Tag>;
    if (direction === 'incoming') return <Tag color="orange">{t('入向')}</Tag>;
    return <Tag color="green">{t('出向')}</Tag>;
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{t('检索管理')}</Typography.Title>
        <PageHintRestore hint={hint} />
      </Space>
      <Typography.Paragraph type="secondary">
        {t('管理索引覆盖当前站点全部内容（含草稿与审核中），查询结果按权限过滤；新建或修改内容会自动写入索引。')}
      </Typography.Paragraph>
      <Space style={{ marginBottom: 16 }}>
        <Input
          style={{ width: 360 }}
          placeholder={t('搜索标题或正文关键词')}
          value={q}
          allowClear
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={runSearch}
        />
        <Button type="primary" icon={<SearchOutlined />} loading={searching} onClick={runSearch}>
          {t('搜索')}
        </Button>
        <Button icon={<ReloadOutlined />} loading={rebuilding} disabled={!admin} onClick={runRebuild}>
          {t('重建索引')}
        </Button>
      </Space>
      {mappingStale && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          data-testid="mapping-stale"
          style={{ marginBottom: 16 }}
          message={t('内容模型的索引属性已变更，索引需重建')}
          description={t('模型的「可排序/可过滤/高亮」属性改变后，索引里的字段结构不会自动更新；重建前按这些字段排序或过滤会失败。')}
          action={admin ? (
            <Button size="small" type="primary" loading={rebuilding} onClick={() => void runRebuild()}>
              {t('立即重建')}
            </Button>
          ) : undefined}
        />
      )}
      {!admin && (
        <PageHintAlert
          hint={hint}
          message={t('索引重建仅系统管理员可操作')}
          description={t('您仍可检索当前站点内容（含草稿），但无法触发全量索引重建。')}
        />
      )}
      <Table
        rowKey="contentId"
        loading={searching}
        dataSource={hits}
        pagination={false}
        locale={{
          emptyText: searched
            ? t('未找到匹配内容。若刚创建内容仍搜不到，请点击「重建索引」后重试。')
            : t('输入关键词后点击「搜索」'),
        }}
        columns={[
          {
            title: t('标题'),
            dataIndex: 'title',
            ellipsis: true,
            render: (value: string, hit: SearchHit) => {
              const fragments = hit.highlight?.title || [];
              return fragments.length
                ? <span>{fragments.map((f, i) => <HighlightFragment key={i} html={f} />)}</span>
                : value;
            },
          },
          {
            title: t('状态'),
            dataIndex: 'status',
            width: 120,
            render: (value?: string | null) => value ? <Tag>{value}</Tag> : '—',
          },
          {
            title: t('内容 ID'),
            dataIndex: 'contentId',
            width: 140,
            render: (value: string) => <Typography.Text code>{value.slice(0, 8)}</Typography.Text>,
          },
          {
            title: t('高亮片段'),
            dataIndex: 'highlight',
            width: 320,
            render: (_: unknown, hit: SearchHit) => {
              const entries = Object.entries(hit.highlight || {}).filter(([key]) => key !== 'title');
              if (!entries.length) return '—';
              return (
                <Space direction="vertical" size={2}>
                  {entries.map(([key, fragments]) => (
                    <Typography.Text key={key} style={{ fontSize: 12 }}>
                      <Tag>{highlightFieldLabel(key)}</Tag>
                      {fragments.map((f, i) => <HighlightFragment key={i} html={f} />)}
                    </Typography.Text>
                  ))}
                </Space>
              );
            },
          },
        ]}
      />
      {cursor && (
        <Button
          block
          style={{ marginTop: 8 }}
          loading={loadingMore}
          data-testid="search-load-more"
          onClick={() => void loadMore()}
        >
          {t('加载更多')}
        </Button>
      )}
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        {t('按关系过滤')}
      </Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Input
          style={{ width: 360 }}
          placeholder={t('输入关联内容的标题或 ID')}
          value={relQuery}
          onChange={(e) => setRelQuery(e.target.value)}
          onPressEnter={() => void runRelatedQuery()}
        />
        <Button icon={<LinkOutlined />} onClick={() => void runRelatedQuery()}>
          {t('查询关联内容')}
        </Button>
      </Space>
      <Table
        rowKey="id"
        dataSource={relResults}
        pagination={false}
        locale={{ emptyText: t('输入关联内容标题/ID 后查询与之存在关系的所有内容') }}
        columns={[
          { title: t('内容 ID'), dataIndex: 'id', width: 120, render: (v: string) => <Typography.Text code>{v.slice(0, 8)}</Typography.Text> },
          {
            title: t('标题'),
            dataIndex: 'title',
            render: (v?: string) => (v ? <Tag color="blue">{v}</Tag> : '—'),
          },
          {
            title: t('关系类型'),
            dataIndex: 'relations',
            render: (rels: RelatedContent['relations']) =>
              rels && rels.length ? (
                <Space size={4} wrap>
                  {rels.map((r, i) => (
                    <Tag key={`${r.relationName}-${r.direction}-${i}`} color="purple">
                      {r.relationName || '—'}
                      {r.cardinality ? ` · ${r.cardinality}` : ''}
                    </Tag>
                  ))}
                </Space>
              ) : '—',
          },
          {
            title: t('方向'),
            dataIndex: 'direction',
            width: 110,
            render: (v: RelatedContent['direction']) => directionTag(v),
          },
        ]}
      />
    </div>
  );
}

export default function SearchPage() {
  return <RequireSite><SearchInner /></RequireSite>;
}
