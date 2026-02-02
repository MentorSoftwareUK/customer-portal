// Usage:
//   node scripts/test-auth.mjs lookup you@company.com
//   node scripts/test-auth.mjs start you@company.com
//   node scripts/test-auth.mjs verify you@company.com 123456
//   node scripts/test-auth.mjs login you@company.com "Password123"
//
// Defaults to http://localhost:3001 unless API_BASE_URL is set.

const baseUrl = process.env.API_BASE_URL?.trim() || 'http://localhost:3001'

function usage() {
  console.log(`\nUsage:\n  node scripts/test-auth.mjs <lookup|start|verify|login> <email> [codeOrPassword]\n\nEnv:\n  API_BASE_URL=${baseUrl}\n`)
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // ignore
  }

  return { ok: res.ok, status: res.status, text, json }
}

const [cmd, email, arg] = process.argv.slice(2)
if (!cmd || !email) {
  usage()
  process.exit(1)
}

let result
if (cmd === 'lookup') {
  result = await post('/auth/lookup', { email })
} else if (cmd === 'start') {
  result = await post('/auth/start', { email })
} else if (cmd === 'verify') {
  if (!arg) {
    usage()
    process.exit(1)
  }
  result = await post('/auth/verify', { email, code: arg })
} else if (cmd === 'login') {
  if (!arg) {
    usage()
    process.exit(1)
  }
  result = await post('/auth/login', { email, password: arg })
} else {
  usage()
  process.exit(1)
}

if (result.json) {
  console.log(JSON.stringify(result.json, null, 2))
} else {
  console.log(result.text)
}

if (!result.ok) {
  process.exitCode = 1
}
