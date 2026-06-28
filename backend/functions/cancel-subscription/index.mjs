import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { JwtRsaVerifier } from 'aws-jwt-verify';

const ssm = new SSMClient({ region: 'eu-west-2' });

// ── Auth0 JWT verifier ─────────────────────────────────────────────────────
// Same config as create-checkout. JWKS cached at module level so cold-start
// only happens once per Lambda container, not per request.
//
// The frontend (src/auth.js) sends the Auth0 *ID token* as the bearer token,
// so `aud` is the SPA Client ID — NOT the Management API audience. Verifying
// against the old `https://auth.traxent.io/api/v2/` value rejected every call
// with 401, which is why cancel/checkout silently failed.
// Accept ID tokens from BOTH the web SPA and the iOS native app. Override with
// the AUTH0_AUDIENCE env var (comma-separated) if a client ID ever changes.
const AUDIENCES = (process.env.AUTH0_AUDIENCE
  || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz,YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK')
  .split(',').map(s => s.trim()).filter(Boolean);

const verifier = JwtRsaVerifier.create({
  issuer: 'https://auth.traxent.io/',
  audience: AUDIENCES, // web SPA + iOS native client IDs (ID token aud)
  jwksUri: 'https://auth.traxent.io/.well-known/jwks.json',
});

async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}

// Reject identifier values that could break out of a Stripe search-query string
// (defence-in-depth: e.g. an email containing a quote). Returns the value if safe, else null.
function safeQueryValue(v) {
  return typeof v === 'string' && !/['"\\\n\r]/.test(v) ? v : null;
}

const headers = {
  'Access-Control-Allow-Origin': 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

async function requireAuth(event) {
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    const err = new Error('Missing Authorization header');
    err.statusCode = 401;
    throw err;
  }
  let payload;
  try {
    payload = await verifier.verify(token);
  } catch (e) {
    console.error('JWT verify failed:', e.message);
    const err = new Error('Invalid token');
    err.statusCode = 401;
    throw err;
  }
  if (!payload.sub) {
    const err = new Error('Token missing sub claim');
    err.statusCode = 401;
    throw err;
  }
  return { sub: payload.sub, email: payload.email };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Verify the caller. userId is derived from the verified token, not from the body —
  // a malicious payload claiming to be someone else cannot cancel that user's subscription.
  let userId, email;
  try {
    const auth = await requireAuth(event);
    userId = auth.sub;
    email = auth.email;
  } catch (err) {
    return {
      statusCode: err.statusCode || 401,
      headers,
      body: JSON.stringify({ error: err.message || 'Unauthorized' })
    };
  }

  try {
    const secretKey = await getParam(process.env.STRIPE_KEY_PARAM || '/traxent/stripe/secret_key');
    const stripe = new Stripe(secretKey);

    // Find the customer. New checkouts stamp auth0_user_id + auth0_sub on the
    // customer object; customers created before that fix have neither, so we
    // fall back to an email match. If nothing matches, there is genuinely no
    // Stripe customer in this account/mode (e.g. the plan was granted manually
    // in Auth0, or the subscription lives in Stripe TEST mode while this key is LIVE).
    let customers = await stripe.customers.search({ query: `metadata['auth0_user_id']:'${userId}'` });
    if (!customers.data.length) {
      customers = await stripe.customers.search({ query: `metadata['auth0_sub']:'${userId}'` });
    }
    const safeEmail = safeQueryValue(email);
    if (!customers.data.length && safeEmail) {
      customers = await stripe.customers.search({ query: `email:'${safeEmail}'` });
    }
    if (!customers.data.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No customer found' }) };
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1
    });
    if (!subscriptions.data.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No active subscription' }) };
    }

    const subscription = subscriptions.data[0];
    await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, cancelAt: subscription.current_period_end })
    };
  } catch (err) {
    console.error('Cancel error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to cancel subscription' }) };
  }
};
