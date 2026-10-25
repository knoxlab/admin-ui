import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassificationVisibilityHint } from '../ClassificationRoleVisibility';
import { resolveRoleVisibility } from '../../utils/gyz199Visibility';
import type { RoleVisibility } from '../../utils/gyz199Visibility';

describe('ClassificationVisibilityHint', () => {
  it('renders nothing when disabled, even with a valid visibility', () => {
    const visibility = resolveRoleVisibility('B12');
    const { container } = render(
      <ClassificationVisibilityHint enabled={false} visibility={visibility} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the GY/Z 199 alert when enabled with a default visibility', () => {
    const visibility: RoleVisibility = resolveRoleVisibility('B12');
    const { container, getByText } = render(
      <ClassificationVisibilityHint enabled visibility={visibility} />,
    );
    expect(container.querySelector('.ant-alert')).not.toBeNull();
    // Hint should mention the base code B12
    expect(getByText(/B12/).textContent).toBeTruthy();
  });

  it('shows the imitation range when a rule with fromCode/toCode is present', () => {
    const visibility = resolveRoleVisibility('J1689');
    const { getByText } = render(
      <ClassificationVisibilityHint enabled visibility={visibility} />,
    );
    // J1689 规则的 fromCode=J1613, toCode=J1685
    expect(getByText(/J1613/).textContent).toBeTruthy();
    expect(getByText(/J1685/).textContent).toBeTruthy();
  });

  it('omits the imitation range line when rule has no fromCode/toCode', () => {
    const visibility = resolveRoleVisibility('A39');
    const { container } = render(
      <ClassificationVisibilityHint enabled visibility={visibility} />,
    );
    // A39 rule has fromCode=null, so the <br /> branch should not appear.
    // We can check that no two <br/> siblings exist.
    const breaks = container.querySelectorAll('br');
    expect(breaks).toHaveLength(0);
  });

  it('renders the not-ready state with the placeholder hint when no base code is set', () => {
    const visibility = resolveRoleVisibility('');
    const { container } = render(
      <ClassificationVisibilityHint enabled visibility={visibility} />,
    );
    expect(container.querySelector('.ant-alert')).not.toBeNull();
  });
});
