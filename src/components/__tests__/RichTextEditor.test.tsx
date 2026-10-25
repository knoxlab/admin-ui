// 富文本编辑器（RICH_TEXT 字段控件）回归护栏。
//
// 背景缺陷：RICH_TEXT 字段在内容编辑与模型预览中都被降级为普通 TextArea，
// 用户在「模型 → 内容类型」给模型添加富文本字段后，「添加内容 / 预览」看不到
// 富文本编辑组件（FT-003 / TC-M65-008）。
//
// 本用例锁定三件事：
//   1. RICH_TEXT 渲染为富文本编辑器（contentEditable 画布 + 工具栏），而非 TextArea；
//   2. 受控契约：编辑输入写回 Form.Item、外部初始值回显（AI/版本恢复回填路径）；
//   3. 源码模式可切换，且 HTML 直接写回表单值。
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import RichTextEditor, { padEmptyCells, sanitizePastedHtml, tableHtml } from '../RichTextEditor';
import FieldControl from '../ContentFieldControl';
import type { FieldDef } from '../../api/types';
import { mediaApi } from '../../api';

// 媒体库上传/列表走 mock（富媒体插入用例）；其余 API 保持真实实现。
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    mediaApi: {
      ...actual.mediaApi,
      list: vi.fn().mockResolvedValue([]),
      upload: vi.fn(),
    },
  };
});

// antd ColorPicker 面板需要 ResizeObserver（jsdom 不提供）。
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// vitest 配了 globals:false，必须显式清理（同 ContentFieldControl.test.tsx 约定）。
afterEach(() => cleanup());

function makeField(overrides: Partial<FieldDef> = {}): FieldDef {
  return {
    id: 'field-1',
    code: 'body_html',
    name: '正文',
    fieldType: 'RICH_TEXT',
    required: false,
    sortOrder: 0,
    readOnly: false,
    i18n: false,
    adminIndex: false,
    publicIndex: false,
    sortable: false,
    filterable: false,
    highlight: false,
    fieldConfig: {},
    ...overrides,
  };
}

/** 走真实 Form.Item 注入路径渲染 FieldControl（与受控绑定契约测试同构）。 */
function renderFieldControl(field: FieldDef, options: { initialValue?: string } = {}) {
  const formRef: { current?: FormInstance } = {};
  const ui = render(
    <Form
      layout="vertical"
      onFinish={() => undefined}
      ref={(instance) => {
        formRef.current = (instance as unknown as FormInstance) ?? undefined;
      }}
    >
      <Form.Item name={field.code} label={field.name} initialValue={options.initialValue}>
        <FieldControl field={field} siteId="site-1" contentTypeId="type-1" />
      </Form.Item>
    </Form>,
  );
  return { ...ui, form: () => formRef.current! };
}

