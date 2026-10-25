import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Space, Spin, Typography } from 'antd';
import type * as PDFJS from 'pdfjs-dist/legacy/build/pdf.mjs';
import { t } from '../i18n/locale';
import {
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';

/**
 * PDF 客户端渲染器（媒体库预览 / 引用选择器共用）。
 *
 * <p><b>为什么不把 PDF 直接丢给浏览器原生阅读器</b>：`<iframe src="x.pdf">` 依赖
 * 浏览器内置 PDF 插件，Electron / 内嵌 WebView / 精简发行版里经常被禁用，
 * 表现就是「弹窗一片空白」——而这正是本次「文档无法正常预览」最容易被误判成后端问题的形态。
 *
 * <p><b>为什么不复用 `/media-preview` 的服务端页图</b>：那条链路要求 Knox 侧把每页栅格化成
 * JPEG（mutool / pdftoppm / Ghostscript 之一），缺失时 `pageImageUrl` 仍会返回地址但取图 404，
 * 只有第 1 页（LibreOffice 导出）能出图。pdf.js 直接吃整份原件字节，任意页都能画，
 * 总页数也来自 PDF 本身，不依赖任何服务端转换。
 *
 * <p><b>为什么用 legacy 构建</b>：modern 构建只调用而不 polyfill `Uint8Array.toHex` /
 * `Map.getOrInsertComputed`，在旧内核上是必现硬错误（打开即失败 / 页面画不出来）；
 * legacy 内嵌 core-js，两处都有兜底。主包与 worker 必须同为 legacy。
 *
 * <p>pdf.js 体积不小，这里用**动态 import**：只有真正预览 PDF 时才下载，
 * 也不让 jsdom 测试环境在主包加载阶段就去解析 canvas 相关代码。
 */
export function PdfPreview({ src, fallbackSrc, title, height = 560 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  // pdf.js 的代理对象类型随构建版本变化，这里只存"能 getPage/numPages/destroy"的最小契约
  const docRef = useRef<PDFJS.PDFDocumentProxy | null>(null);
  const pageRef = useRef(1);
  const zoomRef = useRef(1);
  const renderTokenRef = useRef(0);
  const renderChainRef = useRef<Promise<void>>(Promise.resolve());

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  /** 按显示区宽度铺满当前页；`zoom` 是用户额外的缩放倍率。 */
  const draw = useCallback(() => {
    const token = ++renderTokenRef.current;
    const run = async (): Promise<void> => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      const area = areaRef.current;
      if (!doc || !canvas || !area) return;
      // 已换文档 / 已有更晚的渲染排队：这次让位，避免画完立刻被覆盖
      if (token !== renderTokenRef.current) return;
      const pageNo = Math.min(Math.max(pageRef.current, 1), doc.numPages);
      try {
        const pdfPage = await doc.getPage(pageNo);
        if (docRef.current !== doc || token !== renderTokenRef.current) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const avail = area.clientWidth - 24;
        // 先按容器宽度"适配"，再乘用户缩放；放大时同步提高位图分辨率，否则字会发虚
        const fit = avail > 0 ? avail / natural.width : 1;
        const scale = Math.max(0.1, fit * zoomRef.current);
        const viewport = pdfPage.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        // 高度留空由 CSS 按画布固有比例反推，宽高比永远不会被压扁
        canvas.style.height = '';
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        }).promise;
      } catch (error) {
        // 不静默吞：首页半截/发白且控制台全静默时无从查起
        console.warn(`[PdfPreview] 渲染第 ${pageNo} 页失败`, error);
      }
    };
    // pdf.js 不允许同一画布并发渲染，串行排队
    renderChainRef.current = renderChainRef.current.then(run, run);
    return renderChainRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    docRef.current?.destroy().catch(() => undefined);
    docRef.current = null;
    pageRef.current = 1;
    zoomRef.current = 1;
    setPage(1);
    setPages(0);
    setZoom(1);
    setLoading(true);
    setFailed(false);

    const load = async (): Promise<void> => {
      try {
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
        ]);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const response = await fetch(src, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelled) {
          doc.destroy().catch(() => undefined);
          return;
        }
        docRef.current = doc;
        setPages(doc.numPages);
        setLoading(false);
        await draw();
      } catch (error) {
        if (cancelled) return;
        console.warn(`[PdfPreview] 加载失败 src=${src}`, error);
        setLoading(false);
        setFailed(true);
      }
    };
    void load();

    return () => {
      cancelled = true;
      docRef.current?.destroy().catch(() => undefined);
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // 容器尺寸变化（弹窗缩放 / 侧栏展开）重绘，否则页面会停在旧宽度
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(() => {
      if (docRef.current) void draw();
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [draw]);

  const go = useCallback((next: number) => {
    const doc = docRef.current;
    if (!doc) return;
    const pageNo = Math.min(Math.max(next, 1), doc.numPages);
    pageRef.current = pageNo;
    setPage(pageNo);
    void draw();
  }, [draw]);

  const changeZoom = useCallback((factor: number) => {
    const next = Math.min(Math.max(zoomRef.current * factor, 0.5), 3);
    zoomRef.current = next;
    setZoom(next);
    void draw();
  }, [draw]);

  if (failed) {
    // 取不到原件（未授权 / 不是 PDF / 后端 404）时退回服务端预览页
    return fallbackSrc ? (
      <iframe title={title ?? t('文档预览')} src={fallbackSrc} style={{ width: '100%', height, border: 0 }} />
    ) : (
      <div style={{ height, display: 'grid', placeItems: 'center', background: '#fafafa', color: '#888' }}>
        <Space direction="vertical" align="center">
          <Typography.Text strong>{title ?? t('文档预览不可用')}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('暂时无法在浏览器中渲染该文件')}</Typography.Text>
        </Space>
      </div>
    );
  }

  return (
    <div>
      <Space size={8} style={{ marginBottom: 8 }} wrap>
        <Button size="small" icon={<LeftOutlined />} disabled={page <= 1} onClick={() => go(page - 1)} title={t('上一页')} />
        <Typography.Text style={{ fontSize: 12 }}>{pages ? `${page} / ${pages}` : '—'}</Typography.Text>
        <Button size="small" icon={<RightOutlined />} disabled={pages === 0 || page >= pages} onClick={() => go(page + 1)} title={t('下一页')} />
        <Button size="small" icon={<ZoomOutOutlined />} disabled={zoom <= 0.5} onClick={() => changeZoom(1 / 1.25)} title={t('缩小')} />
        <Typography.Text style={{ fontSize: 12 }}>{Math.round(zoom * 100)}%</Typography.Text>
        <Button size="small" icon={<ZoomInOutlined />} disabled={zoom >= 3} onClick={() => changeZoom(1.25)} title={t('放大')} />
      </Space>
      <div
        ref={areaRef}
        style={{
          height,
          overflow: 'auto',
          background: '#f5f5f5',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 12,
        }}
      >
        {loading && <Spin style={{ marginTop: 40 }} />}
        <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', display: loading ? 'none' : 'block', background: '#fff' }} />
      </div>
    </div>
  );
}

export interface Props {
  /** `/media-pdf` 原件字节地址（本站代理，不含 Knox access_token）。 */
  src: string;
  /** 取不到原件时退回的服务端预览页（非 PDF 文档或上游异常）。 */
  fallbackSrc?: string;
  title?: string;
  /** 画布区域高度（px）。 */
  height?: number;
}
