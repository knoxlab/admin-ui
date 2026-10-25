import { useCallback, useState, type ReactNode } from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { AppstoreOutlined, BarsOutlined, DownOutlined, TableOutlined } from '@ant-design/icons';
import { t } from '../i18n/locale';

/**
 * 内容类列表的显示方式（内容搜索 / 页面管理）：
 * 缩略图、列表、表格三种，通过下拉菜单切换并记忆到 localStorage。
 */
export type ListViewMode = 'thumbnail' | 'list' | 'table';

export const LIST_VIEW_MODES: ListViewMode[] = ['thumbnail', 'list', 'table'];

export const LIST_VIEW_LABELS: Record<ListViewMode, string> = {
  thumbnail: '缩略图',
  list: '列表',
  table: '表格',
};

const OPTIONS: { value: ListViewMode; label: string; icon: ReactNode }[] = [
  { value: 'thumbnail', label: '缩略图', icon: <AppstoreOutlined /> },
  { value: 'list', label: '列表', icon: <BarsOutlined /> },
  { value: 'table', label: '表格', icon: <TableOutlined /> },
];

function isListViewMode(value: string | null): value is ListViewMode {
  return value === 'thumbnail' || value === 'list' || value === 'table';
}

function readListViewMode(storageKey: string, fallback: ListViewMode): ListViewMode {
  try {
    const stored = localStorage.getItem(storageKey);
    return isListViewMode(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

/** 记忆用户选择的显示方式；默认表格，保持既有列表交互不变。 */
export function useListViewMode(
  storageKey: string,
  fallback: ListViewMode = 'table',
): [ListViewMode, (mode: ListViewMode) => void] {
  const [mode, setMode] = useState<ListViewMode>(() => readListViewMode(storageKey, fallback));
  const change = useCallback((next: ListViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* 隐私模式等无法写入时仅本次会话生效 */
    }
  }, [storageKey]);
  return [mode, change];
}

export default function ViewModeDropdown({
  value,
  onChange,
  size,
}: {
  value: ListViewMode;
  onChange: (mode: ListViewMode) => void;
  size?: 'small' | 'middle' | 'large';
}) {
  const current = OPTIONS.find((option) => option.value === value) ?? OPTIONS[2];
  const menu: MenuProps = {
    selectable: true,
    selectedKeys: [value],
    items: OPTIONS.map((option) => ({
      key: option.value,
      icon: option.icon,
      label: t(option.label),
    })),
    onClick: ({ key }) => {
      if (isListViewMode(key)) onChange(key);
    },
  };
  return (
    <Dropdown trigger={['click']} menu={menu}>
      <Button size={size} icon={current.icon} title={t('切换显示方式')} aria-label={t('切换显示方式')}>
        {t(current.label)}
        <DownOutlined style={{ fontSize: 10, marginInlineStart: 4 }} />
      </Button>
    </Dropdown>
  );
}