describe('RichTextEditor（RICH_TEXT 字段编辑组件）', () => {
  it('FieldControl 对 RICH_TEXT 渲染富文本画布与工具栏（缺陷回归：不再降级为 TextArea）', () => {
    const { container, getByRole } = renderFieldControl(makeField());
    const canvas = getByRole('textbox');
    expect(canvas.getAttribute('contenteditable')).toBe('true');
    expect(container.querySelector('.rich-text-toolbar')).toBeTruthy();
    // 画布不是 textarea
    expect(canvas.tagName).not.toBe('TEXTAREA');
  });

  it('编辑输入写回表单值（受控契约）', async () => {
    const { getByRole, form } = renderFieldControl(makeField());
    const canvas = getByRole('textbox') as HTMLDivElement;
    canvas.innerHTML = '<p>段落内容</p>';
    fireEvent.input(canvas);
    await waitFor(() => expect(form().getFieldValue('body_html')).toBe('<p>段落内容</p>'));
  });

  it('外部初始值回显到编辑区（编辑态回填路径）', async () => {
    const { getByRole } = renderFieldControl(makeField(), { initialValue: '<p>既有正文</p>' });
    await waitFor(() =>
      expect((getByRole('textbox') as HTMLDivElement).innerHTML).toBe('<p>既有正文</p>'),
    );
  });

  it('外部值变化（AI 回填）同步到编辑区，且本地输入不被重置', async () => {
    const formRef: { current?: FormInstance } = {};
    const ui = render(
      <Form
        layout="vertical"
        onFinish={() => undefined}
        ref={(instance) => {
          formRef.current = (instance as unknown as FormInstance) ?? undefined;
        }}
      >
        <Form.Item name="body_html" label="正文">
          <FieldControl field={makeField()} siteId="site-1" contentTypeId="type-1" />
        </Form.Item>
      </Form>,
    );
    const canvas = ui.getByRole('textbox') as HTMLDivElement;
    canvas.innerHTML = '<p>第一稿</p>';
    fireEvent.input(canvas);
    // 模拟 AI 建议回填（Content.tsx onApply → editorForm.setFieldValue）
    formRef.current!.setFieldValue('body_html', '<p>AI 生成</p>');
    ui.rerender(
      <Form
        layout="vertical"
        onFinish={() => undefined}
        ref={(instance) => {
          formRef.current = (instance as unknown as FormInstance) ?? undefined;
        }}
      >
        <Form.Item name="body_html" label="正文">
          <FieldControl field={makeField()} siteId="site-1" contentTypeId="type-1" />
        </Form.Item>
      </Form>,
    );
    await waitFor(() => expect(canvas.innerHTML).toBe('<p>AI 生成</p>'));
  });

  it('源码模式：切换后出现 textarea，编辑 HTML 直接写回表单值', async () => {
    const { getByRole, container, form } = renderFieldControl(makeField());
    // 工具栏末尾的「源码」按钮（aria-label）
    const toggle = container.querySelector('button[aria-label="源码"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    const codeArea = (await waitFor(() => getByRole('textbox'))) as unknown as HTMLTextAreaElement;
    expect(codeArea.tagName).toBe('TEXTAREA');
    fireEvent.change(codeArea, { target: { value: '<pre><code>const x = 1;</code></pre>' } });
    await waitFor(() =>
      expect(form().getFieldValue('body_html')).toBe('<pre><code>const x = 1;</code></pre>'),
    );
  });

  it('readOnly 字段：编辑区不可写', () => {
    const { getByRole } = renderFieldControl(makeField({ readOnly: true }));
    const canvas = getByRole('textbox');
    expect(canvas.getAttribute('contenteditable')).toBe('false');
  });

  it('空态归一：空白编辑区失焦后表单值为空串（而非 <p><br></p>）', async () => {
    const { getByRole, form } = renderFieldControl(makeField());
    const canvas = getByRole('textbox') as HTMLDivElement;
    canvas.innerHTML = '<p><br></p>';
    fireEvent.blur(canvas);
    await waitFor(() => expect(form().getFieldValue('body_html')).toBe(''));
  });
});

describe('RichTextEditor 独立渲染（模型预览 / 资料表单路径）', () => {
  it('受控 value/onChange 原样承接（PreviewControl 直连用法）', async () => {
    let latest = '';
    const { getByRole } = render(
      <RichTextEditor value="<p>预览</p>" onChange={(v) => { latest = v; }} />,
    );
    const canvas = getByRole('textbox') as HTMLDivElement;
    await waitFor(() => expect(canvas.innerHTML).toBe('<p>预览</p>'));
    canvas.innerHTML = '<p>预览改</p>';
    fireEvent.input(canvas);
    expect(latest).toBe('<p>预览改</p>');
  });
});

describe('sanitizePastedHtml（粘贴清洗，回归缺陷 ③）', () => {
  it('Word 粘贴：去 mso- 样式/条件注释/<o:p>，保留段落与标题结构', () => {
    const wordHtml = [
      '<!--[if gte mso 9]><xml><w:WordDocument></w:WordDocument></xml><![endif]-->',
      '<div>',
      '<h1 class="MsoTitle" style="mso-outline-level:1; margin-top:12pt">PowerLink 发布</h1>',
      '<p class="MsoNormal" style="mso-pagination:widow-orphan; line-height:150%">正文第一段<o:p></o:p></p>',
      '<ul><li style="mso-list:l0 level1 lfo1">要点一</li></ul>',
      '</div>',
    ].join('');
    const cleaned = sanitizePastedHtml(wordHtml);
    expect(cleaned).toContain('<h1');
    expect(cleaned).toContain('PowerLink 发布');
    expect(cleaned).toContain('正文第一段');
    expect(cleaned).toContain('要点一');
    expect(cleaned).not.toContain('mso-');
    expect(cleaned).not.toContain('MsoTitle');
    expect(cleaned).not.toContain('<o:p>');
    expect(cleaned).not.toContain('WordDocument');
  });

  it('危险内容整段丢弃：script/style/iframe 与 on* 事件属性、javascript: 链接', () => {
    const dirty =
      '<p onclick="alert(1)">文字</p><script>alert(2)</script><style>body{color:red}</style>' +
      '<iframe src="https://evil.example"></iframe>' +
      '<a href="javascript:alert(3)">链接</a><a href="https://ok.example/x">安全链接</a>' +
      '<img src="x" onerror="alert(4)"><img src="data:image/png;base64,AAAA">';
    const cleaned = sanitizePastedHtml(dirty);
    expect(cleaned).toContain('文字');
    expect(cleaned).toContain('安全链接');
    expect(cleaned).not.toContain('script');
    expect(cleaned).not.toContain('iframe');
    expect(cleaned).not.toContain('onclick');
    expect(cleaned).not.toContain('onerror');
    expect(cleaned).not.toContain('javascript:');
    expect(cleaned).toContain('https://ok.example/x');
  });

  it('全文档粘贴（含<html><body>）取 body，白名单外标签解包保留文字', () => {
    const doc =
      '<html><head><title>t</title></head><body><font color="red">红色文字</font>' +
      '<w:pict>图形文字</w:pict><table><tr><td>单元格</td></tr></table></body></html>';
    const cleaned = sanitizePastedHtml(doc);
    expect(cleaned).toContain('红色文字');
    expect(cleaned).toContain('图形文字');
    expect(cleaned).toContain('<td>单元格</td>');
    expect(cleaned).not.toContain('<font');
    expect(cleaned).not.toContain('w:pict');
    expect(cleaned).not.toContain('<title>');
  });

  it('粘贴事件走清洗后原样插入（缺陷③主链路：内容不再被丢弃）', async () => {
    const { getByRole } = render(
      <RichTextEditor value="" onChange={() => undefined} />,
    );
    const canvas = getByRole('textbox') as HTMLDivElement;
    fireEvent.paste(canvas, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/html' ? '<p class="MsoNormal" style="mso-line-height-rule:exactly">粘贴正文</p>' : '',
      },
    } as unknown as React.ClipboardEvent);
    expect(canvas.innerHTML).toContain('粘贴正文');
    expect(canvas.innerHTML).not.toContain('mso-');
    expect(canvas.innerHTML).not.toContain('MsoNormal');
  });

  // ---------- 富媒体（图片 / 视频 / 表格 / 字体颜色） ----------

  it('插入图片（媒体库）：选择资产生成 /media-file 插入片段', async () => {
    (mediaApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a1', siteId: 'site1', title: '', filename: 'pic.png', mimeType: 'image/png', fileSize: 1, contentHash: '', currentVersion: 2, kind: 'image', status: 'ACTIVE' },
    ]);
    const { getByRole, findByRole, findByTestId } = render(
      <RichTextEditor value="" onChange={() => undefined} siteId="site1" />,
    );
    fireEvent.click(getByRole('button', { name: '插入图片' }));
    fireEvent.click(await findByRole('tab', { name: '媒体库' }));
    fireEvent.click(await findByTestId('rich-media-asset-a1'));
    fireEvent.click(getByRole('button', { name: /^插\s*入$/ }));
    await waitFor(() => {
      const img = document.querySelector('[contenteditable="true"] img');
      expect(img?.getAttribute('src')).toBe('/media-file/site1/a1?v=2');
    });
  });

  it('插入图片（本地上传）：上传入库后插入', async () => {
    (mediaApi.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      assetId: 'a9', knoxMediaId: null, reusedBinary: false, status: 'ACTIVE',
    });
    const { getByRole, getByTestId } = render(
      <RichTextEditor value="" onChange={() => undefined} siteId="site1" />,
    );
    fireEvent.click(getByRole('button', { name: '插入图片' }));
    const file = new File(['x'], 'up.png', { type: 'image/png' });
    fireEvent.change(getByTestId('rich-media-file'), { target: { files: [file] } });
    fireEvent.click(getByRole('button', { name: /^插\s*入$/ }));
    await waitFor(() => expect(mediaApi.upload).toHaveBeenCalled());
    await waitFor(() => {
      const img = document.querySelector('[contenteditable="true"] img');
      expect(img?.getAttribute('src')).toContain('/media-file/site1/a9');
    });
  });

  it('插入视频（链接地址）：直链 mp4 用 <video>，其余地址用 iframe', async () => {
    const { getByRole, findByRole, findByPlaceholderText } = render(
      <RichTextEditor value="" onChange={() => undefined} siteId="site1" />,
    );
    fireEvent.click(getByRole('button', { name: '插入视频' }));
    fireEvent.click(await findByRole('tab', { name: '链接地址' }));
    fireEvent.change(await findByPlaceholderText('输入视频链接（http/https）'), {
      target: { value: 'https://cdn.example.com/v.mp4' },
    });
    fireEvent.click(getByRole('button', { name: /^插\s*入$/ }));
    await waitFor(() => {
      const video = document.querySelector('[contenteditable="true"] video');
      expect(video?.getAttribute('src')).toBe('https://cdn.example.com/v.mp4');
      expect(video?.hasAttribute('controls')).toBe(true);
    });
  });

  it('插入视频（链接地址）：非直链地址以 iframe 嵌入', async () => {
    const { getByRole, findByRole, findByPlaceholderText } = render(
      <RichTextEditor value="" onChange={() => undefined} siteId="site1" />,
    );
    fireEvent.click(getByRole('button', { name: '插入视频' }));
    fireEvent.click(await findByRole('tab', { name: '链接地址' }));
    fireEvent.change(await findByPlaceholderText('输入视频链接（http/https）'), {
      target: { value: 'https://v.example.com/embed/1' },
    });
    fireEvent.click(getByRole('button', { name: /^插\s*入$/ }));
    await waitFor(() => {
      const frame = document.querySelector('[contenteditable="true"] iframe');
      expect(frame?.getAttribute('src')).toBe('https://v.example.com/embed/1');
    });
  });

  it('插入表格：默认 3×3 首行表头，内联框线原样落 DOM（不被 insertHTML 净化腰斩）', async () => {
    const { getByRole } = render(<RichTextEditor value="" onChange={() => undefined} />);
    fireEvent.click(getByRole('button', { name: '插入表格' }));
    fireEvent.click(getByRole('button', { name: /^插\s*入$/ }));
    // 关键回归：表格/单元格内联样式必须原样存活（execCommand 会剥掉 style，
    // 故插入走 Range API）——无内联框线即视为失败。
    await waitFor(() => {
      const canvas = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
      const table = canvas.querySelector('table');
      expect(table?.getAttribute('style')).toContain('border-collapse: collapse');
      expect(table?.querySelectorAll('th')).toHaveLength(3);
      expect(table?.querySelectorAll('td')).toHaveLength(6);
      const th = table?.querySelector('th');
      const td = table?.querySelector('td');
      expect(th?.getAttribute('style')).toContain('border: 1px solid #d9d9d9');
      expect(th?.getAttribute('style')).toContain('background-color: #fafafa');
      expect(td?.getAttribute('style')).toContain('border: 1px solid #d9d9d9');
      expect(td?.getAttribute('style')).toContain('padding: 4px 8px');
    });
    // tableHtml 纯函数结构稳定（空单元格带 <br> 占位——padding-br 约定）
    const html = tableHtml(3, 3, true);
    expect(html).toContain('<table style="border-collapse: collapse; width: 100%;">');
    expect(html).toContain('<th style="border: 1px solid #d9d9d9; padding: 4px 8px; background-color: #fafafa;"><br></th>');
    expect(html.match(/<th /g)).toHaveLength(3);
    expect(html.match(/<td style="border: 1px solid #d9d9d9; padding: 4px 8px;"><br><\/td>/g)).toHaveLength(6);
    expect(html).toContain('<thead>');
    expect(html).toContain('</tbody></table><p><br></p>');
    const bare = tableHtml(2, 2, false);
    expect(bare).not.toContain('<thead>');
    expect(bare.match(/<td /g)).toHaveLength(4);
    expect(bare).toContain('border-collapse: collapse');
  });

  it('表格插入后光标落进首格（可直接输字/插图），空单元格带 <br> 占位', async () => {
    const { getByRole } = render(<RichTextEditor value="" onChange={() => undefined} />);
    fireEvent.click(getByRole('button', { name: '插入表格' }));
    fireEvent.click(getByRole('button', { name: /^插\s*入$/ }));
    await waitFor(() => {
      const canvas = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
      const table = canvas.querySelector('table');
      const firstCell = table?.querySelector('th');
      // 关键回归：空单元格无行盒 → 点击光标落到表格外（无法选中/输入）。
      // 插入后必须：① 首格带 <br> 占位；② 光标已落进首格。
      expect(firstCell?.querySelector('br')).toBeTruthy();
      expect(table?.querySelectorAll('td br')).toHaveLength(6);
      const sel = document.getSelection();
      const anchor = sel?.anchorNode ?? null;
      expect(firstCell === anchor || Boolean(anchor && firstCell?.contains(anchor))).toBe(true);
    });
  });

  it('受控回填补空单元格 <br> 占位（存量/粘贴表可点选），有内容单元格不动', () => {
    const { getByRole } = render(
      <RichTextEditor value="<table><tr><td></td><td>x</td></tr></table>" onChange={() => undefined} />,
    );
    const canvas = getByRole('textbox') as HTMLDivElement;
    expect(canvas.innerHTML).toContain('<td><br></td>');
    expect(canvas.innerHTML).toContain('<td>x</td>');
    // padEmptyCells 纯函数：幂等、不覆盖已有内容
    padEmptyCells(canvas);
    padEmptyCells(canvas);
    expect(canvas.querySelectorAll('td br')).toHaveLength(1);
    expect(canvas.innerHTML).toContain('<td>x</td>');
  });

  it('字体颜色：预设色触发 styleWithCSS + foreColor，默认颜色用 inherit', async () => {
    const execCommand = vi.fn((..._args: string[]) => true);
    (document as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;
    const { getByRole, findByRole } = render(<RichTextEditor value="" onChange={() => undefined} />);
    fireEvent.click(getByRole('button', { name: '字体颜色' }));
    fireEvent.click(await findByRole('button', { name: '字体颜色 #ff0000' }));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('styleWithCSS', false, 'true'));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('foreColor', false, '#ff0000'));

    fireEvent.click(getByRole('button', { name: '字体颜色' }));
    fireEvent.click(await findByRole('button', { name: '默认颜色' }));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('foreColor', false, 'inherit'));
  });
});

