/**
 * Central Command API client.
 */

const BASE = '/api'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('cc_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  })
  if (res.status === 401) {
    localStorage.removeItem('cc_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Types ────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string
  username: string
  full_name: string
  email: string | null
  role: string
  is_active: boolean
  created_at: string | null
}

export interface Client {
  id: string
  name: string
  code: string
  db_host: string
  db_port: number
  db_name: string
  db_username: string
  db_use_tls: boolean
  status: string
  notes: string | null
  last_connected_at: string | null
  last_known_migration_head: string | null
  app_key_set: boolean
  created_at: string
  updated_at: string
}

export interface ClientSummary {
  id: string
  name: string
  code: string
  status: string
  max_licenses: number | null
  last_connected_at: string | null
  last_known_migration_head: string | null
  app_key_set: boolean
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  migration_head: string | null
  companies: { id: string; name: string; uen: string | null }[] | null
}

export interface Advertisement {
  id: string
  tag: string | null
  text: string
  sort_order: number
  is_active: boolean
  created_at: string
  assignments: { client_id: string; pushed_at: string | null }[]
}

/** Which client-side slot this pushes to -- `login` (the client's Login
 * page) or `app` (its in-app banner) -- mirrors websoft-service-erp's
 * App\Models\AdBannerSettings::SLOT_* split (2026-09-16). */
export type VideoSlot = 'login' | 'app'

export interface VideoSetting {
  id: string
  video_url: string | null
  label: string
  slot: VideoSlot
  is_active: boolean
  created_at: string
  assignments: { client_id: string; pushed_at: string | null }[]
}

export type MailPurpose = 'otp' | 'helpdesk'

export interface SystemMailSetting {
  id: string
  purpose: MailPurpose
  label: string
  host: string | null
  port: number
  username: string | null
  password_set: boolean
  use_tls: boolean
  from_email: string | null
  from_name: string | null
  /** Central Command sends its own sign-in / reset emails through this one (2026-09-25). */
  used_by_central_command: boolean
  created_at: string
  assignments: { client_id: string; pushed_at: string | null }[]
}

export interface ClientModule {
  module_key: string
  module_name: string
  is_built: boolean
  enabled: boolean
  license_type: string
  notes: string | null
  updated_at: string | null
  company_id: string
  company_name: string
}

export interface PushLogEntry {
  id: string
  client_id: string
  push_type: string
  detail: string
  success: boolean
  error_message: string | null
  pushed_at: string
  pushed_by: string | null
}

export interface DashboardStats {
  total_clients: number
  active_clients: number
  suspended_clients: number
  total_ads: number
  active_ads: number
  recent_pushes: PushLogEntry[]
}

export interface PushResult {
  results: { client: string; success: boolean; error?: string; count?: number }[]
}

// ── Staff / Support Logins ───────────────────────────────────────
export interface SupportLogin {
  id: string
  admin_user_id: string
  client_id: string
  login_email: string
  client_user_id: string | null
  status: string
  reason: string | null
  pushed_at: string
  pushed_by: string | null
  revoked_at: string | null
}

// ── Upgrades (Central Command itself, and each client) ──────────────
// Shape shared by GET /cc-upgrade/status and /version-management/clients/{id}
// -- see backend App\Support\UpgradeStatus. Nothing here runs an upgrade:
// a request is queued and the install's own host agent performs it.
export interface UpgradeAgentState {
  current_sha: string | null
  current_subject: string | null
  current_committed_at: string | null
  remote_sha: string | null
  remote_subject: string | null
  remote_committed_at: string | null
  commits_behind: number
  agent_host: string | null
  last_heartbeat_at: string | null
}

export interface UpgradeRequest {
  id: string
  kind: 'upgrade' | 'rollback'
  target_ref: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  requested_by: string | null
  requested_at: string
  started_at: string | null
  finished_at: string | null
  from_sha: string | null
  to_sha: string | null
  log: string | null
  error: string | null
}

export interface UpgradeStatus {
  supported: boolean
  message: string | null
  agent: UpgradeAgentState | null
  agent_online: boolean
  active: UpgradeRequest | null
  history: UpgradeRequest[]
  can_upgrade: boolean
  can_rollback: boolean
  rollback_to: string | null
}

export interface ClientUpgradeListItem {
  id: string
  name: string
  code: string
  status: string
  /** Null = Central Command has never successfully connected to this client (e.g. registered but not set up yet). */
  last_connected_at: string | null
}

// ── API methods ──────────────────────────────────────────────────────

// ── Auth response types ─────────────────────────────────────────────
export interface LoginResponse {
  status: 'ok' | 'otp_required'
  access_token?: string
  full_name?: string
  otp_session?: string
  email_sent?: boolean
  email_hint?: string | null
  /** false = no System Mail mailbox is set for Central Command, so the code is shown instead. */
  email_configured?: boolean
  /** Set when a mailbox is set up but the code could not be emailed. */
  delivery_error?: string
  _dev_otp?: string
}

export interface VerifyOTPResponse {
  status: 'ok'
  access_token: string
  full_name: string
}

export interface ForgotPasswordResponse {
  status: string
  message: string
  email_hint?: string | null
  _dev_otp?: string
}

export interface ForgotUsernameResponse {
  status: string
  message: string
  _dev_username?: string
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  verifyOtp: (otp_session: string, otp_code: string) =>
    request<VerifyOTPResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ otp_session, otp_code }),
    }),
  forgotPassword: (username: string) =>
    request<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  resetPassword: (username: string, otp_code: string, new_password: string) =>
    request<{ status: string; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, otp_code, new_password }),
    }),
  forgotUsername: (email: string) =>
    request<ForgotUsernameResponse>('/auth/forgot-username', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  me: () => request<AdminUser>('/auth/me'),

  // Dashboard
  getDashboard: () => request<DashboardStats>('/dashboard/'),

  // Clients
  listClients: () => request<ClientSummary[]>('/clients/'),
  getClient: (id: string) => request<Client>(`/clients/${id}`),
  createClient: (data: Partial<Client>) =>
    request<Client>('/clients/', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id: string, data: Partial<Client>) =>
    request<Client>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteClient: (id: string) =>
    request<void>(`/clients/${id}`, { method: 'DELETE' }),
  testConnection: (id: string) =>
    request<ConnectionTestResult>(`/clients/${id}/test-connection`, { method: 'POST' }),

  // Advertisements
  listAds: () => request<Advertisement[]>('/advertisements/'),
  createAd: (data: { tag?: string; text: string; sort_order?: number; client_ids?: string[] }) =>
    request<Advertisement>('/advertisements/', { method: 'POST', body: JSON.stringify(data) }),
  updateAd: (id: string, data: Partial<Advertisement & { client_ids?: string[] }>) =>
    request<Advertisement>(`/advertisements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAd: (id: string) =>
    request<void>(`/advertisements/${id}`, { method: 'DELETE' }),
  pushAd: (id: string) =>
    request<PushResult>(`/advertisements/${id}/push`, { method: 'POST' }),
  pushAllAds: () =>
    request<PushResult>('/advertisements/push-all', { method: 'POST' }),

  // Videos
  listVideos: () => request<VideoSetting[]>('/advertisements/videos'),
  createVideo: (data: { video_url?: string; label: string; slot: VideoSlot; client_ids?: string[] }) =>
    request<VideoSetting>('/advertisements/videos', { method: 'POST', body: JSON.stringify(data) }),
  updateVideo: (id: string, data: Partial<{ video_url: string | null; label: string; slot: VideoSlot; is_active: boolean; client_ids: string[] }>) =>
    request<VideoSetting>(`/advertisements/videos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteVideo: (id: string) =>
    request<void>(`/advertisements/videos/${id}`, { method: 'DELETE' }),
  pushVideo: (id: string) =>
    request<PushResult>(`/advertisements/videos/${id}/push`, { method: 'POST' }),

  // Licenses
  getClientModules: (clientId: string) =>
    request<ClientModule[]>(`/licenses/${clientId}/modules`),
  setModuleLicense: (clientId: string, companyId: string, data: { module_key: string; enabled: boolean; license_type?: string; notes?: string }) =>
    request<{ success: boolean }>(`/licenses/${clientId}/companies/${companyId}/modules`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateLicenseLimit: (clientId: string, maxLicenses: number | null) =>
    request<{ success: boolean; max_licenses: number | null }>(`/licenses/${clientId}/license-limit`, {
      method: 'PATCH',
      body: JSON.stringify({ max_licenses: maxLicenses }),
    }),
  pushLicenseLimit: (clientId: string) =>
    request<{ success: boolean; max_licenses: number | null }>(`/licenses/${clientId}/license-limit/push`, {
      method: 'POST',
    }),



  // System Mail Settings
  listSystemMail: () => request<SystemMailSetting[]>('/system-mail/'),
  createSystemMail: (data: {
    purpose: MailPurpose; label: string; host?: string; port?: number; username?: string
    password?: string; use_tls?: boolean; from_email?: string; from_name?: string; client_ids?: string[]
  }) => request<SystemMailSetting>('/system-mail/', { method: 'POST', body: JSON.stringify(data) }),
  updateSystemMail: (id: string, data: Partial<{
    label: string; host: string; port: number; username: string; password: string
    use_tls: boolean; from_email: string; from_name: string; client_ids: string[]
  }>) => request<SystemMailSetting>(`/system-mail/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSystemMail: (id: string) =>
    request<void>(`/system-mail/${id}`, { method: 'DELETE' }),
  pushSystemMail: (id: string) =>
    request<PushResult>(`/system-mail/${id}/push`, { method: 'POST' }),
  testSystemMail: (id: string) =>
    request<{ sent: boolean; to: string }>(`/system-mail/${id}/test-email`, { method: 'POST' }),
  useSystemMailForCentralCommand: (id: string, enabled: boolean) =>
    request<SystemMailSetting>(`/system-mail/${id}/use-for-central-command`, { method: 'POST', body: JSON.stringify({ enabled }) }),

  // Staff Management
  listStaff: () => request<AdminUser[]>('/staff/'),
  createStaff: (data: { username: string; full_name: string; email?: string; password: string; role: string }) =>
    request<AdminUser>('/staff/', { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id: string, data: Partial<{ full_name: string; email: string; role: string; is_active: boolean; password: string }>) =>
    request<AdminUser>(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteStaff: (id: string) =>
    request<void>(`/staff/${id}`, { method: 'DELETE' }),

  // Support Logins
  listSupportLogins: (clientId?: string) =>
    request<SupportLogin[]>(`/staff/support-logins${clientId ? `?client_id=${clientId}` : ''}`),
  pushSupportLogin: (data: { client_id: string; admin_user_id: string; login_email: string; login_password: string; reason?: string }) =>
    request<{ success: boolean; client: string; login_email: string }>('/staff/support-logins/push', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  revokeSupportLogin: (loginId: string) =>
    request<{ success: boolean }>(`/staff/support-logins/${loginId}/revoke`, { method: 'POST' }),
  updateSupportLogin: (loginId: string, data: Partial<{ reason: string }>) =>
    request<SupportLogin>(`/staff/support-logins/${loginId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resetSupportLoginPassword: (loginId: string, newPassword: string) =>
    request<{ success: boolean; client: string; login_email: string }>(`/staff/support-logins/${loginId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    }),
  changeAdminPassword: (userId: string, currentPassword: string | null, newPassword: string) =>
    request<AdminUser>(`/staff/${userId}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  resetAdminUsername: (userId: string, username: string) =>
    request<AdminUser>(`/staff/${userId}/reset-username`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  addSupportStaff: (data: { username: string; full_name: string; email: string; password: string }) =>
    request<AdminUser>('/staff/support-logins', { method: 'POST', body: JSON.stringify(data) }),

  // Upgrades -- Central Command itself
  getCcUpgradeStatus: () => request<UpgradeStatus>('/cc-upgrade/status'),
  requestCcUpgrade: () => request<UpgradeStatus>('/cc-upgrade/upgrade', { method: 'POST' }),
  requestCcRollback: () => request<UpgradeStatus>('/cc-upgrade/rollback', { method: 'POST' }),
  cancelCcUpgrade: (requestId: string) =>
    request<UpgradeStatus>(`/cc-upgrade/requests/${requestId}/cancel`, { method: 'POST' }),

  // Upgrades -- client installs
  listClientUpgrades: () => request<ClientUpgradeListItem[]>('/version-management/clients'),
  getClientUpgradeStatus: (clientId: string) => request<UpgradeStatus>(`/version-management/clients/${clientId}`),
  requestClientUpgrade: (clientId: string) =>
    request<UpgradeStatus>(`/version-management/clients/${clientId}/upgrade`, { method: 'POST' }),
  requestClientRollback: (clientId: string) =>
    request<UpgradeStatus>(`/version-management/clients/${clientId}/rollback`, { method: 'POST' }),
  cancelClientUpgrade: (clientId: string, requestId: string) =>
    request<UpgradeStatus>(`/version-management/clients/${clientId}/requests/${requestId}/cancel`, { method: 'POST' }),
}
