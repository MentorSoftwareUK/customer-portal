import type { RouteRecordRaw } from 'vue-router'


import AppShell from './ui/AppShell.vue'
import AdminShell from './ui/AdminShell.vue'

const LoginPage = () => import('./pages/LoginPage.vue')
const DashboardPage = () => import('./pages/DashboardPage.vue')
const EventsListPage = () => import('./pages/EventsListPage.vue')
const EventDetailPage = () => import('./pages/EventDetailPage.vue')
const EventRegisterPage = () => import('./pages/EventRegisterPage.vue')
const MeetingsPage = () => import('./pages/MeetingsPage.vue')
const TicketsPage = () => import('./pages/TicketsPage.vue')
const OrgTicketsPage = () => import('./pages/OrgTicketsPage.vue')
const TicketDetailPage = () => import('./pages/TicketDetailPage.vue')
const KnowledgeBasePage = () => import('./pages/KnowledgeBasePage.vue')
const KnowledgeBaseArticlePage = () => import('./pages/KnowledgeBaseArticlePage.vue')
const VideoLibraryPage = () => import('./pages/VideoLibraryPage.vue')
const DocumentLibraryPage = () => import('./pages/DocumentLibraryPage.vue')
const InvoicesPage = () => import('./pages/InvoicesPage.vue')
const ProfilePage = () => import('./pages/ProfilePage.vue')
const OnboardingPage = () => import('./pages/OnboardingPage.vue')

const AdminEventsPage = () => import('./pages/admin/AdminEventsPage.vue')
const AdminEventDetailPage = () => import('./pages/admin/AdminEventDetailPage.vue')
const AdminReportsPage = () => import('./pages/admin/AdminReportsPage.vue')
const AdminEmailPage = () => import('./pages/admin/AdminEmailPage.vue')
const AdminContentPage = () => import('./pages/admin/AdminContentPage.vue')
const AdminUsersPage = () => import('./pages/admin/AdminUsersPage.vue')
const AdminSettingsPage = () => import('./pages/admin/AdminSettingsPage.vue')
const AdminNotificationsPage = () => import('./pages/admin/AdminNotificationsPage.vue')
const AdminLoginPage = () => import('./pages/admin/AdminLoginPage.vue')
const AdminHubspotAuditPage = () => import('./pages/admin/AdminHubspotAuditPage.vue')

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: LoginPage },
  { path: '/admin/login', component: AdminLoginPage },
  { path: '/logout', redirect: '/login' },

  {
    path: '/app',
    component: AppShell,
    children: [
      { path: '', redirect: '/app/dashboard' },
      { path: 'dashboard', component: DashboardPage },

      { path: 'events', component: EventsListPage },
      { path: 'events/:id', component: EventDetailPage },
      { path: 'events/:id/register', component: EventRegisterPage },

      { path: 'meetings', component: MeetingsPage },
      { path: 'tickets', component: TicketsPage },
      { path: 'tickets/org', component: OrgTicketsPage },
      { path: 'tickets/:id', component: TicketDetailPage },
      { path: 'knowledge-base', component: KnowledgeBasePage },
      { path: 'knowledge-base/article', component: KnowledgeBaseArticlePage },
      { path: 'videos', component: VideoLibraryPage },
      { path: 'documents', component: DocumentLibraryPage },
      { path: 'invoices', component: InvoicesPage },
      { path: 'profile', component: ProfilePage },
      { path: 'onboarding', component: OnboardingPage },
    ],
  },

  {
    path: '/admin',
    component: AdminShell,
    children: [
      { path: '', redirect: '/admin/events' },
      { path: 'events', component: AdminEventsPage },
      { path: 'events/:id', component: AdminEventDetailPage },
      { path: 'reports', component: AdminReportsPage },
      { path: 'email', component: AdminEmailPage },
      { path: 'content', component: AdminContentPage },
      { path: 'users', component: AdminUsersPage },
      { path: 'notifications', component: AdminNotificationsPage },
      { path: 'settings', component: AdminSettingsPage },
      { path: 'hubspot-audit', component: AdminHubspotAuditPage },
    ],
  },
]