describe('RichTextEditor 对象选中 / 拖拽缩放 / 表格框线 / 水平对齐', () => {
  const IMG_VALUE = '<p><img src="/media-file/s1/a1" alt="a.png"></p>';

  /** jsdom 无布局引擎：按需灌入几何（拖拽数学依赖 rect）。 */
  function mockRect(el: Element, rect: Partial<DOMRect>) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect);
  }

  it('水平对齐：无选中对象时对段落走 justifyCenter', () => {
    const execCommand = vi.fn(() => true);
    (document as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;
    const { getByRole } = render(<RichTextEditor value="" onChange={() => undefined} />);
    fireEvent.click(getByRole('button', { name: '居中对齐' }));
    expect(execCommand).toHaveBeenCalledWith('justifyCenter', false, undefined);
  });

  it('水平对齐：选中图片后居中写入 display/margin 并回写受控值', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(<RichTextEditor value={IMG_VALUE} onChange={onChange} />);
    const canvas = getByRole('textbox') as HTMLDivElement;
    await waitFor(() => expect(canvas.querySelector('img')).toBeTruthy());
    const img = canvas.querySelector('img') as HTMLImageElement;
    fireEvent.mouseDown(img);
    fireEvent.click(getByRole('button', { name: '居中对齐' }));
    expect(img.style.display).toBe('block');
    expect(img.style.marginLeft).toBe('auto');
    expect(img.style.marginRight).toBe('auto');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('选中对象 Backspace 删除并回写受控值', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(<RichTextEditor value={IMG_VALUE} onChange={onChange} />);
    const canvas = getByRole('textbox') as HTMLDivElement;
    await waitFor(() => expect(canvas.querySelector('img')).toBeTruthy());
    fireEvent.mouseDown(canvas.querySelector('img') as HTMLImageElement);
    fireEvent.keyDown(canvas, { key: 'Backspace' });
    expect(canvas.querySelector('img')).toBeFalsy();
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('媒体角点手柄拖拽等比缩放（宽高联动）', async () => {
    const { getByRole } = render(<RichTextEditor value={IMG_VALUE} onChange={() => undefined} />);
    const canvas = getByRole('textbox') as HTMLDivElement;
    await waitFor(() => expect(canvas.querySelector('img')).toBeTruthy());
    const img = canvas.querySelector('img') as HTMLImageElement;
    mockRect(img, { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 });
    Object.defineProperty(img, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 100, configurable: true });
    fireEvent.mouseDown(img);
    await waitFor(() => expect(document.querySelector('.rte-handle-se')).toBeTruthy());
    const handle = document.querySelector('.rte-handle-se') as HTMLDivElement;
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 50 });
    fireEvent.mouseMove(document, { clientX: 140, clientY: 70 });
    fireEvent.mouseUp(document);
    expect(img.style.width).toBe('140px');
    expect(img.style.height).toBe('70px');
  });

  it('表格框线拖拽：右缘拖列宽（整列同调、锁定 fixed 布局）', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <RichTextEditor
        value="<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>"
        onChange={onChange}
      />,
    );
    const canvas = getByRole('textbox') as HTMLDivElement;
    await waitFor(() => expect(canvas.querySelector('table')).toBeTruthy());
    const table = canvas.querySelector('table') as HTMLTableElement;
    Array.from(canvas.querySelectorAll('th, td')).forEach((c) =>
      mockRect(c, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }),
    );
    const firstCell = canvas.querySelector('th') as HTMLTableCellElement;
    // 右缘 -5px 内按下 → 列宽拖拽；+30 → 该列 100 变 130
    fireEvent.mouseDown(firstCell, { clientX: 98, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 128, clientY: 10 });
    fireEvent.mouseUp(document);
    expect(table.style.tableLayout).toBe('fixed');
    expect((canvas.querySelectorAll('th')[0] as HTMLElement).style.width).toBe('130px');
    expect((canvas.querySelectorAll('td')[0] as HTMLElement).style.width).toBe('130px');
    expect((canvas.querySelectorAll('th')[1] as HTMLElement).style.width).toBe('');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('表格框线拖拽：下缘拖行高（整行同调）', async () => {
    const { getByRole } = render(
      <RichTextEditor
        value="<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>"
        onChange={() => undefined}
      />,
    );
    const canvas = getByRole('textbox') as HTMLDivElement;
    await waitFor(() => expect(canvas.querySelector('table')).toBeTruthy());
    Array.from(canvas.querySelectorAll('th, td')).forEach((c) =>
      mockRect(c, { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }),
    );
    const firstCell = canvas.querySelector('th') as HTMLTableCellElement;
    // 下缘 -5px 内按下 → 行高拖拽；+30 → 该行 20 变 50
    fireEvent.mouseDown(firstCell, { clientX: 10, clientY: 18 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 48 });
    fireEvent.mouseUp(document);
    expect((canvas.querySelectorAll('th')[0] as HTMLElement).style.height).toBe('50px');
    expect((canvas.querySelectorAll('th')[1] as HTMLElement).style.height).toBe('50px');
    expect((canvas.querySelectorAll('td')[0] as HTMLElement).style.height).toBe('');
  });
});
