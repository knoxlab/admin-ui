import { useEffect, useMemo, useState } from 'react';
import { Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, GlobalOutlined } from '@ant-design/icons';
import { i18nApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { setLocale, initialLanguage, LANGUAGE_CHANGED_EVENT } from '../i18n/locale';
import { useT } from '../i18n/I18nProvider';
import { getStoredLanguage } from '../i18n/storage';

/** 静态兜底（FR-I18N-001 白名单，顺序即展示顺序）；优先使用 GET 返回的 nativeName。 */
const FALLBACK_LANGUAGES: { tag: string; nativeName: string }[] = [
  { tag: 'zh-CN', nativeName: '简体中文' },
  { tag: 'en-US', nativeName: 'English (US)' },
  { tag: 'ja-JP', nativeName: '日本語' },
  { tag: 'ko-KR', nativeName: '한국어' },
  { tag: 'fr-FR', nativeName: 'Français' },
  { tag: 'es-ES', nativeName: 'Español' },
];

/**
 * 顶部栏语言切换（FR-I18N-004）：
 * 选中后立刻切换界面文案；已登录时 PUT /me/language 持久化到 sys_user.language。
 */
export default function LanguageSwitcher() {
  const t = useT();
  const { username } = useAuth();
  const [current, setCurrent] = useState<string>(initialLanguage);
  const [available, setAvailable] = useState<{ tag: string; nativeName: string }[]>(FALLBACK_LANGUAGES);

  useEffect(() => {
    const sync = (e: Event) => {
      const tag = (e as CustomEvent<string>).detail;
      if (tag) setCurrent(tag);
    };
    window.addEventListener(LANGUAGE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!username) return;
    let active = true;
    i18nApi
      .current()
      .then((data) => {
        if (!active) return;
        if (data.available?.length) setAvailable(data.available);
        const local = getStoredLanguage();
        if (local) {
          setCurrent(local);
          if (data.language && data.language !== local) {
            void i18nApi.update(local).catch(() => undefined);
          }
        } else if (data.language) {
          setCurrent(data.language);
          setLocale(data.language);
        }
      })
      .catch(() => {
        /* 未登录或网络异常时保持本地值，不弹错误 */
      });
    return () => {
      active = false;
    };
  }, [username]);

  const items = useMemo<MenuProps['items']>(
    () =>
      available.map((l) => ({
        key: l.tag,
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14 }}>{current === l.tag && <CheckOutlined />}</span>
            <span>{l.nativeName}</span>
          </span>
        ),
      })),
    [available, current],
  );

  const handleSelect: MenuProps['onClick'] = async ({ key }) => {
    const tag = String(key);
    if (tag === current) return;
    const previous = current;
    setCurrent(tag);
    setLocale(tag);
    if (!username) return;
    try {
      const data = await i18nApi.update(tag);
      if (data.language && data.language !== tag) {
        setCurrent(data.language);
        setLocale(data.language);
      }
      message.success(data.message || t('语言偏好已保存: {tag}', { tag: data.language || tag }));
    } catch {
      setCurrent(previous);
      setLocale(previous);
    }
  };

  const activeLabel = available.find((l) => l.tag === current)?.nativeName || current;

  return (
    <Dropdown menu={{ items, selectable: true, selectedKeys: [current], onClick: handleSelect }} placement="bottomRight" trigger={['click']}>
      <button
        type="button"
        aria-label={t('切换语言')}
        title={t('语言: {name}', { name: activeLabel })}
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px',
          borderRadius: 6,
          color: 'inherit',
          fontSize: 13,
        }}
      >
        <GlobalOutlined style={{ fontSize: 18 }} />
        <span>{current.split('-')[0].toUpperCase()}</span>
      </button>
    </Dropdown>
  );
}
