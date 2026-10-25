/**
 * 轻量富文本编辑器（FR-CM FT-003 / TC-M65-008）。
 *
 * <p>模型字段类型 {@code RICH_TEXT} 的编辑控件。规格要求「内置 TinyMCE/类似编辑器」：
 * 在不引入第三方依赖的前提下，用 {@code contentEditable} + {@code document.execCommand}
 * 实现工具栏（加粗/斜体/下划线/删除线、引用、列表、链接、代码示例、清除格式、撤销/重做），
 * 并提供「源码」模式直接编辑 HTML（TC-M65-008 的代码示例插入与再编辑在源码模式最可靠）。
 *
 * <p>受控契约（与 {@link ./ContentFieldControl} 相同）：原样承接 Form.Item 注入的
 * {@code value} / {@code onChange} / {@code id}；外部回填（AI 建议回填、版本恢复回填）
 * 通过 {@code useEffect} 同步到编辑区——仅在值与当前 DOM 不一致时写入，避免打字过程光标跳动。
 *
 * <p>XSS 边界：本组件只负责编辑；存储与交付侧的净化由后端 jsoup 白名单负责
 * （TC-M12-012），前端编辑区不做二次转义（所见即所存）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, ColorPicker, Dropdown, Input, InputNumber, Modal, Space, Tooltip } from 'antd';
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  ClearOutlined,
  CodeOutlined,
  CommentOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { t } from '../i18n/locale';
import RichTextMediaModal from './RichTextMediaModal';
import type { MediaKind } from './RichTextMediaModal';
import './RichTextEditor.css';

/** execCommand 产出的空编辑区形态（Chrome 系）。统一归一为空串，避免「看似有值」。 */
const EMPTY_HTML = '<p><br></p>';

function normalizeEmpty(html: string) {
  return html === EMPTY_HTML || html === '<br>' || html === '<div><br></div>' ? '' : html;
}

/**
 * 表格片段：带内联边框样式的表格（border-collapse + 单元格 1px 边框 + 内边距，表头浅底），
 * 站点主题未提供表格 CSS 时同样可见框线（所见即所存，交付侧同源呈现）；
 * 首行可选 thead 表头。rows 为总行数（含表头行）。
 *
 * <p>空单元格内放 {@code <br>} 占位（编辑器通行的 padding-br 约定）：无行盒的空 td
 * 无法命中光标落点，点击会被解析到表格外的父块——单元格将无法选中与输入。
 */
export function tableHtml(rows: number, cols: number, header: boolean): string {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const cellRow = (tag: string) => {
    const style = tag === 'th'
      ? 'border: 1px solid #d9d9d9; padding: 4px 8px; background-color: #fafafa;'
      : 'border: 1px solid #d9d9d9; padding: 4px 8px;';
    return `<tr>${`<${tag} style="${style}"><br></${tag}>`.repeat(c)}</tr>`;
  };
  const head = header ? `<thead>${cellRow('th')}</thead>` : '';
  const bodyRows = Math.max(0, header ? r - 1 : r);
  return `<table style="border-collapse: collapse; width: 100%;">${head}<tbody>${cellRow('td').repeat(bodyRows)}</tbody></table><p><br></p>`;
}

/** 空单元格补 {@code <br>} 占位（含粘贴/存量表），保证单元格可点选、可落光标。 */
export function padEmptyCells(root: HTMLElement) {
  root.querySelectorAll('td, th').forEach((cell) => {
    if (cell.childNodes.length === 0) cell.appendChild(document.createElement('br'));
  });
}

/** 字体颜色预设（8 列网格）。 */
const COLOR_SWATCHES = [
  '#000000', '#434343', '#666666', '#999999', '#c00000', '#e36c09', '#bf9000', '#38761d',
  '#0b5394', '#3d3d9e', '#741b47', '#ffffff', '#ff0000', '#ff9900', '#ffcc00', '#6aa84f',
  '#00ffff', '#4a86e8', '#a64d79', '#9999ff',
];

/** 粘贴白名单：块级/行内排版标签保留，其余（Word 命名空间标签、表单控件等）解包保留文字。 */
const PASTE_ALLOWED_TAGS = new Set([
  'P', 'BR', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'INS',
  'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'IMG', 'PRE', 'CODE', 'HR',
  'SUB', 'SUP', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION',
]);

/** 粘贴黑名单：整节点丢弃（脚本、样式表、嵌入与表单控件等）。 */
const PASTE_DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'LINK', 'META', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'XML',
]);

