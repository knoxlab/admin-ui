import { describe, expect, it } from 'vitest';
import { contentPreviewSrc, defaultPreviewImage } from '../contentPreview';

const ASSET_ID = '7f0f0b9e-53c1-4a6e-9a0b-2f8c1d7e4a11';

describe('contentPreviewSrc：内容列表预览图地址', () => {
  it('没有预览图时使用默认图片', () => {
    expect(contentPreviewSrc('site-1', undefined)).toBe(defaultPreviewImage);
    expect(contentPreviewSrc('site-1', '')).toBe(defaultPreviewImage);
    expect(contentPreviewSrc('site-1', '   ')).toBe(defaultPreviewImage);
  });

  it('站内路径与外部地址原样使用', () => {
    expect(contentPreviewSrc('site-1', '/posters/42.jpg')).toBe('/posters/42.jpg');
    expect(contentPreviewSrc('site-1', 'https://cdn.example.com/cover.jpg')).toBe(
      'https://cdn.example.com/cover.jpg',
    );
  });

  it('媒体资产编号转换为免鉴权缩略图代理', () => {
    expect(contentPreviewSrc('site-1', ASSET_ID)).toBe(`/media-thumb/site-1/${ASSET_ID}`);
  });

  it('带 assetId 的 mediaRef JSON 同样走缩略图代理', () => {
    expect(contentPreviewSrc('site-1', JSON.stringify({ assetId: ASSET_ID }))).toBe(
      `/media-thumb/site-1/${ASSET_ID}`,
    );
  });

  it('无法识别的值或缺少站点时回退默认图片', () => {
    expect(contentPreviewSrc('site-1', 'storage/key/without/extension')).toBe(defaultPreviewImage);
    expect(contentPreviewSrc(undefined, ASSET_ID)).toBe(defaultPreviewImage);
  });
});
