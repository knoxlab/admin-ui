import { useState } from 'react';
import { Alert, Button, Tooltip } from 'antd';
import type { AlertProps } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { t } from '../i18n/locale';

/**
 * 页面提示信息层（可关闭 + 可恢复）：
 * - {@link PageHintAlert} 渲染页面顶部的信息提示层，右上角关闭图标可隐藏；
 * - 隐藏后由页面在标题/工具栏右上角渲染 {@link PageHintRestore}（「?」图标）恢复显示。
 *
 * 用法：
 *   const hint = usePageHint();
 *   ...
 *   <PageHintRestore hint={hint} />            // 标题行右侧
 *   ...
 *   <PageHintAlert hint={hint} message={t('…')} />
 */
export interface PageHintController {
  visible: boolean;
  close: () => void;
  show: () => void;
}

/** 页面提示层可见性状态：默认可见。 */
export function usePageHint(): PageHintController {
  const [visible, setVisible] = useState(true);
  return {
    visible,
    close: () => setVisible(false),
    show: () => setVisible(true),
  };
}

/**
 * 可关闭的页面信息提示层；隐藏时渲染 null。
 * 接受任意 AlertProps（如 data-testid、action）以适配各页面与测试；
 * `closable`/`onClose` 由组件固定接管，确保始终可关闭。
 */
export function PageHintAlert({
  hint,
  style,
  ...props
}: { hint: PageHintController } & AlertProps) {
  if (!hint.visible) return null;
  return (
    <Alert
      {...props}
      type={props.type ?? 'info'}
      showIcon
      closable
      onClose={hint.close}
      style={{ marginBottom: 16, ...style }}
    />
  );
}

/**
 * 标题/工具栏右上角的「?」恢复按钮；提示层可见时渲染 null。
 * 无标题行的页面可用 `alignRight` 让按钮右对齐成独立行。
 */
export function PageHintRestore({ hint, alignRight }: { hint: PageHintController; alignRight?: boolean }) {
  if (hint.visible) return null;
  const node = (
    <Tooltip title={t('显示页面说明')}>
      <Button aria-label={t('显示页面说明')} icon={<QuestionCircleOutlined />} onClick={hint.show} />
    </Tooltip>
  );
  return alignRight ? <div style={{ textAlign: 'right' }}>{node}</div> : node;
}
