import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { Category } from '../../api/types';

const { treeMock } = vi.hoisted(() => ({ treeMock: vi.fn() }));

vi.mock('../../api', () => ({
  categoriesApi: {
    tree: treeMock,
  },
}));

import CategorySelect from '../CategorySelect';

function makeCategory(overrides: Partial<Category> & { id: string; name: string }): Category {
  return {
    pathAlias: overrides.id,
    sortOrder: 0,
    depth: 0,
    children: [],
    ...overrides,
  };
}

const sampleTree: Category[] = [
  makeCategory({
    id: 'root-1',
    name: '一级分类',
    children: [
      makeCategory({ id: 'a', name: '音乐', pathAlias: 'A' }),
      makeCategory({ id: 'b', name: '文学', pathAlias: 'B' }),
    ],
  }),
];

describe('CategorySelect', () => {
  beforeEach(() => {
    treeMock.mockReset();
    treeMock.mockResolvedValue(sampleTree);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the api when siteId is empty', async () => {
    render(<CategorySelect siteId="" value="a" onChange={() => undefined} />);
    expect(treeMock).not.toHaveBeenCalled();
  });

  it('fetches the category tree on mount and shows the selected label', async () => {
    const { container } = render(
      <CategorySelect siteId="site-1" value="a" onChange={() => undefined} />,
    );
    expect(treeMock).toHaveBeenCalledWith('site-1');
    // After fetch resolves, the TreeSelect shows the selected item title.
    await waitFor(() => {
      const item = container.querySelector('.ant-select-selection-item');
      expect(item?.getAttribute('title')).toBe('A 音乐');
    });
  });

  it('subtrees the tree when taxonomyRoot points to a known root category', async () => {
    const { container } = render(
      <CategorySelect
        siteId="site-1"
        taxonomyRoot="root-1"
        value="a"
        onChange={() => undefined}
      />,
    );
    await waitFor(() => expect(treeMock).toHaveBeenCalledWith('site-1'));
    await waitFor(() => {
      const item = container.querySelector('.ant-select-selection-item');
      expect(item?.getAttribute('title')).toBe('A 音乐');
    });
  });

  it('falls back to empty tree on api failure', async () => {
    treeMock.mockRejectedValueOnce(new Error('network'));
    const { container } = render(
      <CategorySelect siteId="site-1" value={undefined} onChange={() => undefined} />,
    );
    await waitFor(() => expect(treeMock).toHaveBeenCalled());
    // TreeSelect should still mount with empty tree.
    await waitFor(() => {
      expect(container.querySelector('.ant-select')).not.toBeNull();
    });
  });

  it('disables the input when siteId is missing', () => {
    const { container } = render(
      <CategorySelect siteId="" value={undefined} onChange={() => undefined} />,
    );
    expect(container.querySelector('.ant-select-disabled')).not.toBeNull();
  });

  it('renders the selection as a single-select TreeSelect by default', async () => {
    const { container } = render(
      <CategorySelect siteId="site-1" value={undefined} onChange={() => undefined} />,
    );
    await waitFor(() => expect(treeMock).toHaveBeenCalled());
    // singleSelect defaults to true → .ant-select-single present.
    expect(container.querySelector('.ant-select-single')).not.toBeNull();
  });
});
