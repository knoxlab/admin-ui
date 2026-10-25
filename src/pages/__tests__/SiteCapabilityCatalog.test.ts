import { describe, expect, it } from 'vitest';
import { SITE_CAPABILITIES } from '../Identity';

/**
 * 站点能力键目录对齐守护（与后端 SiteCapabilityCatalogTest 成对）：
 * Identity.tsx 的兜底清单与后端 SiteCapabilities.ALL 必须一致。本测试锁定清单完整性；
 * 后端测试镜像同一清单，两侧任一漂移都会在 CI 失败。
 */
describe('站点能力目录 · 前端兜底清单对齐（capability catalog）', () => {
  const EXPECTED_CAPABILITIES = [
    'read', 'write', 'review', 'deploy', 'model', 'template', 'migrate', 'admin',
    'stats', 'stats-admin', 'logs', 'logs-admin',
  ];

  it('兜底清单包含全部 12 个能力键且无多余项', () => {
    expect([...SITE_CAPABILITIES]).toEqual(EXPECTED_CAPABILITIES);
  });

  it('不含空白/大小写异常条目（后端 parse 会静默丢弃）', () => {
    for (const key of SITE_CAPABILITIES) {
      expect(key).toBe(key.trim().toLowerCase());
    }
  });
});
