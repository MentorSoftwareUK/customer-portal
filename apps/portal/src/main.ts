import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import 'flowbite'

import { routes } from './router'
import {
	clearAllTokens,
	clearAdminAccessToken,
	clearUserAccessToken,
	decodeJwtPayload,
	getAdminAccessToken,
	getUserAccessToken,
	isTokenExpired,
} from './lib/auth'

const router = createRouter({
	history: createWebHistory(),
	routes,
})

function tokenIsAdmin(token: string | null): boolean {
	if (!token) return false
	if (isTokenExpired(token)) return false
	const payload = decodeJwtPayload(token)
	const isAdmin = payload?.isAdmin
	return isAdmin === true
}

router.beforeEach(async (to) => {
	if (to.path === '/logout') {
		clearAllTokens()
		return true
	}

	if (to.path === '/login') {
		const token = getUserAccessToken()
		if (token && isTokenExpired(token)) {
			clearUserAccessToken()
			return true
		}
		if (token) return { path: '/app/dashboard' }
		return true
	}

	if (to.path === '/admin/login') {
		const token = getAdminAccessToken()
		if (token && isTokenExpired(token)) {
			clearAdminAccessToken()
			return true
		}
		if (token) return { path: '/admin/events' }
		return true
	}

	// Allow public access to root redirect.
	if (to.path === '/') return true

	// Basic auth gating for app/admin areas.
	if (to.path.startsWith('/app') || to.path.startsWith('/admin')) {
		if (to.path.startsWith('/app')) {
			const token = getUserAccessToken()
			if (token && isTokenExpired(token)) {
				clearUserAccessToken()
				return { path: '/login' }
			}
			if (!token) {
				return { path: '/login' }
			}
		}

		if (to.path.startsWith('/admin')) {
			const token = getAdminAccessToken()
			if (token && isTokenExpired(token)) {
				clearAdminAccessToken()
				return { path: '/admin/login' }
			}
			if (!token) {
				return { path: '/admin/login' }
			}
		}
	}

	const adminToken = getAdminAccessToken()
	if (adminToken && isTokenExpired(adminToken)) {
		clearAdminAccessToken()
	}
	const isAdmin = tokenIsAdmin(adminToken)

	if (to.path.startsWith('/admin')) {
		if (!isAdmin) return { path: '/app/dashboard' }
	}

	// If the user is admin and heading to /app, send them to admin home immediately
	// only when they don't already have a user token.
	if (to.path.startsWith('/app')) {
		const userToken = getUserAccessToken()
		if (!userToken && isAdmin) return { path: '/admin/events' }
	}

	return true
})

createApp(App).use(router).mount('#app')
