import { useMemo } from 'react';
import { Button, Input, Space, Tag, Typography } from 'antd';
import {
  DeleteOutlined,
  HolderOutlined,
  PictureOutlined,
  PlusOutlined,
  LinkOutlined,
  FontSizeOutlined,
  AlignLeftOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './BlockEditor.css';
import { t } from '../i18n/locale';

export type BlockType = 'paragraph' | 'heading' | 'quote' | 'image' | 'embed';

export interface Block {
  id: string;
  type: BlockType;
  content: string;
}

const BLOCK_META: Record<BlockType, { name: string; icon: React.ReactNode }> = {
  paragraph: { name: '段落', icon: <AlignLeftOutlined /> },
  heading: { name: '标题', icon: <FontSizeOutlined /> },
  quote: { name: '引用', icon: <MenuOutlined /> },
  image: { name: '图片', icon: <PictureOutlined /> },
  embed: { name: '嵌入', icon: <LinkOutlined /> },
};

function uid() {
  return `blk_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultBlocks(): Block[] {
  return [{ id: uid(), type: 'paragraph', content: '' }];
}

export function blockCharCount(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + (b.content?.length || 0), 0);
}

function SortableBlockItem({
  block,
  onDelete,
  onEdit,
}: {
  block: Block;
  onDelete: () => void;
  onEdit: (content: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const meta = BLOCK_META[block.type];
  return (
    <div
      ref={setNodeRef}
      className={`block-editor-item${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span className="block-editor-drag" ref={setActivatorNodeRef} {...listeners} {...attributes}>
        <HolderOutlined />
      </span>
      <Tag color="blue" style={{ marginInlineEnd: 8 }}>
        {meta.icon} {meta.name}
      </Tag>
      {block.type === 'image' || block.type === 'embed' ? (
        <Input
          value={block.content}
          onChange={(e) => onEdit(e.target.value)}
          placeholder={block.type === 'image' ? t('图片 URL 或媒体引用') : t('嵌入 URL')}
          variant="borderless"
        />
      ) : (
        <Input.TextArea
          value={block.content}
          onChange={(e) => onEdit(e.target.value)}
          placeholder={meta.name + t('内容')}
          autoSize={{ minRows: block.type === 'quote' ? 2 : 1, maxRows: 10 }}
          variant="borderless"
          style={{ fontWeight: block.type === 'heading' ? 600 : 'normal', fontSize: block.type === 'heading' ? 18 : 14 }}
        />
      )}
      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} />
    </div>
  );
}

export default function BlockEditor({
  value,
  onChange,
  allowedBlocks,
  charLimit,
}: {
  value?: string;
  onChange?: (v: string) => void;
  allowedBlocks?: string[];
  charLimit?: number;
}) {
  const blocks = useMemo<Block[]>(() => {
    if (!value) return defaultBlocks();
    try {
      const parsed = JSON.parse(value) as Block[];
      if (Array.isArray(parsed) && parsed.every((b) => b && b.type && b.content !== undefined)) return parsed;
      return defaultBlocks();
    } catch {
      return defaultBlocks();
    }
  }, [value]);

  const availableTypes = useMemo<BlockType[]>(() => {
    const all: BlockType[] = ['paragraph', 'heading', 'quote', 'image', 'embed'];
    if (!allowedBlocks || !allowedBlocks.length) return all;
    return all.filter((t) => allowedBlocks.includes(t));
  }, [allowedBlocks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const emit = (next: Block[]) => onChange?.(JSON.stringify(next));

  const patch = (id: string, content: string) =>
    emit(blocks.map((b) => (b.id === id ? { ...b, content } : b)));

  const remove = (id: string) => emit(blocks.filter((b) => b.id !== id));

  const add = (type: BlockType) => emit([...blocks, { id: uid(), type, content: '' }]);

  const dragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    emit(arrayMove(blocks, from, to));
  };

  const count = blockCharCount(blocks);
  const overLimit = charLimit != null && count > charLimit;

  return (
    <div className="block-editor">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {blocks.map((b) => (
              <SortableBlockItem
                key={b.id}
                block={b}
                onDelete={() => remove(b.id)}
                onEdit={(c) => patch(b.id, c)}
              />
            ))}
          </Space>
        </SortableContext>
      </DndContext>
      <Space style={{ marginTop: 8, justifyContent: 'space-between', width: '100%' }}>
        <Space wrap>
          {availableTypes.map((t) => (
            <Button key={t} size="small" icon={<PlusOutlined />} onClick={() => add(t)}>
              {BLOCK_META[t].name}
            </Button>
          ))}
        </Space>
        <Typography.Text type={overLimit ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
          
          {t('字数')} {count}{charLimit != null ? ` / ${charLimit}` : ''}
        </Typography.Text>
      </Space>
      {overLimit && (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          
          {t('已超过字符上限')} {charLimit}
        </Typography.Text>
      )}
    </div>
  );
}
