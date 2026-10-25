import { useEffect, useMemo, useState } from 'react';
import { Button, Col, Divider, Form, Input, Modal, Row, Select, Space, TreeSelect, Typography, message } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';
import { categoriesApi } from '../api';
import type { Category } from '../api/types';
import {
  codeInRange,
  composeClassNumber,
  findImitationRule,
  flattenRegionTree,
  gyz199Subdivision,
  imitationSuffix,
  regionToTreeData,
  resolveSpecialTables,
  type ComposeParts,
} from '../utils/gyz199Compose';
import { t } from '../i18n/locale';

function flattenCats(cats: Category[], acc: Category[] = []): Category[] {
  for (const c of cats) {
    acc.push(c);
    if (c.children?.length) flattenCats(c.children, acc);
  }
  return acc;
}

function findCat(cats: Category[], id: string): Category | undefined {
  return flattenCats(cats).find((c) => c.id === id);
}

export type ClassComposeResult = {
  classNumber: string;
  classCaption: string;
};

type Props = {
  siteId: string;
  taxonomyRoot?: string;
  baseCategoryId?: string;
  baseCode?: string;
  baseName?: string;
  open: boolean;
  onCancel: () => void;
  onApply: (result: ClassComposeResult) => void;
};

/**
 * GY/Z 199 附录 E 组号助手：在已选主类上继续仿分 / 专类复分 / 地区·民族复分 / 总论复分。
 */
