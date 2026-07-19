import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

const baseURL = process.env.BETTER_AUTH_URL

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins: [
    baseURL,
    'https://*.preview.emergentagent.com',
    'https://*.emergentagent.com',
  ].filter(Boolean) as string[],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } },
})
