import type { RouteRecordRaw } from 'vue-router'


import AppShell from './ui/AppShell.vue'
import AdminShell from './ui/AdminShell.vue'

import LoginPage from './pages/LoginPage.vue'
import DashboardPage from './pages/DashboardPage.vue'
import EventsListPage from './pages/EventsListPage.vue'
import EventDetailPage from './pages/EventDetailPage.vue'
import EventRegisterPage from './pages/EventRegisterPage.vue'
import MeetingsPage from './pages/MeetingsPage.vue'
import TicketsPage from './pages/TicketsPage.vue'
import TicketDetailPage from './pages/TicketDetailPage.vue'
import KnowledgeBasePage from './pages/KnowledgeBasePage.vue'
import KnowledgeBaseArticlePage from './pages/KnowledgeBaseArticlePage.vue'
import VideoLibraryPage from './pages/VideoLibraryPage.vue'
import DocumentLibraryPage from './pages/DocumentLibraryPage.vue'
import InvoicesPage from './pages/InvoicesPage.vue'
import ProfilePage from './pages/ProfilePage.vue'
import OnboardingPage from './pages/OnboardingPage.vue'

import AdminEventsPage from './pages/admin/AdminEventsPage.vue'
import AdminEventDetailPage from './pages/admin/AdminEventDetailPage.vue'
import AdminReportsPage from './pages/admin/AdminReportsPage.vue'
import AdminEmailPage from './pages/admin/AdminEmailPage.vue'
import AdminContentPage from './pages/admin/AdminContentPage.vue'
import AdminUsersPage from './pages/admin/AdminUsersPage.vue'
import AdminSettingsPage from './pages/admin/AdminSettingsPage.vue'
import AdminLoginPage from './pages/admin/AdminLoginPage.vue'

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
      { path: 'settings', component: AdminSettingsPage },
    ],
  },
]
