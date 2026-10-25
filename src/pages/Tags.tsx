import { useEffect, useState } from 'react';
import { Button, Card, Empty, Space, Spin, Tag, Typography, message } from 'antd';
import { CloudOutlined, ReloadOutlined } from '@ant-design/icons';
import { tagsApi } from '../api';
import { RequireSite, useSite } from '../context/SiteContext';
import { t } from '../i18n/locale';

function TagsInner() {
  const { siteId } = useSite();
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setTags(await tagsApi.cloud(siteId));
    } catch {
      message.error(t('加载标签云失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const max = tags.length ? Math.max(...tags.map((t) => t.count)) : 0;

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          
          {t('标签云')}
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          
          {t('刷新')}
        </Button>
      </Space>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : tags.length ? (
          <Space wrap size={[8, 12]}>
            {tags.map((t) => {
              const ratio = max > 0 ? t.count / max : 0;
              const size = 12 + Math.round(ratio * 18);
              return (
                <Tag
                  key={t.tag}
                  color={ratio > 0.66 ? 'volcano' : ratio > 0.33 ? 'geekblue' : 'default'}
                  style={{ fontSize: size, padding: '2px 10px' }}
                >
                  <CloudOutlined style={{ marginRight: 4 }} />
                  {t.tag} <span style={{ opacity: 0.6 }}>({t.count})</span>
                </Tag>
              );
            })}
          </Space>
        ) : (
          <Empty description={t('暂无标签。在含 TAG 字段的内容中录入标签后，将在此聚合展示。')} />
        )}
      </Card>
    </div>
  );
}

export default function TagsPage() {
  return (
    <RequireSite>
      <TagsInner />
    </RequireSite>
  );
}
