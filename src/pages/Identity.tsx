import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Checkbox, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  CheckOutlined, DeleteOutlined, EyeOutlined, LayoutOutlined, PlusOutlined, SettingOutlined,
  StopOutlined, ThunderboltOutlined, UnlockOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { frontendUsersApi, rolesApi, sitesApi, usersApi } from '../api';
import type {
  FrontendUserDetail, Role, SiteMember, User, UserReferenceSummary,
} from '../api/types';
import { hasCapability, isSystemAdmin, useAuth } from '../auth/AuthContext';
import { useSite } from '../context/SiteContext';
import ProfileFieldsForm from '../components/ProfileFieldsForm';
import { t } from '../i18n/locale';
import { PageHintAlert, PageHintRestore, usePageHint } from '../components/PageHint';
import { formatDateTime } from '../utils/datetime';

/**
 * 站点能力键**回退清单**（与后端 `SiteCapabilities.ALL` 对齐；正常路径由
 * `GET /api/v1/roles/capabilities` 下发，后端不可用时兜底）。
 * 键本身即展示名（语义自明）；与后端漂移会导致角色无法授予缺失能力。
 */
const SITE_CAPABILITY_FALLBACK = [
  'read', 'write', 'review', 'deploy', 'model', 'template', 'migrate', 'admin',
  'stats', 'stats-admin', 'logs', 'logs-admin',
];

/** 供对齐守护测试（SiteCapabilityCatalog.test.ts）与潜在复用方 import。 */
export const SITE_CAPABILITIES: readonly string[] = SITE_CAPABILITY_FALLBACK;

/**
 * 后台工具布局目录的**回退清单**（与后端 `BackendLayoutCatalog` 对齐）。
 *
 * <p>正常路径由 `GET /api/v1/roles/layouts` 下发（DEF-11-20），此处仅在后端不可用时兜底，
 * 避免前端硬编码再次与后端漂移。</p>
 */
const BACKEND_LAYOUT_OPTIONS = [
  { value: 'content', label: '内容' },
  { value: 'model', label: '模型' },
  { value: 'media', label: '媒体' },
  { value: 'workflow', label: '工作流' },
  { value: 'template', label: '模板' },
  { value: 'publish', label: '发布' },
  { value: 'users', label: '用户' },
  { value: 'site-settings', label: '站点设置' },
  { value: 'audit', label: '审计' },
  { value: 'migrate', label: '迁移' },
];

const KIND_TAG: Record<string, { color: string; label: string }> = {
  BACKEND: { color: 'blue', label: '后台' },
  FRONTEND: { color: 'purple', label: '前台' },
};

const LOGIN_MODE_TAG: Record<string, { color: string; label: string }> = {
  BACKEND: { color: 'green', label: '后台登录' },
  FRONTEND: { color: 'orange', label: '前台登录' },
};

interface DisableTarget {
  kind: 'user' | 'frontend';
  id: string;
  username: string;
  siteId?: string;
}

/**
 * 提取后端统一错误体的 `message`（如 409「角色仍被 N 个用户引用」、400「未知的后台布局编码」），
 * 取不到时回退到调用方给的兜底文案——避免出现静默失败或 `undefined` 提示。
 */
function errorMessage(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return detail || fallback;
}

/**
 * 操作列统一的「图标按钮 + Tooltip」：比文字按钮省一整列宽度，动作名同时放进
 * `aria-label`（可访问名称）与 Tooltip（悬停可发现）。
 *
 * <p>Tooltip 挂在外层 span 上：禁用态的 `button` 不派发鼠标事件，直接包 Button 会看不到提示。</p>
 *
 * @param hint 禁用时的补充说明（如「请先选择站点」）；缺省复用 `label`。
 */
function IconAction({
  label, icon, onClick, danger, primary, disabled, hint,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Tooltip title={hint ?? label}>
      <span style={{ display: 'inline-flex' }}>
        <Button
          size="small"
          type={primary ? 'primary' : 'default'}
          danger={danger}
          disabled={disabled}
          icon={icon}
          aria-label={label}
          onClick={onClick}
        />
      </span>
    </Tooltip>
  );
}


