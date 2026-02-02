import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../auth/requireAuth'
import { env } from '../env'
import {
	canEditCompanyFromJobTitle,
	hubspotGetCompanyById,
	hubspotGetContactById,
	hubspotGetPrimaryCompanyIdForContact,
	hubspotListContactIdsForCompany,
	hubspotBatchReadContacts,
	hubspotBatchUpdateContacts,
	hubspotUpdateCompany,
	hubspotUpdateContact,
} from '../integrations/hubspot'

const UpdatePersonalSchema = z.object({
	firstName: z.string().trim().min(1).max(80).optional(),
	lastName: z.string().trim().min(1).max(80).optional(),
	phone: z.string().trim().max(50).optional(),
	jobTitle: z.string().trim().max(120).optional(),
})

const requiredPersonalFields = ['firstName', 'lastName', 'phone', 'jobTitle', 'email'] as const
type RequiredPersonalField = (typeof requiredPersonalFields)[number]

const UpdateCompanySchema = z.object({
	name: z.string().trim().min(1).max(255).optional(),
	domain: z.string().trim().max(255).optional(),
	phone: z.string().trim().max(50).optional(),
	address: z.string().trim().max(255).optional(),
	city: z.string().trim().max(128).optional(),
	zip: z.string().trim().max(30).optional(),
	country: z.string().trim().max(128).optional(),
})

type AuthContext = {
	email: string
	hubspotContactId: string | null
	jobTitle?: string | null
	canEditCompany?: boolean
}

function computeMissingPersonalFields(personal: { email: string; firstName: string; lastName: string; phone: string; jobTitle: string }) {
	return requiredPersonalFields.filter((key) => {
		const value = personal[key]
		return !value || value.trim().length === 0
	})
}

