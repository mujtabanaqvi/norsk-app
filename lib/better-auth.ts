import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/src/db';
import * as schema from '@/src/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Sign-in is refused until the address is verified (code/link flow in lib/email-verification.ts).
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || 'placeholder-google-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder-google-client-secret',
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'USER',
      },
      subscriptionTier: {
        type: 'string',
        required: false,
        defaultValue: 'FREE',
      },
      referralCode: {
        type: 'string',
        required: false,
      },
      referredByUserId: {
        type: 'string',
        required: false,
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || 'norsk-app-better-auth-secret-key-development',
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
});