export default function IdentityPage() {
  const { me, refreshProfile } = useAuth();
  const { sites, siteId } = useSite();
  const [searchParams] = useSearchParams();
  const sysAdmin = isSystemAdmin(me);
  const siteAdmin = hasCapability(me, siteId, 'admin');

  // tab 即左侧导航叶子节点（users/members/frontend/roles），保持 URL 同步
  // 注：org / policy 已迁移至 /system-config（见 SystemConfig.tsx）
  const tabParam = searchParams.get('tab') || 'users';
  const activeTab = ['users', 'members', 'frontend', 'tiers', 'roles'].includes(tabParam) ? tabParam : 'users';

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<SiteMember[]>([]);
  const [frontendMembers, setFrontendMembers] = useState<SiteMember[]>([]);
  const [userOpen, setUserOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [bindSiteId, setBindSiteId] = useState<string | undefined>(siteId ?? undefined);
  const [bindRoleCode, setBindRoleCode] = useState<string>();
  const [memberBindUserId, setMemberBindUserId] = useState<string>();
  /** 页签内提示层（前端会员绑定 / 会员分组说明）：各自独立，可关闭，页面右上角「?」恢复。 */
  const frontendHint = usePageHint();
  const tiersHint = usePageHint();
  const [memberBindRoleCode, setMemberBindRoleCode] = useState<string>();
  const [capRole, setCapRole] = useState<Role | null>(null);
  const [layoutRole, setLayoutRole] = useState<Role | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberDetail, setMemberDetail] = useState<FrontendUserDetail | null>(null);
  const [disableTarget, setDisableTarget] = useState<DisableTarget | null>(null);
  const [disableRefs, setDisableRefs] = useState<UserReferenceSummary | null>(null);
  const [disableReassignId, setDisableReassignId] = useState<string>();
  const [disabling, setDisabling] = useState(false);
  /** 后台布局目录：优先取后端下发（DEF-11-20），失败时回退到内置清单。 */
  const [layoutOptions, setLayoutOptions] = useState(BACKEND_LAYOUT_OPTIONS);
  /** 站点能力目录：优先取后端下发（SiteCapabilities.ALL 单一来源），失败回退内置清单。 */
  const [capabilityOptions, setCapabilityOptions] = useState(SITE_CAPABILITY_FALLBACK);

  const load = async () => {
    const catalog = await rolesApi.list().catch(() => [] as Role[]);
    setRoles(catalog);
    const layouts = await rolesApi.layouts().catch(() => null);
    if (layouts?.length) {
      setLayoutOptions(layouts.map((l) => ({ value: l.code, label: l.name })));
    }
    const caps = await rolesApi.capabilities().catch(() => null);
    if (caps?.length) {
      setCapabilityOptions(caps.map((c) => c.key));
    }
    if (sysAdmin) {
      setUsers(await usersApi.list().catch(() => [] as User[]));
    }
    if (siteId && siteAdmin) {
      setMembers(await sitesApi.members(siteId).catch(() => [] as SiteMember[]));
      setFrontendMembers(await frontendUsersApi.list(siteId).catch(() => [] as SiteMember[]));
    } else {
      setMembers([]);
      setFrontendMembers([]);
    }
  };

  useEffect(() => { void load(); }, [sysAdmin, siteAdmin, siteId]);

  const orgRoles = useMemo(() => roles.filter((r) => r.scope === 'ORG'), [roles]);
  const siteRoles = useMemo(() => roles.filter((r) => r.scope !== 'ORG'), [roles]);
  const memberTiers = useMemo(
    () => roles.filter((r) => r.tierLevel != null).sort((a, b) => (a.tierLevel ?? 0) - (b.tierLevel ?? 0)),
    [roles],
  );

  const assign = async (userId: string, roleCode: string, targetSiteId?: string | null) => {
    await usersApi.assignRole(userId, { roleCode, siteId: targetSiteId || undefined });
    message.success(t('角色已绑定'));
    await load();
    if (editing?.id === userId) setEditing(await usersApi.get(userId));
    await refreshProfile();
  };

  const revoke = async (userId: string, roleId: string, targetSiteId?: string | null) => {
    await usersApi.revokeRole(userId, roleId, targetSiteId);
    message.success(t('角色已撤销'));
    await load();
    if (editing?.id === userId) setEditing(await usersApi.get(userId));
    await refreshProfile();
  };

  /** 删除角色：仍被用户引用时后端返回 409 并列出引用用户，需原样透出（TC-M02-009 / DEF-11-18）。 */
  const removeRole = async (role: Role) => {
    try {
      await rolesApi.remove(role.id);
      message.success(t('已删除'));
      await load();
    } catch (e) {
      message.error(errorMessage(e, t('删除角色失败')));
    }
  };

  /** 保存后台布局：非法编码为 400、失败必须可见（原实现无 catch，弹窗会静默不动，DEF-11-08 同类）。 */
  const saveRoleLayouts = async (role: Role) => {
    try {
      await rolesApi.updateLayouts(role.id, role.layouts || []);
      message.success(t('已更新'));
      setLayoutRole(null);
      await load();
    } catch (e) {
      message.error(errorMessage(e, t('保存后台布局失败')));
    }
  };

  /** spec 5.3：禁用前检查引用；有引用时弹出迁移对话框。 */
  const requestDisable = async (target: DisableTarget) => {
    if (target.kind === 'user') {
      const refs = await usersApi.references(target.id).catch(() => null);
      setDisableRefs(refs);
      setDisableTarget(target);
      setDisableReassignId(undefined);
      return;
    }
    // 会员：先尝试直接禁用；若因引用冲突 409，再弹迁移对话框
    try {
      await frontendUsersApi.disable(target.siteId!, target.id);
      message.success(t('已禁用'));
      await load();
    } catch (e) {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'USER_REFERENCE_CONFLICT') {
        setDisableRefs(null);
        setDisableTarget(target);
        setDisableReassignId(undefined);
      }
    }
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    setDisabling(true);
    try {
      if (disableTarget.kind === 'user') {
        await usersApi.disable(disableTarget.id, disableReassignId);
      } else {
        await frontendUsersApi.disable(disableTarget.siteId!, disableTarget.id, disableReassignId);
      }
      message.success(t('已禁用'));
      setDisableTarget(null);
      await load();
      if (editing?.id === disableTarget.id) setEditing(null);
    } finally {
      setDisabling(false);
    }
  };

  const reassignOptions = useMemo(() => {
    if (!disableTarget) return [];
    if (disableTarget.kind === 'user') {
      return users.filter((u) => u.id !== disableTarget.id).map((u) => ({ value: u.id, label: `${u.username}（${u.displayName}）` }));
    }
    return frontendMembers.filter((m) => m.userId !== disableTarget.id).map((m) => ({ value: m.userId, label: `${m.username}（${m.displayName}）` }));
  }, [disableTarget, users, frontendMembers]);

  const memberDrawer = (member: FrontendUserDetail) => (
    <Drawer title={`会员 ${member.username}`} open={!!memberDetail} onClose={() => setMemberDetail(null)} width={480}>
      <Typography.Paragraph>{t('核心字段')}</Typography.Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="purple">kind=FRONTEND</Tag>
        <Tag>{member.status}</Tag>
        <Typography.Text type="secondary">{member.email}</Typography.Text>
      </Space>
      <Typography.Paragraph strong>{t('资料（system.frontend-user）')}</Typography.Paragraph>
      <ProfileFieldsForm
        typeCode="system.frontend-user"
        siteId={siteId ?? ''}
        userId={member.userId}
        operatorIsAdmin={siteAdmin}
        onChanged={() => load()}
      />
    </Drawer>
  );

  return (
    <div>
      {((activeTab === 'roles' && sysAdmin) || (activeTab === 'tiers' && sysAdmin) || (activeTab === 'users' && sysAdmin) || (activeTab === 'frontend' && siteAdmin && siteId)) && (
        <Space style={{ width: '100%', justifyContent: 'flex-end', marginBottom: 16 }}>
          <PageHintRestore hint={frontendHint} />
          <PageHintRestore hint={tiersHint} />
          {activeTab === 'tiers' && sysAdmin && <Button icon={<PlusOutlined />} onClick={() => setTierOpen(true)}>{t('新建会员分组')}</Button>}
          {activeTab === 'roles' && sysAdmin && <Button icon={<PlusOutlined />} onClick={() => setRoleOpen(true)}>{t('新建角色')}</Button>}
          {activeTab === 'users' && sysAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => setUserOpen(true)}>{t('新建用户')}</Button>}
          {activeTab === 'frontend' && siteAdmin && siteId && <Button icon={<PlusOutlined />} onClick={() => setMemberOpen(true)}>{t('新建会员')}</Button>}
        </Space>
      )}

      {/* 叶子菜单直达：按 ?tab= 仅渲染当前分组，不再显示页签条 */}
      {activeTab === 'users' && sysAdmin && (
        <Table
          rowKey="id"
          dataSource={users}
          columns={[
            { title: t('用户名'), dataIndex: 'username' },
            { title: t('显示名'), dataIndex: 'displayName' },
            {
              title: t('通道'),
              dataIndex: 'kind',
              render: (k: string) => {
                const meta = KIND_TAG[k] ?? { color: 'default', label: k };
                return <Tag color={meta.color}>{meta.label}</Tag>;
              },
            },
            { title: t('状态'), dataIndex: 'status', render: (s: string) => <Tag color={s === 'LOCKED' ? 'red' : s === 'DISABLED' ? 'default' : 'green'}>{s}</Tag> },
            { title: t('失败次数'), dataIndex: 'failedLogins' },
            { title: t('最后登录'), dataIndex: 'lastLoginAt', render: (v: string | null) => formatDateTime(v) },
            {
              title: t('登录模式'),
              dataIndex: 'lastLoginMode',
              render: (m: string | null) => {
                if (!m) return '—';
                const meta = LOGIN_MODE_TAG[m] ?? { color: 'default', label: m };
                return <Tag color={meta.color}>{meta.label}</Tag>;
              },
            },
            {
              title: t('角色'),
              render: (_: unknown, row: User) => (
                <Space wrap size={[4, 4]}>
                  {(row.roles || []).map((r) => (
                    <Tag key={`${r.roleId}-${r.siteId || 'org'}`}>{r.roleCode}{r.siteId ? '' : t(' · 组织')}</Tag>
                  ))}
                </Space>
              ),
            },
            {
              title: t('操作'),
              render: (_: unknown, row: User) => (
                <Space>
                  <IconAction
                    label={t('配置')}
                    icon={<SettingOutlined />}
                    onClick={() => { setEditing(row); setBindSiteId(row.homeSiteId ?? siteId ?? undefined); }}
                  />
                  <IconAction
                    label={t('解锁')}
                    icon={<UnlockOutlined />}
                    onClick={async () => { await usersApi.unlock(row.id); message.success(t('已解锁')); load(); }}
                  />
                  <IconAction
                    label={t('禁用')}
                    icon={<StopOutlined />}
                    danger
                    disabled={row.status === 'DISABLED'}
                    onClick={() => void requestDisable({ kind: 'user', id: row.id, username: row.username })}
                  />
                </Space>
              ),
            },
          ]}
        />
      )}
      {activeTab === 'members' && siteAdmin && siteId && (
        <>
          <Space style={{ marginBottom: 12 }} wrap>
            <Input
              id="member-username"
              placeholder={t('已有用户名')}
              style={{ width: 180 }}
            />
            <Select
              placeholder={t('角色')}
              style={{ width: 180 }}
              value={bindRoleCode}
              options={siteRoles.map((r) => ({ value: r.code, label: `${r.name} (${r.code})` }))}
              onChange={setBindRoleCode}
            />
            <Button type="primary" disabled={!bindRoleCode} onClick={async () => {
              const input = document.getElementById('member-username') as HTMLInputElement | null;
              const username = input?.value.trim();
              if (!username || !bindRoleCode || !siteId) return;
              await sitesApi.addMember(siteId, { username, roleCode: bindRoleCode });
              message.success(t('已加入本站'));
              if (input) input.value = '';
              await load();
              await refreshProfile();
            }}>{t('添加成员')}</Button>
          </Space>
          <Table
            rowKey="userId"
            dataSource={members}
            columns={[
              { title: t('用户'), dataIndex: 'username' },
              { title: t('显示名'), dataIndex: 'displayName' },
              { title: t('状态'), dataIndex: 'status' },
              {
                title: t('本站角色'),
                render: (_: unknown, row: SiteMember) => (
                  <Space wrap>
                    {row.roles.map((r) => (
                      <Tag key={r.roleId} closable={siteAdmin} onClose={(e) => { e.preventDefault(); void revoke(row.userId, r.roleId, siteId); }}>
                        {r.roleCode}
                      </Tag>
                    ))}
                  </Space>
                ),
              },
            ]}
          />
        </>
      )}
      {activeTab === 'frontend' && siteAdmin && siteId && (
        <>
          <PageHintAlert
            hint={frontendHint}
            style={{ marginBottom: 12 }}
            message={t('会员分组在「会员分组」里创建。这里只做绑定；栏目和内容的权限里把该角色当作会员组授予查看。')}
          />
          <Space style={{ marginBottom: 12 }} wrap>
            <Select
              placeholder={t('会员')}
              style={{ width: 220 }}
              value={memberBindUserId}
              options={frontendMembers.map((m) => ({ value: m.userId, label: `${m.displayName}（${m.username}）` }))}
              onChange={setMemberBindUserId}
            />
            <Select
              placeholder={t('会员分组')}
              style={{ width: 220 }}
              value={memberBindRoleCode}
              options={memberTiers.map((r) => ({ value: r.code, label: `${r.name}（${r.tierLevel}）` }))}
              onChange={setMemberBindRoleCode}
            />
            <Button
              type="primary"
              disabled={!memberBindUserId || !memberBindRoleCode}
              onClick={() => memberBindUserId && memberBindRoleCode && assign(memberBindUserId, memberBindRoleCode, siteId)}
            >{t('绑定等级')}</Button>
          </Space>
          <Table
          rowKey="userId"
          dataSource={frontendMembers}
          columns={[
            { title: t('用户名'), dataIndex: 'username' },
            { title: t('显示名'), dataIndex: 'displayName' },
            { title: t('邮箱'), dataIndex: 'email', render: (v?: string) => v || '—' },
            { title: t('状态'), dataIndex: 'status', render: (s: string) => <Tag color={s === 'LOCKED' ? 'red' : s === 'DISABLED' ? 'default' : s === 'PENDING' ? 'orange' : 'green'}>{s === 'PENDING' ? t('待审核') : s}</Tag> },
            {
              title: t('会员分组'),
              render: (_: unknown, row: SiteMember) => {
                const bound = row.roles.filter((assignment) => memberTiers.some((tier) => tier.id === assignment.roleId));
                if (!bound.length) return '—';
                return (
                  <Space wrap>
                    {bound.map((assignment) => (
                      <Tag
                        key={assignment.roleId}
                        color="purple"
                        closable
                        onClose={(e) => { e.preventDefault(); void revoke(row.userId, assignment.roleId, siteId); }}
                      >
                        {assignment.roleName}
                      </Tag>
                    ))}
                  </Space>
                );
              },
            },
            {
              title: t('操作'),
              render: (_: unknown, row: SiteMember) => (
                <Space>
                  <IconAction
                    label={t('查看')}
                    icon={<EyeOutlined />}
                    onClick={async () => {
                      setMemberDetail(await frontendUsersApi.detail(siteId, row.userId));
                    }}
                  />
                  {row.status === 'PENDING' && (
                    <IconAction
                      label={t('通过')}
                      icon={<CheckOutlined />}
                      primary
                      onClick={async () => {
                        await frontendUsersApi.approve(siteId, row.userId);
                        message.success(t('会员已通过'));
                        await load();
                      }}
                    />
                  )}
                  {/* 待审核会员只走「通过」；其余状态可解锁（恢复登录 + 清零失败计数） */}
                  {row.status !== 'PENDING' && (
                    <IconAction
                      label={t('解锁')}
                      icon={<UnlockOutlined />}
                      onClick={async () => {
                        await frontendUsersApi.unlock(siteId, row.userId);
                        message.success(t('已解锁'));
                        await load();
                      }}
                    />
                  )}
                  <IconAction
                    label={t('禁用')}
                    icon={<StopOutlined />}
                    danger
                    disabled={row.status === 'DISABLED'}
                    onClick={() => void requestDisable({ kind: 'frontend', id: row.userId, username: row.username, siteId })}
                  />
                </Space>
              ),
            },
          ]}
        />
        </>
      )}


      {activeTab === 'tiers' && sysAdmin && (
        <>
          <PageHintAlert
            hint={tiersHint}
            style={{ marginBottom: 12 }}
            message={t('会员分组只用于前台访问授权。不能授予站点能力，也不能绑定后台布局。判定不比较等级数字。')}
          />
          <Table
            rowKey="id"
            dataSource={memberTiers}
            columns={[
              { title: t('编码'), dataIndex: 'code' },
              { title: t('名称'), dataIndex: 'name' },
              { title: t('等级'), dataIndex: 'tierLevel' },
              { title: t('说明'), dataIndex: 'description', render: (v?: string) => v || '—' },
              {
                title: t('操作'),
              render: (_: unknown, row: Role) => (
                <Space>
                  <IconAction
                    label={t('删除')}
                    icon={<DeleteOutlined />}
                    danger
                    disabled={row.builtIn}
                    onClick={async () => {
                      await rolesApi.remove(row.id);
                      message.success(t('已删除'));
                      await load();
                    }}
                  />
                </Space>
              ),
              },
            ]}
          />
          <Modal title={t('新建会员分组')} open={tierOpen} onCancel={() => setTierOpen(false)}
            onOk={() => (document.getElementById('tier-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose>
            <Form
              id="tier-form"
              layout="vertical"
              onFinish={async (v: { code: string; name: string; description?: string; tierLevel: number }) => {
                try {
                  await rolesApi.create({
                    code: v.code, name: v.name, description: v.description,
                    capabilities: [], layouts: [], tierLevel: Number(v.tierLevel),
                  });
                  setTierOpen(false);
                  message.success(t('会员分组已创建'));
                  await load();
                } catch (e) {
                  message.error(errorMessage(e, t('创建会员分组失败')));
                }
              }}
            >
              <Form.Item name="code" label={t('编码')} rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="tierLevel" label={t('等级数字')} rules={[{ required: true }]} extra={t('只用于排序和展示。')}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="description" label={t('说明')}><Input /></Form.Item>
            </Form>
          </Modal>
        </>
      )}

      {activeTab === 'roles' && sysAdmin && (
        <Table
          rowKey="id"
          dataSource={roles}
          columns={[
            { title: t('编码'), dataIndex: 'code' },
            { title: t('名称'), dataIndex: 'name' },
            { title: t('范围'), dataIndex: 'scope', render: (s: string) => <Tag>{s}</Tag> },
            { title: t('内置'), dataIndex: 'builtIn', render: (v: boolean) => v ? <Tag color="blue">{t('内置')}</Tag> : <Tag>{t('自定义')}</Tag> },
            {
              title: t('会员分组'),
              dataIndex: 'tierLevel',
              render: (v: number | null) => (v == null ? '—' : v),
            },
            {
              title: t('能力'),
              render: (_: unknown, row: Role) => (row.capabilities || []).join(', ') || '—',
            },
            {
              title: t('后台布局'),
              render: (_: unknown, row: Role) => {
                const codes = (row.layouts || []).map((c) => layoutOptions.find((o) => o.value === c)?.label || c);
                return codes.length ? codes.join('、') : '—';
              },
            },
            {
              title: t('操作'),
              render: (_: unknown, row: Role) => (
                <Space>
                  {!row.builtIn && row.tierLevel == null && (
                    <IconAction label={t('能力')} icon={<ThunderboltOutlined />} onClick={() => setCapRole(row)} />
                  )}
                  {!row.builtIn && row.tierLevel == null && (
                    <IconAction label={t('布局')} icon={<LayoutOutlined />} onClick={() => setLayoutRole(row)} />
                  )}
                  {!row.builtIn && (
                    <IconAction label={t('删除')} icon={<DeleteOutlined />} danger onClick={() => removeRole(row)} />
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      <Modal title={t('新建用户')} open={userOpen} onCancel={() => setUserOpen(false)}
        onOk={() => (document.getElementById('user-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose>
        <Form id="user-form" layout="vertical" onFinish={async (v) => {
          await usersApi.create(v);
          message.success(t('用户已创建'));
          setUserOpen(false);
          load();
        }}>
          <Form.Item name="username" label={t('用户名')} rules={[{ required: true, min: 3 }]}><Input /></Form.Item>
          <Form.Item name="password" label={t('密码')} extra={t('至少 8 位，含大小写字母和数字')} rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
          <Form.Item name="displayName" label={t('显示名')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label={t('邮箱')}><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title={t('新建自定义角色')} open={roleOpen} onCancel={() => setRoleOpen(false)}
        onOk={() => (document.getElementById('role-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose>
        <Form id="role-form" layout="vertical" onFinish={async (v) => {
          try {
            const memberTier = v.tierLevel != null && v.tierLevel !== '';
            await rolesApi.create(memberTier
              ? { ...v, tierLevel: Number(v.tierLevel), capabilities: [], layouts: [] }
              : v);
            message.success(t('角色已创建'));
            setRoleOpen(false);
            await load();
          } catch (e) {
            message.error(errorMessage(e, t('创建角色失败')));
          }
        }}>
          <Form.Item name="code" label={t('编码')} rules={[{ required: true }]}><Input placeholder="kebab-case" /></Form.Item>
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('描述')}><Input /></Form.Item>
          <Form.Item name="tierLevel" label={t('会员分组')} extra={t('填写后成为会员档：不能授予站点能力，也不能绑定后台布局。访问判定不比较这个数字。')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const memberTier = getFieldValue('tierLevel') != null && getFieldValue('tierLevel') !== '';
              return (
                <>
                  <Form.Item name="capabilities" label={t('能力')}>
                    <Checkbox.Group options={capabilityOptions} disabled={memberTier} />
                  </Form.Item>
                  <Form.Item name="layouts" label={t('后台布局')} extra={t('未绑定任何布局的角色无法登录后台（spec 5.4）')}>
                    <Checkbox.Group options={layoutOptions} disabled={memberTier} />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('新建会员')} open={memberOpen} onCancel={() => setMemberOpen(false)}
        onOk={() => (document.getElementById('member-form') as HTMLFormElement)?.requestSubmit()} destroyOnClose>
        <Form id="member-form" layout="vertical" onFinish={async (v) => {
          if (!siteId) return;
          await frontendUsersApi.create(siteId, v);
          message.success(t('会员已创建'));
          setMemberOpen(false);
          load();
        }}>
          <Form.Item name="username" label={t('用户名')} rules={[{ required: true, min: 3 }]}><Input /></Form.Item>
          <Form.Item name="password" label={t('密码')} extra={t('至少 8 位')} rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
          <Form.Item name="displayName" label={t('显示名')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label={t('邮箱')}><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title={t('自定义角色能力')} open={!!capRole} onCancel={() => setCapRole(null)}
        onOk={async () => {
          if (!capRole) return;
          await rolesApi.updateCapabilities(capRole.id, capRole.capabilities || []);
          message.success(t('已更新'));
          setCapRole(null);
          load();
        }} destroyOnClose>
        <Checkbox.Group
          options={capabilityOptions}
          value={capRole?.capabilities}
          onChange={(v) => setCapRole(capRole ? { ...capRole, capabilities: v as string[] } : null)}
        />
      </Modal>

      <Modal title={layoutRole ? `后台布局 · ${layoutRole.name} (${layoutRole.code})` : ''}
        open={!!layoutRole} onCancel={() => setLayoutRole(null)}
        onOk={() => layoutRole && saveRoleLayouts(layoutRole)} destroyOnClose>
        <Typography.Paragraph type="secondary">
          
          {t('绑定布局后，拥有该角色的用户方可登录后台并看到对应菜单。无任何布局时后台登录被拒绝。')}
        </Typography.Paragraph>
        <Checkbox.Group
          options={layoutOptions}
          value={layoutRole?.layouts}
          onChange={(v) => setLayoutRole(layoutRole ? { ...layoutRole, layouts: v as string[] } : null)}
        />
      </Modal>

      <Drawer title={editing ? `配置 ${editing.username}` : ''} open={!!editing} onClose={() => setEditing(null)} width={520}>
        {editing && (
          <>
            <Typography.Paragraph>{t('组织角色')}</Typography.Paragraph>
            <Space wrap>
              {orgRoles.map((r) => {
                const bound = (editing.roles || []).some((a) => a.roleId === r.id && !a.siteId);
                return bound
                  ? <Tag key={r.id} color="blue" closable={sysAdmin} onClose={(e) => { e.preventDefault(); void revoke(editing.id, r.id, null); }}>{r.code}</Tag>
                  : sysAdmin ? <Button key={r.id} size="small" onClick={() => assign(editing.id, r.code, null)}>{r.code}</Button> : null;
              })}
            </Space>
            <Typography.Paragraph style={{ marginTop: 16 }}>{t('站点角色')}</Typography.Paragraph>
            <Space wrap style={{ marginBottom: 12 }}>
              <Select
                placeholder={t('站点')}
                style={{ width: 200 }}
                value={bindSiteId}
                options={sites.map((s) => ({ value: s.id, label: s.name }))}
                onChange={setBindSiteId}
              />
              <Select
                placeholder={t('角色')}
                style={{ width: 180 }}
                value={bindRoleCode}
                options={siteRoles.map((r) => ({ value: r.code, label: `${r.name} (${r.code})` }))}
                onChange={setBindRoleCode}
              />
              <Button type="primary" disabled={!bindSiteId || !bindRoleCode}
                onClick={() => bindSiteId && bindRoleCode && assign(editing.id, bindRoleCode, bindSiteId)}>{t('绑定')}</Button>
            </Space>
            <Table
              size="small"
              rowKey={(r) => `${r.roleId}-${r.siteId || 'org'}`}
              dataSource={(editing.roles || []).filter((r) => r.siteId)}
              pagination={false}
              columns={[
                { title: t('角色'), dataIndex: 'roleCode' },
                { title: t('站点'), dataIndex: 'siteId', render: (id: string) => sites.find((s) => s.id === id)?.name || id },
                {
                  title: '',
                  render: (_: unknown, row: NonNullable<User['roles']>[number]) => (
                    <Button size="small" danger onClick={() => revoke(editing.id, row.roleId, row.siteId)}>{t('撤销')}</Button>
                  ),
                },
              ]}
            />
            <Typography.Paragraph style={{ marginTop: 16 }}>{t('重置密码')}</Typography.Paragraph>
            <Form layout="inline" onFinish={async (v) => {
              await usersApi.changePassword(editing.id, { newPassword: v.newPassword });
              message.success(t('密码已重置'));
            }}>
              <Form.Item name="newPassword" rules={[{ required: true, min: 8 }]}><Input.Password placeholder={t('新密码')} /></Form.Item>
              <Button htmlType="submit">{t('重置')}</Button>
            </Form>
            <Typography.Paragraph style={{ marginTop: 16 }}>{t('资料（system.user-profile，自定义字段随内容类型扩展）')}</Typography.Paragraph>
            <ProfileFieldsForm
              typeCode="system.user-profile"
              siteId={editing.homeSiteId ?? siteId ?? sites[0]?.id ?? ''}
              userId={editing.id}
              operatorIsAdmin={sysAdmin}
              onChanged={() => load()}
            />
          </>
        )}
      </Drawer>

      {memberDetail && memberDrawer(memberDetail)}

      <Modal
        title={`禁用 ${disableTarget?.username ?? ''}`}
        open={!!disableTarget}
        onCancel={() => setDisableTarget(null)}
        onOk={() => void confirmDisable()}
        okButtonProps={{
          danger: true,
          disabled: Boolean(disableRefs?.hasReferences && !disableReassignId),
        }}
        confirmLoading={disabling}
        okText={t('确认禁用')}
        cancelText={t('取消')}
        destroyOnClose
      >
        {disableRefs?.hasReferences && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('该用户仍有引用')}
            description={`仍是 ${disableRefs.ownedContents} 条内容的 owner，并有 ${disableRefs.pendingTasks} 条工作流待办。必须选择替代用户迁移引用后才能禁用（spec 5.3）。`}
          />
        )}
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>{t('替代用户（可选，用于迁移内容 owner 与待办受理人）：')}</span>
          <Select
            style={{ width: '100%' }}
            placeholder={t('选择替代用户')}
            value={disableReassignId}
            onChange={setDisableReassignId}
            options={reassignOptions}
            showSearch
            optionFilterProp="label"
            allowClear
          />
        </Space>
      </Modal>

    </div>
  );
}
