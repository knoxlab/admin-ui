// 只读媒体取值解析：审核弹窗里 IMAGE / MEDIA_REF 的取值形态很多
// （裸 UUID、{assetId,kind} JSON、JSON 数组、外部 URL、历史脏数据），
// 解析必须稳定——丢了条目审核人就会以为字段是空的。
import { describe, expect, it } from 'vitest';
import { mediaEntryKind, parseMediaEntries } from '../ContentMediaValue';

const IMAGE_ID = '11111111-2222-3333-4444-555555555555';
const VIDEO_ID = '66666666-7777-8888-9999-000000000000';

describe('parseMediaEntries', () => {
  it('裸资产编号 → assetId 条目', () => {
    expect(parseMediaEntries(IMAGE_ID)).toEqual([{ assetId: IMAGE_ID, url: undefined, kind: undefined, filename: undefined }]);
  });

  it('mediaRef JSON（字符串）→ assetId + kind + 文件名', () => {
    const entries = parseMediaEntries(JSON.stringify({ assetId: VIDEO_ID, kind: 'video', filename: 'demo.mp4' }));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ assetId: VIDEO_ID, kind: 'video', filename: 'demo.mp4' });
  });

  it('JSON 数组与真实数组都展开成多条', () => {
    const json = JSON.stringify([{ assetId: IMAGE_ID }, { assetId: VIDEO_ID, kind: 'video' }]);
    expect(parseMediaEntries(json).map((e) => e.assetId)).toEqual([IMAGE_ID, VIDEO_ID]);
    expect(parseMediaEntries([IMAGE_ID, { url: 'https://cdn.example.com/v.mp4' }]).map((e) => e.assetId ?? e.url))
      .toEqual([IMAGE_ID, 'https://cdn.example.com/v.mp4']);
  });

  it('外部/站内 URL 保留原地址', () => {
    expect(parseMediaEntries('https://cdn.example.com/a.png')[0].url).toBe('https://cdn.example.com/a.png');
    expect(parseMediaEntries('/uploads/a.png')[0].url).toBe('/uploads/a.png');
  });

  it('坏 JSON 不吞掉内容，按文本保留', () => {
    const entries = parseMediaEntries('{not json');
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('{not json');
  });

  it('空值与空数组 → 无条目', () => {
    expect(parseMediaEntries(null)).toEqual([]);
    expect(parseMediaEntries('')).toEqual([]);
    expect(parseMediaEntries([])).toEqual([]);
    expect(parseMediaEntries({ foo: 'bar' })).toEqual([]);
  });
});

describe('mediaEntryKind', () => {
  it('优先使用保存的 kind / mimeType', () => {
    expect(mediaEntryKind({ assetId: VIDEO_ID, kind: 'video' })).toBe('video');
    expect(mediaEntryKind({ assetId: IMAGE_ID, kind: 'image/png' })).toBe('image');
    expect(mediaEntryKind({ assetId: IMAGE_ID, kind: 'font' })).toBe('other');
  });

  it('没有 kind 时按文件名/URL 扩展名推断', () => {
    expect(mediaEntryKind({ assetId: IMAGE_ID, filename: 'cover.JPG' })).toBe('image');
    expect(mediaEntryKind({ assetId: VIDEO_ID, url: 'https://cdn.example.com/clip.mp4' })).toBe('video');
    expect(mediaEntryKind({ assetId: VIDEO_ID, filename: 'report.pdf' })).toBe('document');
  });

  it('IMAGE 字段即使没有元数据也按图片处理；其余未知种类保持 unknown', () => {
    expect(mediaEntryKind({ assetId: IMAGE_ID }, 'IMAGE')).toBe('image');
    expect(mediaEntryKind({ assetId: VIDEO_ID }, 'MEDIA_REF')).toBe('unknown');
  });
});