/**
 * 粘贴 HTML 清洗（回归缺陷 ③）：从 Word / 网页复制的片段含 mso- 样式、条件注释、
 * 命名空间标签（<o:p>、<w:...>）与脚本，直接落编辑区会造成「内容被丢弃 / 排版污染」。
 *
 * <p>清洗规则：仅保留排版白名单标签；白名单外的标签**解包**保留其文字（如 <o:p>、<font>）；
 * 黑名单标签整段丢弃；剥离 on* 事件属性、mso-* 样式声明、Mso* class；a[href] 仅放行
 * http(s)/mailto/#；img[src] 仅放行 http(s)/data:image。全文档粘贴（含 <html><body>）取 body。
 * 存储与交付侧仍由后端 jsoup 白名单兜底（TC-M12-012），此处只负责编辑区质量与所见即所存。</p>
 */
export function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  root.querySelectorAll('*').forEach((node) => {
    const tag = node.tagName.toUpperCase();
    if (PASTE_DROP_TAGS.has(tag)) {
      node.remove();
      return;
    }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
      } else if (name === 'style') {
        const kept = value
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s && !/^mso-/i.test(s) && !/^tab-stops/i.test(s))
          .join('; ');
        if (kept) node.setAttribute('style', kept);
        else node.removeAttribute('style');
      } else if (name === 'class') {
        const kept = value
          .split(/\s+/)
          .filter((c) => c && !/^Mso/i.test(c))
          .join(' ');
        if (kept) node.setAttribute('class', kept);
        else node.removeAttribute('class');
      } else if (name === 'href' && !/^(https?:|mailto:|#|\/)/i.test(value.trim())) {
        node.removeAttribute('href');
      } else if (name === 'src' && !/^(https?:|data:image\/)/i.test(value.trim())) {
        node.removeAttribute('src');
      }
    }
    if (!PASTE_ALLOWED_TAGS.has(tag)) {
      // 白名单外标签解包：保留子节点与文字，去掉标签本身（Word 的 <o:p>/<font>/<w:...> 等）
      const parent = node.parentNode;
      if (parent) {
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
      }
    }
  });
  // Word 条件注释（<!--[if gte mso 9]>...<![endif]-->）与普通注释整段去除
  return root.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim();
}

