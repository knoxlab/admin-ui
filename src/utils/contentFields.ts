import type { ContentType, FieldDef, LayoutElement } from '../api/types';

/**
 * 结构型元素（不是可填值字段）：分区 / 重复组 / 标签页只负责排版，
 * 其子字段才承载值，故收集字段时跳过它们本身。
 */
export const STRUCTURAL = new Set(['FORM_SECTION', 'REPEAT_GROUP', 'TAB']);

/**
 * 内容模型的**可填值字段**扁平列表，用于表单校验、保存与只读展示（版本快照 / 时间机器）。
 *
 * <p>布局驱动（`type.layout` 非空）时按布局树展开，`REPEAT_GROUP` 以其 `variableName` 合成一个
 * 「重复组字段」——重复组的子字段以数组形式嵌在该键下，不再单独平铺；否则退回 `type.fields`
 * 并按 `sortOrder` 排序。</p>
 *
 * <p>从 `pages/Content.tsx` 提取为共享工具：时间机器（FR-CV-VER-009）与版本快照（FR-CV-VER-001/003）
 * 需要与编辑器**完全一致**的字段口径，否则同一份快照在两处会显示出不同的字段集合。</p>
 */
export function collectFields(type?: ContentType): FieldDef[] {
  if (!type) return [];
  if (type.layout?.length) {
    const out: FieldDef[] = [];
    const walk = (els?: LayoutElement[]) => {
      for (const el of els || []) {
        if (el.elementType === 'FIELD' && el.field && !STRUCTURAL.has(el.field.fieldType)) {
          out.push(el.field);
        } else if (el.elementType === 'REPEAT_GROUP') {
          const code = String(el.config?.variableName || el.field?.code || '');
          if (code) {
            out.push({
              ...(el.field || {
                code,
                name: String(el.config?.title || code),
                fieldType: 'REPEAT_GROUP',
                required: false,
                sortOrder: el.sortOrder,
                readOnly: false,
                i18n: false,
                adminIndex: false,
                publicIndex: false,
                sortable: false,
                filterable: false,
                highlight: false,
              }),
              code,
              fieldType: 'REPEAT_GROUP',
              fieldConfig: { ...(el.field?.fieldConfig || {}), ...(el.config || {}) },
            });
          }
          // children stay nested under the repeat value; do not flatten for top-level save
        } else if (el.children?.length) {
          walk(el.children);
        }
      }
    };
    walk(type.layout);
    return out;
  }
  if (type.fields?.length) {
    return type.fields
      .filter((f) => !STRUCTURAL.has(f.fieldType))
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return [];
}