function buildFallbackProfile(auth: AuthContext) {
	const fallbackJobTitle = auth.jobTitle ?? ''
	const personal = {
		email: auth.email,
		firstName: 'Demo',
		lastName: 'User',
		phone: '',
		jobTitle: fallbackJobTitle,
	}

	return {
		personal: {
			...personal,
		},
		company: null,
		permissions: {
			canEditCompany: Boolean(auth.canEditCompany ?? canEditCompanyFromJobTitle(fallbackJobTitle)),
		},
		onboarding: {
			required: false,
			missingFields: [],
		},
	}
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
	app.addHook('preHandler', async (req, reply) => {
		const ok = await requireAuth(req, reply)
		if (!ok) return reply
	})

	app.get('/', async (req, reply) => {
		const auth = (req as any).auth as AuthContext

		if (!env.HUBSPOT_PRIVATE_APP_TOKEN || !auth.hubspotContactId) {
			return buildFallbackProfile(auth)
		}

		try {
			const contact = await hubspotGetContactById({
				id: auth.hubspotContactId,
				properties: ['email', 'firstname', 'lastname', 'phone', 'jobtitle'],
			})

			const canEditCompany = canEditCompanyFromJobTitle(contact.properties.jobtitle)

			const companyId = await hubspotGetPrimaryCompanyIdForContact(auth.hubspotContactId)
			const company = companyId
				? await hubspotGetCompanyById({
						id: companyId,
						properties: ['name', 'domain', 'phone', 'address', 'city', 'zip', 'country'],
					})
				: null

			const personal = {
				email: contact.properties.email ?? auth.email,
				firstName: contact.properties.firstname ?? '',
				lastName: contact.properties.lastname ?? '',
				phone: contact.properties.phone ?? '',
				jobTitle: contact.properties.jobtitle ?? '',
			}

			const missingFields = computeMissingPersonalFields(personal) as RequiredPersonalField[]
			const onboarding = {
				required: missingFields.length > 0,
				missingFields,
			}

			return {
				personal,
				company: company
					? {
							id: company.id,
							name: company.properties.name ?? '',
							domain: company.properties.domain ?? '',
							phone: company.properties.phone ?? '',
							address: company.properties.address ?? '',
							city: company.properties.city ?? '',
							zip: company.properties.zip ?? '',
							country: company.properties.country ?? '',
						}
					: null,
				permissions: {
					canEditCompany,
				},
				onboarding,
			}
		} catch (err) {
			req.log.error({ err }, 'HubSpot profile fetch failed, returning fallback profile')
			return buildFallbackProfile(auth)
		}
	})

	app.patch('/', async (req, reply) => {
		const auth = (req as any).auth as { email: string; hubspotContactId: string | null }

		if (!env.HUBSPOT_PRIVATE_APP_TOKEN || !auth.hubspotContactId) {
			return reply.status(501).send({
				error: 'not_configured',
				message: 'HubSpot is not configured; personal details cannot be updated in this environment.',
			})
		}

		const parsed = UpdatePersonalSchema.safeParse(req.body)
		if (!parsed.success) {
			return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
		}

		try {
			const props: Record<string, string | null> = {}
			if (parsed.data.firstName !== undefined) props.firstname = parsed.data.firstName
			if (parsed.data.lastName !== undefined) props.lastname = parsed.data.lastName
			if (parsed.data.phone !== undefined) props.phone = parsed.data.phone
			if (parsed.data.jobTitle !== undefined) props.jobtitle = parsed.data.jobTitle

			const updated = await hubspotUpdateContact({ id: auth.hubspotContactId, properties: props })

			const personal = {
				email: updated.properties.email ?? auth.email,
				firstName: updated.properties.firstname ?? '',
				lastName: updated.properties.lastname ?? '',
				phone: updated.properties.phone ?? '',
				jobTitle: updated.properties.jobtitle ?? '',
			}

			const missingFields = computeMissingPersonalFields(personal) as RequiredPersonalField[]

			return {
				personal,
				onboarding: {
					required: missingFields.length > 0,
					missingFields,
				},
			}
		} catch (err) {
			req.log.error({ err }, 'HubSpot personal update failed')
			return reply.status(503).send({
				error: 'hubspot_unavailable',
				message: 'Unable to reach HubSpot right now. Please try again shortly.',
			})
		}
	})

	app.patch('/company', async (req, reply) => {
		const auth = (req as any).auth as { hubspotContactId: string | null }

		if (!env.HUBSPOT_PRIVATE_APP_TOKEN || !auth.hubspotContactId) {
			return reply.status(501).send({
				error: 'not_configured',
				message: 'HubSpot is not configured; company details cannot be updated in this environment.',
			})
		}

		try {
			const contact = await hubspotGetContactById({
				id: auth.hubspotContactId,
				properties: ['jobtitle'],
			})
			const canEditCompany = canEditCompanyFromJobTitle(contact.properties.jobtitle)

			if (!canEditCompany) {
				return reply.status(403).send({
					error: 'forbidden',
					message: 'Company details are read-only for your account. Ask a director/senior contact to update these fields.',
				})
			}

			const parsed = UpdateCompanySchema.safeParse(req.body)
			if (!parsed.success) {
				return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
			}

			const companyId = await hubspotGetPrimaryCompanyIdForContact(auth.hubspotContactId)
			if (!companyId) {
				return reply.status(404).send({ error: 'not_found', message: 'No associated company found for this contact.' })
			}

			// Read the current company so we can do a safe "only update blanks / previous values" sync.
			const beforeCompany = await hubspotGetCompanyById({
				id: companyId,
				properties: ['name', 'domain', 'phone', 'address', 'city', 'zip', 'country'],
			})

			const props: Record<string, string | null> = {}
			if (parsed.data.name !== undefined) props.name = parsed.data.name
			if (parsed.data.domain !== undefined) props.domain = parsed.data.domain
			if (parsed.data.phone !== undefined) props.phone = parsed.data.phone
			if (parsed.data.address !== undefined) props.address = parsed.data.address
			if (parsed.data.city !== undefined) props.city = parsed.data.city
			if (parsed.data.zip !== undefined) props.zip = parsed.data.zip
			if (parsed.data.country !== undefined) props.country = parsed.data.country

			await hubspotUpdateCompany({ id: companyId, properties: props })

			const afterCompany = await hubspotGetCompanyById({
				id: companyId,
				properties: ['name', 'domain', 'phone', 'address', 'city', 'zip', 'country'],
			})

			// Data cleansing: propagate canonical company details to contacts in the same company.
			// We do NOT update contact company name fields (brief constraint), and we avoid overwriting
			// contact-entered data unless it's blank or equals the previous company value.
			const contactIds = await hubspotListContactIdsForCompany(companyId)
			const contactProps = ['address', 'city', 'zip', 'country', 'website']

			const chunkSize = 100
			let updatedContacts = 0
			for (let i = 0; i < contactIds.length; i += chunkSize) {
				const chunk = contactIds.slice(i, i + chunkSize)
				const contacts = await hubspotBatchReadContacts({ ids: chunk, properties: contactProps })

				const mapping: Array<{ companyProp: keyof typeof beforeCompany.properties; contactProp: string }> = [
					{ companyProp: 'address', contactProp: 'address' },
					{ companyProp: 'city', contactProp: 'city' },
					{ companyProp: 'zip', contactProp: 'zip' },
					{ companyProp: 'country', contactProp: 'country' },
					// HubSpot contact uses "website"; company uses "domain".
					{ companyProp: 'domain', contactProp: 'website' },
				]

				const updates: Array<{ id: string; properties: Record<string, string | null> }> = []

				for (const c of contacts) {
					const updateProps: Record<string, string | null> = {}

					for (const m of mapping) {
						const oldCompanyVal = (beforeCompany.properties[m.companyProp] ?? '').trim()
						const newCompanyVal = (afterCompany.properties[m.companyProp] ?? '').trim()
						if (!newCompanyVal) continue
						if (newCompanyVal === oldCompanyVal) continue

						const contactVal = (c.properties?.[m.contactProp] ?? '').trim()
						if (!contactVal || contactVal === oldCompanyVal) {
							updateProps[m.contactProp] = newCompanyVal
						}
					}

					if (Object.keys(updateProps).length > 0) {
						updates.push({ id: c.id, properties: updateProps })
					}
				}

				if (updates.length > 0) {
					const batches: Array<{ updates: Array<{ id: string; properties: Record<string, string | null> }> }> = []
					const batchSize = 100
					for (let i = 0; i < updates.length; i += batchSize) {
						batches.push({ updates: updates.slice(i, i + batchSize) })
					}

					for (const batch of batches) {
						await hubspotBatchUpdateContacts(batch)
					}

					updatedContacts += updates.length
				}
			}

			return {
				company: {
					id: companyId,
					name: afterCompany.properties.name ?? '',
					domain: afterCompany.properties.domain ?? '',
					phone: afterCompany.properties.phone ?? '',
					address: afterCompany.properties.address ?? '',
					city: afterCompany.properties.city ?? '',
					zip: afterCompany.properties.zip ?? '',
					country: afterCompany.properties.country ?? '',
				},
				sync: {
					totalCompanyContacts: contactIds.length,
					updatedContacts,
				},
			}
		} catch (err) {
			req.log.error({ err }, 'HubSpot company update failed')
			return reply.status(503).send({
				error: 'hubspot_unavailable',
				message: 'Unable to reach HubSpot right now. Please try again shortly.',
			})
		}
	})
}
