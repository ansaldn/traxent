import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { JwtRsaVerifier } from 'aws-jwt-verify';

const ssm = new SSMClient({ region: 'eu-west-2' });

// ── Auth0 JWT verifier ─────────────────────────────────────────────────────
// Same config as create-checkout. JWKS cached at module level so cold-start
// only happens once per Lambda container, not per request.
const verifier = JwtRsaVerifier.create({
  issuer: 'https://auth.traxent.io/',
  audience: 'https://auth.traxent.io/api/v2/',
  jwksUri: 'https://auth.traxent.io/.well-known/jwks.json',
});

async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
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
  return payload.sub;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Verify the caller. userId is derived from the verified token, not from the body —
  // a malicious payload claiming to be someone else cannot cancel that user's subscription.
  let userId;
  try {
    userId = await requireAuth(event);
  } catch (err) {
    return {
      statusCode: err.statusCode || 401,
      headers,
      body: JSON.stringify({ error: err.message || 'Unauthorized' })
    };
  }

  try {
    const secretKey = await getParam('/traxent/stripe/secret_key');
    const stripe = new Stripe(secretKey);

    const customers = await stripe.customers.search({
      query: `metadata['auth0_user_id']:'${userId}'`
    });
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
