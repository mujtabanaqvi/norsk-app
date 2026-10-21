import fs from 'node:fs';
import path from 'node:path';
import {
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';

export const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.snakkly.app';
const APPLE_APP_ID = process.env.APPLE_APP_APPLE_ID ? Number(process.env.APPLE_APP_APPLE_ID) : undefined;

let rootCertificates: Buffer[] | null = null;

/** Apple root CAs (public, from apple.com/certificateauthority) used to validate the JWS certificate chain. */
function loadRootCertificates(): Buffer[] {
  if (!rootCertificates) {
    const dir = process.env.APPLE_ROOT_CERTS_DIR || path.join(process.cwd(), 'certs', 'apple');
    rootCertificates = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.cer'))
      .map((f) => fs.readFileSync(path.join(dir, f)));
  }
  return rootCertificates;
}

const verifiers = new Map<Environment, SignedDataVerifier>();

function getVerifier(environment: Environment): SignedDataVerifier {
  let verifier = verifiers.get(environment);
  if (!verifier) {
    // appAppleId is required by the library for production, and only known once the app exists in App Store Connect.
    verifier = new SignedDataVerifier(
      loadRootCertificates(),
      true,
      environment,
      APPLE_BUNDLE_ID,
      environment === Environment.PRODUCTION ? APPLE_APP_ID : undefined
    );
    verifiers.set(environment, verifier);
  }
  return verifier;
}

/**
 * Apple's recommended order: try production first, fall back to sandbox (TestFlight / sandbox testers).
 * Sandbox is rejected in production deployments unless APPLE_ALLOW_SANDBOX=true (needed for App Review).
 */
function candidateEnvironments(): Environment[] {
  const allowSandbox = process.env.NODE_ENV !== 'production' || process.env.APPLE_ALLOW_SANDBOX === 'true';
  const envs: Environment[] = [];
  if (APPLE_APP_ID) envs.push(Environment.PRODUCTION);
  if (allowSandbox) envs.push(Environment.SANDBOX, Environment.XCODE);
  return envs;
}

async function tryEnvironments<T>(fn: (verifier: SignedDataVerifier) => Promise<T>): Promise<T> {
  let lastError: unknown = new Error('No Apple verification environment configured');
  for (const env of candidateEnvironments()) {
    try {
      return await fn(getVerifier(env));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function verifyAppleTransaction(signedTransaction: string): Promise<JWSTransactionDecodedPayload> {
  return tryEnvironments((v) => v.verifyAndDecodeTransaction(signedTransaction));
}

export function verifyAppleRenewalInfo(signedRenewalInfo: string): Promise<JWSRenewalInfoDecodedPayload> {
  return tryEnvironments((v) => v.verifyAndDecodeRenewalInfo(signedRenewalInfo));
}

export function verifyAppleNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  return tryEnvironments((v) => v.verifyAndDecodeNotification(signedPayload));
}

export function appleEnvironmentLabel(env: string | undefined): 'sandbox' | 'production' {
  return env === Environment.PRODUCTION ? 'production' : 'sandbox';
}