export default function ClassNumberComposer({
  siteId,
  taxonomyRoot,
  baseCategoryId,
  baseCode: baseCodeProp,
  baseName: baseNameProp,
  open,
  onCancel,
  onApply,
}: Props) {
  const [taxTree, setTaxTree] = useState<Category[]>([]);
  const [imitationId, setImitationId] = useState<string>();
  const [imitationManual, setImitationManual] = useState<string>();
  const [specialCode, setSpecialCode] = useState<string>();
  const [worldCode, setWorldCode] = useState<string>();
  const [chinaCode, setChinaCode] = useState<string>();
  const [nationCode, setNationCode] = useState<string>();
  const [generalCode, setGeneralCode] = useState<string>();

  useEffect(() => {
    if (!open || !siteId) return;
    void categoriesApi.tree(siteId).then((all) => {
      if (taxonomyRoot) {
        const root = findCat(all, taxonomyRoot);
        setTaxTree(root?.children?.length ? root.children : root ? [root] : []);
      } else {
        setTaxTree(all);
      }
    });
  }, [open, siteId, taxonomyRoot]);

  useEffect(() => {
    if (!open) return;
    setImitationId(undefined);
    setImitationManual(undefined);
    setSpecialCode(undefined);
    setWorldCode(undefined);
    setChinaCode(undefined);
    setNationCode(undefined);
    setGeneralCode(undefined);
  }, [open, baseCategoryId, baseCodeProp]);

  const flatTax = useMemo(() => flattenCats(taxTree), [taxTree]);
  const baseCat = baseCategoryId ? flatTax.find((c) => c.id === baseCategoryId) : undefined;
  const baseCode = baseCodeProp || baseCat?.pathAlias || '';
  const baseName = baseNameProp || baseCat?.name || '';

  const rule = useMemo(() => (baseCode ? findImitationRule(baseCode) : undefined), [baseCode]);

  const imitationOptions = useMemo(() => {
    if (!rule?.fromCode || !rule?.toCode) return [];
    return flatTax
      .filter((c) => c.pathAlias && codeInRange(c.pathAlias, rule.fromCode!, rule.toCode!))
      .map((c) => ({
        value: c.id,
        label: `${c.pathAlias} ${c.name}`,
        code: c.pathAlias,
        name: c.name,
      }));
  }, [flatTax, rule]);

  const imitationFull = imitationId
    ? flatTax.find((c) => c.id === imitationId)
    : undefined;

  const specialTables = useMemo(
    () => (baseCode ? resolveSpecialTables(baseCode, imitationFull?.pathAlias) : []),
    [baseCode, imitationFull?.pathAlias],
  );

  const specialOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; name: string; table: string }[] = [];
    for (const table of specialTables) {
      for (const it of table.items) {
        if (seen.has(it.code)) continue;
        seen.add(it.code);
        opts.push({
          value: it.code,
          label: `${it.code} ${it.name}（${table.title}）`,
          name: it.name,
          table: table.title,
        });
      }
    }
    return opts;
  }, [specialTables]);

  const worldFlat = useMemo(() => flattenRegionTree(gyz199Subdivision.world.tree), []);
  const chinaFlat = useMemo(() => flattenRegionTree(gyz199Subdivision.china.tree), []);

  const preview = useMemo(() => {
    if (!baseCode) return { classNumber: '', classCaption: '' };
    const imitationCode = imitationFull?.pathAlias;
    let suffix: string | undefined;
    let imitationName: string | undefined;
    if (imitationCode && rule?.stripPrefix) {
      suffix = imitationSuffix(imitationCode, rule.stripPrefix);
      imitationName = imitationFull?.name;
    } else if (imitationManual?.trim()) {
      suffix = imitationManual.trim();
    }

    const special = specialOptions.find((o) => o.value === specialCode);
    const world = worldFlat.find((n) => n.code === worldCode);
    const china = chinaFlat.find((n) => n.code === chinaCode);
    const nation = gyz199Subdivision.nation.items.find((n) => n.code === nationCode);
    const general = gyz199Subdivision.general.items.find((n) => n.code === generalCode);

    const parts: ComposeParts = {
      baseCode,
      baseName,
      imitationSuffix: suffix,
      imitationName,
      specialCode,
      specialName: special?.name,
      worldCode,
      worldName: world?.name,
      chinaCode,
      chinaName: china?.name,
      nationCode,
      nationName: nation?.name,
      generalCode,
      generalName: general?.name,
      order: rule?.order,
    };
    return composeClassNumber(parts);
  }, [
    baseCode,
    baseName,
    imitationFull,
    imitationManual,
    rule,
    specialCode,
    specialOptions,
    worldCode,
    worldFlat,
    chinaCode,
    chinaFlat,
    nationCode,
    generalCode,
  ]);

  const orderHint = (rule?.order || gyz199Subdivision.defaultOrder).join(' → ');

  const apply = () => {
    if (!baseCode) {
      message.warning(t('请先选择主表分类'));
      return;
    }
    onApply(preview);
  };

  return (
    <Modal
      title={t('分类号组号（GY/Z 199 附录 E）')}
      open={open}
      onCancel={onCancel}
      width={720}
      okText={t('写入分类号')}
      onOk={apply}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text type="secondary">{t('主表类号')}</Typography.Text>
          <div>
            <Typography.Text strong>
              {baseCode || '—'} {baseName}
            </Typography.Text>
          </div>
          {rule && (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
              
              {t('规则：')}{rule.label}  {t('· 组号次序')} {orderHint}
            </Typography.Paragraph>
          )}
          {!rule && baseCode && (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
              
              {t('未配置专用仿分规则时，仍可使用总论/地区/民族复分；专类复分按类号前缀匹配。')}
            </Typography.Paragraph>
          )}
        </div>

        <Divider style={{ margin: '4px 0' }} />

        <Row gutter={[12, 12]}>
          {rule?.fromCode && rule?.toCode ? (
            <Col span={24}>
              <Form.Item label={`仿分（${rule.fromCode}～${rule.toCode}）`} style={{ marginBottom: 0 }}>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('从被仿类目中选择，自动取后缀')}
                  value={imitationId}
                  onChange={(v) => {
                    setImitationId(v);
                    setImitationManual(undefined);
                  }}
                  options={imitationOptions}
                />
              </Form.Item>
            </Col>
          ) : (
            <Col span={24}>
              <Form.Item
                label={t('仿分后缀（手填）')}
                style={{ marginBottom: 0 }}
                extra={t('主表注释要求仿分时填写后缀，如 13、1923、211511')}
              >
                <Input
                  allowClear
                  placeholder={t('例如 211511')}
                  value={imitationManual}
                  onChange={(e) => setImitationManual(e.target.value)}
                />
              </Form.Item>
            </Col>
          )}

          <Col xs={24} md={12}>
            <Form.Item
              label={t('专类复分')}
              style={{ marginBottom: 0 }}
              extra={specialTables.length ? specialTables.map((t) => t.title).join('、') : t('当前类无匹配专类表时可手选空')}
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={specialOptions.length ? t('选择专类复分号') : t('无可用专类表')}
                disabled={!specialOptions.length}
                value={specialCode}
                onChange={setSpecialCode}
                options={specialOptions}
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label={t('总论复分（—）')} style={{ marginBottom: 0 }} extra={t('附录 A · 任意类可用，只选一种')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('如 09 人物专访')}
                value={generalCode}
                onChange={setGeneralCode}
                options={gyz199Subdivision.general.items.map((i) => ({
                  value: i.code,
                  label: `${i.code} ${i.name}`,
                }))}
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label={t('世界地区表 <>')} style={{ marginBottom: 0 }} extra={t('附录 B')}>
              <TreeSelect
                allowClear
                showSearch
                treeNodeFilterProp="title"
                placeholder={t('如 546 意大利')}
                value={worldCode}
                onChange={(v) => setWorldCode(v as string | undefined)}
                treeData={regionToTreeData(gyz199Subdivision.world.tree)}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label={t('中国地区表 ()')} style={{ marginBottom: 0 }} extra={t('附录 C')}>
              <TreeSelect
                allowClear
                showSearch
                treeNodeFilterProp="title"
                placeholder={t('如 51 上海')}
                value={chinaCode}
                onChange={(v) => setChinaCode(v as string | undefined)}
                treeData={regionToTreeData(gyz199Subdivision.china.tree)}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label={t('中国民族表 {}')} style={{ marginBottom: 0 }} extra={t('附录 D')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('如 20 傈僳族')}
                value={nationCode}
                onChange={setNationCode}
                options={gyz199Subdivision.nation.items.map((i) => ({
                  value: i.code,
                  label: `${i.code} ${i.name}`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <div
          style={{
            padding: '10px 12px',
            background: '#fafafa',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
          }}
        >
          <Typography.Text type="secondary">{t('组号预览')}</Typography.Text>
          <div>
            <Typography.Text strong style={{ fontSize: 16, fontFamily: 'ui-monospace, monospace' }}>
              {preview.classNumber || '—'}
            </Typography.Text>
          </div>
          {preview.classCaption && (
            <Typography.Text type="secondary">{preview.classCaption}</Typography.Text>
          )}
        </div>
      </Space>
    </Modal>
  );
}

/** Trigger button + modal bound to Form.List row paths. */
export function ClassComposeTrigger({
  siteId,
  taxonomyRoot,
  categoryId,
  categoryCode,
  categoryName,
  onApply,
}: {
  siteId: string;
  taxonomyRoot?: string;
  categoryId?: string;
  categoryCode?: string;
  categoryName?: string;
  onApply: (result: ClassComposeResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const disabled = !categoryId && !categoryCode;

  return (
    <>
      <Button
        type="link"
        size="small"
        icon={<ApartmentOutlined />}
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{ padding: 0 }}
      >
        
        {t('复分 / 仿分 / 组号')}
      </Button>
      <ClassNumberComposer
        siteId={siteId}
        taxonomyRoot={taxonomyRoot}
        baseCategoryId={categoryId}
        baseCode={categoryCode}
        baseName={categoryName}
        open={open}
        onCancel={() => setOpen(false)}
        onApply={(r) => {
          onApply(r);
          setOpen(false);
          message.success(t('已写入分类号'));
        }}
      />
    </>
  );
}
