// 回归护栏：内容字段控件必须原样承接 Form.Item 注入的受控 props。
//
// 背景缺陷（/pages「添加页面」被永久拦截）：
//   Pages.tsx / PageDesigner.tsx / SiteBrowser.tsx 曾各自实现一个 `FieldInput`，
//   签名只有 `{ field }`，内部 `const props = { disabled: field.readOnly }`，
//   即把 Form.Item 注入的 `value` / `onChange` / `checked` / `id` 全部丢弃。
//   后果：自定义字段输入不进表单 → 必填校验永远不通过 → 创建/保存被永久拦截；
//   BOOLEAN 字段因 `checked` 被丢弃而永远显示未开启。
//
// 本用例直接对着「受控绑定」这一契约断言，任何一处再退化成只透传 `disabled`，
// 都会在这里立刻失败。
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import FieldControl from '../ContentFieldControl';
import type { FieldDef } from '../../api/types';

// vitest 配了 globals:false，Testing Library 的自动 cleanup 不会注册；
// 本文件多次渲染同名字段，必须显式清理，否则会命中上一用例残留的 DOM。
afterEach(() => cleanup());

function makeField(overrides: Partial<FieldDef> = {}): FieldDef {
  return {
    id: 'field-1',
    code: 'summary',
    name: '摘要',
    fieldType: 'STRING',
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

/**
 * 渲染一个只含单个字段的受控表单，并把 form 实例暴露给用例断言。
 * 这里刻意走真实的 `Form.Item` 注入路径（而不是手工传 value/onChange），
 * 因为缺陷恰恰发生在「注入的 props 没有被接住」这一步。
 */
function renderField(field: FieldDef, options: { initialValue?: unknown; required?: boolean } = {}) {
  const formRef: { current?: FormInstance } = {};
  const ui = render(
    <Form
      layout="vertical"
      onFinish={() => undefined}
      ref={(instance) => {
        // antd 的 Form ref 实际是 FormInstance（附加了 nativeElement），此处按断言用途收窄。
        formRef.current = (instance as unknown as FormInstance) ?? undefined;
      }}
    >
      <Form.Item
        name={field.code}
        label={field.name}
        rules={[{ required: options.required ?? field.required, message: `请填写${field.name}` }]}
        initialValue={options.initialValue}
        valuePropName={field.fieldType === 'BOOLEAN' ? 'checked' : 'value'}
      >
        <FieldControl field={field} siteId="site-1" contentTypeId="type-1" />
      </Form.Item>
    </Form>,
  );
  return { ...ui, form: () => formRef.current! };
}

describe('ContentFieldControl 受控绑定（/pages 自定义字段缺陷回归）', () => {
  it('字符串字段的输入能写入表单值（原缺陷：onChange 被丢弃 → 值永远为空）', async () => {
    const { getByRole, form } = renderField(makeField());
    const input = getByRole('textbox') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '成本下降 37%' } });

    await waitFor(() =>
      expect(form().getFieldValue('summary')).toBe('成本下降 37%'),
    );
    expect(input.value).toBe('成本下降 37%');
  });

  it('必填字符串字段在填写后能通过校验（原缺陷：校验永远不通过 → 创建被永久拦截）', async () => {
    const { getByRole, form } = renderField(makeField({ required: true }), { required: true });

    await expect(form().validateFields()).rejects.toBeTruthy();

    fireEvent.change(getByRole('textbox'), { target: { value: '已填写' } });

    await expect(form().validateFields()).resolves.toMatchObject({ summary: '已填写' });
  });

  it('LONG_TEXT 渲染为多行输入（原缺陷：/pages 里落到单行 Input）', () => {
    const { getByRole } = renderField(makeField({ fieldType: 'LONG_TEXT', code: 'body', name: '正文' }));
    expect(getByRole('textbox').tagName).toBe('TEXTAREA');
  });

  it('初始值能回填到控件（原缺陷：value 被丢弃 → 编辑态空白）', async () => {
    const { getByRole } = renderField(
      makeField({ fieldType: 'LONG_TEXT', code: 'body', name: '正文' }),
      { initialValue: '既有正文' },
    );
    await waitFor(() => expect((getByRole('textbox') as HTMLTextAreaElement).value).toBe('既有正文'));
  });

  it('BOOLEAN 字段承接 checked 且切换后写回表单（原缺陷：checked 被丢弃 → 开关永远关着）', async () => {
    const { getByRole, form } = renderField(
      makeField({ fieldType: 'BOOLEAN', code: 'pinned', name: '置顶', required: false }),
      { initialValue: true },
    );

    const toggle = getByRole('switch');
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));

    fireEvent.click(toggle);

    await waitFor(() => expect(form().getFieldValue('pinned')).toBe(false));
  });

  it('字段级 readOnly 仍然禁用控件（既有语义不被受控改造破坏）', () => {
    const { getByRole } = renderField(makeField({ readOnly: true }));
    expect((getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('转发 Form.Item 注入的 id，使 label 指向真实控件（可点击聚焦）', async () => {
    const { getByRole, container } = renderField(makeField());
    const input = getByRole('textbox') as HTMLInputElement;
    const label = container.querySelector('label');

    expect(input.id).toBeTruthy();
    expect(label?.getAttribute('for')).toBe(input.id);
  });
});
