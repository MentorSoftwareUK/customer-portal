import { buildServer } from './server'
import { env } from './env'

async function main() {
	const app = await buildServer()
	// Bind to all interfaces (IPv4/IPv6) so ::1/127.0.0.1 both work without browser failures.
	await app.listen({ port: env.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