export default function RichTextEditor({
  value,
  onChange,
  disabled,
  readOnly,
  id,
  rows,
  siteId,
}: {
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /** Form.Item 注入：把 <label htmlFor> 关联到编辑区。 */
  id?: string;
  /** 可视化编辑区最小高度基准行数（约 24px/行），默认 8。 */
  rows?: number;
  /** 站点上下文：图片/视频的媒体库上传与选择需要；缺省时媒体按钮禁用。 */
  siteId?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [codeMode, setCodeMode] = useState(false);
  // 富媒体插入状态：图片/视频对话框、表格对话框、字体颜色面板。
  const [mediaModal, setMediaModal] = useState<MediaKind | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableHeader, setTableHeader] = useState(true);
  const [colorOpen, setColorOpen] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  // ---- 对象选中 / 拖拽缩放 / 表格框线调整 ----
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 当前选中的富媒体对象（img/video/iframe）或表格。 */
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  /** 鼠标悬停中的表格（亮出整体宽度手柄）。 */
  const [hoverTable, setHoverTable] = useState<HTMLTableElement | null>(null);
  const hoverTableRef = useRef<HTMLTableElement | null>(null);
  // 仅用于触发重绘：拖拽/滚动时叠加层几何随之刷新（值本身不消费）。
  const [, setGeomTick] = useState(0);

  /**
   * 选区记忆：对话框/下拉面板会夺走焦点，浏览器不再自动恢复编辑区选区。
   * 除工具栏 onMouseDown / 编辑区 onMouseUp/onKeyUp 外，另监听文档级
   * {@code selectionchange}——键盘快捷键（Ctrl+A）、Edit>全选、程序化选区等
   * 不经过编辑区鼠标/键盘事件的路径同样入账，避免着色/加粗静默落在折叠光标上。
   */
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    const box = boxRef.current;
    if (!sel || !box || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (box.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', saveSelection);
    return () => document.removeEventListener('selectionchange', saveSelection);
  }, [saveSelection]);

  const restoreSelection = useCallback(() => {
    const box = boxRef.current;
    const sel = window.getSelection();
    if (!box || !sel) return;
    const saved = savedRangeRef.current;
    const inBox = (r: Range | null | undefined): r is Range =>
      Boolean(r) && box.contains((r as Range).commonAncestorContainer);
    const live = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    // 优先级：实时非折叠选区 > 记忆选区 > 实时折叠光标 > 编辑区末尾。
    if (inBox(live) && !live.collapsed) return;
    if (inBox(saved)) {
      sel.removeAllRanges();
      sel.addRange(saved);
      return;
    }
    if (inBox(live)) return;
    sel.removeAllRanges();
    const fresh = document.createRange();
    fresh.selectNodeContents(box);
    fresh.collapse(false);
    sel.addRange(fresh);
  }, []);

  // 受控回显：外部 value 变化（初始回填 / AI 回填 / 版本恢复）同步到编辑区。
  // 仅在与 DOM 实际内容不一致时写入，避免打字过程中光标被重置。
  useEffect(() => {
    const box = boxRef.current;
    if (!box || codeMode) return;
    const next = value ?? '';
    if (normalizeEmpty(box.innerHTML) !== next && box.innerHTML !== next) {
      box.innerHTML = next;
      // 存量/粘贴表的空单元格补 <br> 占位，否则点不进去（光标落到表格外）。
      padEmptyCells(box);
      // DOM 被整体重写：对象选中 / 表格悬停状态随之失效。
      setSelectedEl(null);
      hoverTableRef.current = null;
      setHoverTable(null);
    }
  }, [value, codeMode]);

  const syncFromDom = useCallback(() => {
    const box = boxRef.current;
    if (box) onChange?.(normalizeEmpty(box.innerHTML));
  }, [onChange]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      const box = boxRef.current;
      if (!box) return;
      box.focus();
      // 弹窗/下拉会夺走焦点：先按记忆恢复编辑区选区（无记忆则落编辑区末尾），
      // 配合按钮 onMouseDown preventDefault（选区不丢失）实现工具栏操作。
      restoreSelection();
      document.execCommand(command, false, arg);
      syncFromDom();
    },
    [restoreSelection, syncFromDom],
  );

  /**
   * 原样 HTML 插入（Range API）。{@code execCommand('insertHTML')} 会经过浏览器
   * 旧式 CSS 净化：{@code <table>} 的 style 被整体剥离、{@code border} 简写被腰斩成
   * {@code border-color}——表格框线与内联布局样式无法存活。表格 / 媒体片段 / 富文本
   * 粘贴一律走此路径，所见即所存。格式命令（加粗 / 着色等）仍走 {@link #exec}。
   *
   * <p>插入后统一 {@link #padEmptyCells}（粘贴表的空单元格可点选）；
   * {@code caretToFirstCell} 供表格插入：光标落进首格，插入后即可直接输字或再插图片。
   */
  const insertHtml = useCallback(
    (html: string, opts?: { caretToFirstCell?: boolean }) => {
      const box = boxRef.current;
      if (!box) return;
      box.focus();
      restoreSelection();
      const sel = window.getSelection();
      let range: Range | null = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      // 选区不可用（或不在编辑区内）时落到编辑区末尾，保证插入不静默失败。
      if (!range || !box.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(box);
        range.collapse(false);
      }
      range.deleteContents();
      const frag = range.createContextualFragment(html);
      const last = frag.lastChild;
      range.insertNode(frag);
      padEmptyCells(box);
      if (sel && last) {
        const after = document.createRange();
        after.setStartAfter(last);
        after.collapse(true);
        if (opts?.caretToFirstCell) {
          // 表格插入：光标落进首格，插入后即可直接输字或再插图片。
          const tables = box.querySelectorAll('table');
          const cell = tables[tables.length - 1]?.querySelector('th, td');
          if (cell) {
            after.selectNodeContents(cell);
            after.collapse(true);
          }
        }
        sel.removeAllRanges();
        sel.addRange(after);
        saveSelection();
      }
      syncFromDom();
    },
    [restoreSelection, saveSelection, syncFromDom],
  );

  /** 通用拖拽会话：document 级 move/up；拖拽结束回写受控值并清理光标样式。 */
  const beginDrag = useCallback(
    (onMove: (e: MouseEvent) => void) => {
      const move = (e: MouseEvent) => {
        e.preventDefault();
        onMove(e);
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        syncFromDom();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    },
    [syncFromDom],
  );

  /**
   * 媒体对象等比缩放：沿对角手柄拖拽宽度，高度按比例联动。
   * 比例取自然尺寸（img.naturalWidth / video.videoWidth），缺省按当前框比（iframe 等）。
   */
  const startMediaResize = useCallback(
    (el: HTMLElement, corner: 'nw' | 'ne' | 'sw' | 'se', e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const ratio =
        el instanceof HTMLImageElement && el.naturalWidth > 0
          ? el.naturalWidth / Math.max(1, el.naturalHeight)
          : el instanceof HTMLVideoElement && el.videoWidth > 0
            ? el.videoWidth / Math.max(1, el.videoHeight)
            : rect.height > 0
              ? rect.width / rect.height
              : 16 / 9;
      const startW = rect.width;
      const startX = e.clientX;
      document.body.style.cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
      beginDrag((ev) => {
        const dx = ev.clientX - startX;
        const w = Math.max(32, Math.round(corner === 'ne' || corner === 'sw' ? startW - dx : startW + dx));
        el.style.width = `${w}px`;
        el.style.height = `${Math.round(w / ratio)}px`;
        // 用户显式定宽后不再被容器 max-width 压回（否则窄列内宽高压不同步）。
        el.style.maxWidth = 'none';
        setGeomTick((t) => t + 1);
      });
    },
    [beginDrag],
  );

  /**
   * 表格框线拖拽：单元格右缘拖列宽、下缘拖行高（整列 / 整行同调）。
   * 拖拽开始即锁定 {@code table-layout: fixed} + px 总宽——列宽才有确定解，
   * 否则自动布局会把拖拽量摊给其他列。
   */
  const startCellResize = useCallback(
    (cell: HTMLTableCellElement, kind: 'col' | 'row', e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const table = cell.closest('table') as HTMLTableElement | null;
      if (!table) return;
      table.style.tableLayout = 'fixed';
      table.style.width = `${Math.round(table.getBoundingClientRect().width)}px`;
      const parentRow = cell.parentElement as HTMLTableRowElement | null;
      const rowCells: HTMLElement[] = parentRow ? Array.from(parentRow.cells) : [];
      const targets: HTMLElement[] =
        kind === 'col'
          ? (Array.from(table.rows)
              .map((row) => row.cells[cell.cellIndex])
              .filter(Boolean) as HTMLElement[])
          : rowCells;
      const starts = targets.map((c) =>
        kind === 'col' ? c.getBoundingClientRect().width : c.getBoundingClientRect().height,
      );
      const startPt = kind === 'col' ? e.clientX : e.clientY;
      document.body.style.cursor = kind === 'col' ? 'col-resize' : 'row-resize';
      beginDrag((ev) => {
        const delta = (kind === 'col' ? ev.clientX : ev.clientY) - startPt;
        targets.forEach((c, i) => {
          const v = Math.max(24, Math.round(starts[i] + delta));
          if (kind === 'col') c.style.width = `${v}px`;
          else c.style.height = `${v}px`;
        });
        setGeomTick((t) => t + 1);
      });
    },
    [beginDrag],
  );

  /** 表格整体宽度拖拽（右下角手柄 / 选中态角点手柄）。 */
  const startTableResize = useCallback(
    (table: HTMLTableElement, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedEl(table);
      const startW = table.getBoundingClientRect().width;
      const startX = e.clientX;
      document.body.style.cursor = 'ew-resize';
      beginDrag((ev) => {
        table.style.width = `${Math.max(120, Math.round(startW + (ev.clientX - startX)))}px`;
        setGeomTick((t) => t + 1);
      });
    },
    [beginDrag],
  );

  const insertCode = useCallback(() => {
    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed ? sel.toString() : '';
    const snippet = `<pre><code>${selected
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</code></pre><p><br></p>`;
    insertHtml(snippet);
  }, [insertHtml]);

  const insertLink = useCallback(() => {
    const url = window.prompt(t('链接地址（URL）'));
    if (!url) return;
    exec('createLink', url);
  }, [exec]);

  /** 字体颜色：styleWithCSS + foreColor；'inherit' 即默认颜色（清除行内颜色）。 */
  const applyColor = useCallback(
    (color: string) => {
      exec('styleWithCSS', 'true');
      exec('foreColor', color);
      setColorOpen(false);
    },
    [exec],
  );

  /**
   * 水平对齐：选中对象（图片 / 视频 / 表格）按块级 {@code margin} 对齐（所见即所存，
   * 交付侧同源生效）；无选中对象时对所在段落 justify（execCommand）。
   */
  const applyAlign = useCallback(
    (dir: 'left' | 'center' | 'right') => {
      const el = selectedEl;
      if (el) {
        el.style.display = 'block';
        el.style.marginLeft = dir === 'left' ? '0' : 'auto';
        el.style.marginRight = dir === 'right' ? '0' : 'auto';
        setGeomTick((t) => t + 1);
        syncFromDom();
        return;
      }
      exec(dir === 'left' ? 'justifyLeft' : dir === 'center' ? 'justifyCenter' : 'justifyRight');
    },
    [selectedEl, exec, syncFromDom],
  );

  const disabledAll = Boolean(disabled || readOnly);
  const minHeight = useMemo(() => Math.max(3, rows ?? 8) * 24, [rows]);

  /**
   * 粘贴拦截（回归缺陷 ③）：默认粘贴会把 Word / 网页的 mso- 污染与脚本原样带入，
   * 且部分来源的内容在受控回显链路中被整体丢弃。此处显式接管：HTML 先清洗再插入，
   * 纯文本走 insertText 保留段落形态。
   */
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabledAll) return;
      e.preventDefault();
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      if (html && html.trim()) {
        insertHtml(sanitizePastedHtml(html));
      } else if (text) {
        document.execCommand('insertText', false, text);
        syncFromDom();
      }
    },
    [disabledAll, insertHtml, syncFromDom],
  );

  /**
   * 画布 mousedown 接管（对象 / 框线交互）：
   * ① 媒体对象（img/video/iframe）点选中（不落光标），角点手柄可拖拽缩放；
   * ② 单元格右缘 ±5px 拖列宽、下缘 ±5px 拖行高（框线拖拽调单元格大小）；
   * ③ 其余点击 = 正常编辑（落光标）并取消对象选中。
   */
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabledAll) return;
    const target = e.target as HTMLElement;
    const media = target.closest('img, video, iframe') as HTMLElement | null;
    if (media) {
      e.preventDefault();
      setSelectedEl(media);
      boxRef.current?.focus({ preventScroll: true });
      return;
    }
    const cell = target.closest('td, th') as HTMLTableCellElement | null;
    if (cell) {
      const r = cell.getBoundingClientRect();
      const nearRight = e.clientX >= r.right - 5;
      const nearBottom = !nearRight && e.clientY >= r.bottom - 5;
      if (nearRight || nearBottom) {
        setSelectedEl(null);
        startCellResize(cell, nearRight ? 'col' : 'row', e);
        return;
      }
    }
    setSelectedEl(null);
  };

  /** 悬停提示：框线处 col-resize / row-resize 光标；表格悬停亮出整体宽度手柄。 */
  const onCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabledAll) return;
    const box = boxRef.current;
    if (!box) return;
    const target = e.target as HTMLElement;
    const table = target.closest('table') as HTMLTableElement | null;
    if (table !== hoverTableRef.current) {
      hoverTableRef.current = table;
      setHoverTable(table);
    }
    const cell = target.closest('td, th') as HTMLTableCellElement | null;
    let cursor = '';
    if (cell) {
      const r = cell.getBoundingClientRect();
      if (e.clientX >= r.right - 5) cursor = 'col-resize';
      else if (e.clientY >= r.bottom - 5) cursor = 'row-resize';
    }
    if (box.style.cursor !== cursor) box.style.cursor = cursor;
  };

  /**
   * 对象键盘操作（document 级）：Delete/Backspace 删除选中对象、Esc 取消选中。
   * 不挂在画布上——工具栏点击后焦点常停在按钮而非编辑区，画布级收不到按键；
   * 焦点处于其他输入面（表单字段 / 弹窗输入 / 另一编辑器）时不接管，避免偷按键。
   */
  useEffect(() => {
    if (!selectedEl) return;
    const onKey = (e: KeyboardEvent) => {
      const box = boxRef.current;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const foreign =
        target &&
        target !== box &&
        (tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          (target.isContentEditable && !box?.contains(target)));
      if (foreign) return;
      if (e.key === 'Escape') {
        setSelectedEl(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStartBefore(selectedEl);
        range.collapse(true);
        selectedEl.remove();
        setSelectedEl(null);
        sel?.removeAllRanges();
        sel?.addRange(range);
        saveSelection();
        syncFromDom();
        return;
      }
      setSelectedEl(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedEl, saveSelection, syncFromDom]);

  // 叠加层几何跟随滚动 / 窗口变化（选框与手柄不漂移）。
  useEffect(() => {
    const refresh = () => setGeomTick((t) => t + 1);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, []);

  const toolButton = (icon: React.ReactNode, title: string, onClick: () => void, key?: string, extraDisabled?: boolean) => (
    <Tooltip title={title} key={key ?? title}>
      <Button
        size="small"
        type="text"
        icon={icon}
        disabled={disabledAll || extraDisabled}
        aria-label={title}
        onMouseDown={(e) => {
          saveSelection();
          e.preventDefault();
        }}
        onClick={onClick}
      />
    </Tooltip>
  );

  /** 字体颜色面板：预设色 + 默认颜色（inherit）+ 自定义取色。 */
  const colorDropdown = (
    <Dropdown
      key="字体颜色"
      open={colorOpen}
      onOpenChange={setColorOpen}
      trigger={['click']}
      popupRender={() => (
        <div
          style={{
            padding: 8,
            background: '#fff',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 22px)', gap: 4 }}>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${t('字体颜色')} ${c}`}
                title={c}
                style={{ width: 22, height: 22, background: c, border: '1px solid #d9d9d9', cursor: 'pointer', padding: 0 }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(c)}
              />
            ))}
          </div>
          <Space style={{ marginTop: 8 }}>
            <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => applyColor('inherit')}>
              {t('默认颜色')}
            </Button>
            <ColorPicker size="small" onChangeComplete={(color) => applyColor(color.toHexString())}>
              <Button size="small" onMouseDown={(e) => e.preventDefault()}>{t('自定义颜色')}</Button>
            </ColorPicker>
          </Space>
        </div>
      )}
    >
      <Tooltip title={t('字体颜色')}>
        <Button
          size="small"
          type="text"
          icon={<FontColorsOutlined />}
          disabled={disabledAll}
          aria-label={t('字体颜色')}
          onMouseDown={(e) => {
            saveSelection();
            e.preventDefault();
          }}
        />
      </Tooltip>
    </Dropdown>
  );

  const codeToggle = (
    <Tooltip title={codeMode ? t('返回可视化编辑') : t('编辑 HTML 源码')}>
      <Button
        size="small"
        type={codeMode ? 'primary' : 'text'}
        icon={<CodeOutlined />}
        disabled={disabledAll}
        aria-label={t('源码')}
        onClick={() => setCodeMode((m) => !m)}
      >
        {t('源码')}
      </Button>
    </Tooltip>
  );

  /**
   * 对象 / 表格叠加层（渲染在 contenteditable 之外，不污染内容）：
   * 选中框 + 四角缩放手柄（媒体等比缩放 / 表格整体宽度）；
   * 表格悬停时右下角亮出整体宽度手柄。几何随拖拽 / 滚动 / 窗口变化刷新。
   */
  const overlayNodes = (() => {
    const wrap = wrapRef.current;
    if (!wrap || disabledAll) return [] as React.ReactNode[];
    const wr = wrap.getBoundingClientRect();
    const rel = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - wr.left, top: r.top - wr.top, width: r.width, height: r.height };
    };
    const nodes: React.ReactNode[] = [];
    if (selectedEl && selectedEl.isConnected) {
      const r = rel(selectedEl);
      const isMedia = selectedEl.matches('img, video, iframe');
      nodes.push(
        <div
          key="obj-frame"
          className="rte-obj-frame"
          style={{ left: r.left - 2, top: r.top - 2, width: r.width + 4, height: r.height + 4 }}
        />,
      );
      (['nw', 'ne', 'sw', 'se'] as const).forEach((corner) => {
        nodes.push(
          <div
            key={`handle-${corner}`}
            className={`rte-handle rte-handle-${corner}`}
            aria-label={t('缩放手柄')}
            onMouseDown={(e) => {
              if (isMedia) startMediaResize(selectedEl, corner, e);
              else startTableResize(selectedEl as HTMLTableElement, e);
            }}
            style={{
              left: corner === 'nw' || corner === 'sw' ? r.left - 5 : r.left + r.width - 4,
              top: corner === 'nw' || corner === 'ne' ? r.top - 5 : r.top + r.height - 4,
            }}
          />,
        );
      });
    }
    if (hoverTable && hoverTable !== selectedEl && hoverTable.isConnected) {
      const r = rel(hoverTable);
      nodes.push(
        <div
          key="table-handle"
          className="rte-handle rte-table-handle"
          aria-label={t('表格缩放手柄')}
          onMouseDown={(e) => startTableResize(hoverTable, e)}
          style={{ left: r.left + r.width - 7, top: r.top + r.height - 7 }}
        />,
      );
    }
    return nodes;
  })();

  if (codeMode) {
    return (
      <div className={`rich-text-editor${disabledAll ? ' rich-text-disabled' : ''}`}>
        <Space size={2} wrap className="rich-text-toolbar">
          {codeToggle}
        </Space>
        <Input.TextArea
          className="rich-text-code"
          rows={Math.max(6, rows ?? 8)}
          disabled={disabledAll}
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className={`rich-text-editor${disabledAll ? ' rich-text-disabled' : ''}`}>
      <Space size={2} wrap className="rich-text-toolbar">
        {toolButton(<BoldOutlined />, t('加粗'), () => exec('bold'))}
        {toolButton(<ItalicOutlined />, t('斜体'), () => exec('italic'))}
        {toolButton(<UnderlineOutlined />, t('下划线'), () => exec('underline'))}
        {toolButton(<StrikethroughOutlined />, t('删除线'), () => exec('strikeThrough'))}
        {colorDropdown}
        {toolButton(<AlignLeftOutlined />, t('左对齐'), () => applyAlign('left'))}
        {toolButton(<AlignCenterOutlined />, t('居中对齐'), () => applyAlign('center'))}
        {toolButton(<AlignRightOutlined />, t('右对齐'), () => applyAlign('right'))}
        {toolButton(<CommentOutlined />, t('引用'), () => exec('formatBlock', '<blockquote>'))}
        {toolButton(<UnorderedListOutlined />, t('无序列表'), () => exec('insertUnorderedList'))}
        {toolButton(<OrderedListOutlined />, t('有序列表'), () => exec('insertOrderedList'))}
        {toolButton(<LinkOutlined />, t('插入链接'), insertLink)}
        {toolButton(<CodeOutlined />, t('插入代码示例'), insertCode)}
        {toolButton(<PictureOutlined />, t('插入图片'), () => setMediaModal('image'), undefined, !siteId)}
        {toolButton(<VideoCameraOutlined />, t('插入视频'), () => setMediaModal('video'), undefined, !siteId)}
        {toolButton(<TableOutlined />, t('插入表格'), () => setTableOpen(true))}
        {toolButton(<ClearOutlined />, t('清除格式'), () => exec('removeFormat'))}
        {toolButton(<UndoOutlined />, t('撤销'), () => exec('undo'))}
        {toolButton(<RedoOutlined />, t('重做'), () => exec('redo'))}
        {codeToggle}
      </Space>
      <div ref={wrapRef} className="rich-text-canvas-wrap">
        <div
          ref={boxRef}
          id={id}
          className="rich-text-canvas"
          style={{ minHeight }}
          contentEditable={!disabledAll}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-readonly={disabledAll || undefined}
          onInput={syncFromDom}
          onBlur={syncFromDom}
          onPaste={onPaste}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
        />
        {overlayNodes.length > 0 && <div className="rte-overlay">{overlayNodes}</div>}
      </div>
      <Modal
        open={tableOpen}
        title={t('插入表格')}
        okText={t('插入')}
        onCancel={() => setTableOpen(false)}
        onOk={() => {
          insertHtml(tableHtml(tableRows, tableCols, tableHeader), { caretToFirstCell: true });
          setTableOpen(false);
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={8}>
          <Space>
            <span>{t('行数')}</span>
            <InputNumber min={1} max={20} value={tableRows} onChange={(v) => setTableRows(v || 1)} aria-label={t('行数')} />
            <span>{t('列数')}</span>
            <InputNumber min={1} max={10} value={tableCols} onChange={(v) => setTableCols(v || 1)} aria-label={t('列数')} />
          </Space>
          <Checkbox checked={tableHeader} onChange={(e) => setTableHeader(e.target.checked)}>
            {t('首行为表头')}
          </Checkbox>
        </Space>
      </Modal>
      <RichTextMediaModal
        open={mediaModal !== null}
        kind={mediaModal ?? 'image'}
        siteId={siteId}
        onClose={() => setMediaModal(null)}
        onInsert={(html) => insertHtml(html)}
      />
    </div>
  );
}
