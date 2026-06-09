import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { JwtRsaVerifier } from 'aws-jwt-verify';

const ssm = new SSMClient({ region: 'eu-west-2' });

// ── Auth0 JWT verifier ─────────────────────────────────────────────────────
// Instantiated once at module load. JWKS keys are fetched on first verify()
// call and cached for ~10 minutes — subsequent invocations are fast.
//
// Issuer/audience must match the Auth0 SPA SDK config in src/auth.js:
//   domain: 'auth.traxent.io'
//   audience: 'https://auth.traxent.io/api/v2/'
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
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

// Extract + verify the Authorization: Bearer <token> header.
// Returns the verified user's Auth0 sub claim.
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

  // Verify the caller. userId now comes from the token, NOT the body —
  // a forged userId in the body is ignored.
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
    const [secretKey, priceObserver, priceChallenger, priceFundedReady] = await Promise.all([
      getParam('/traxent/stripe/secret_key'),
      getParam('/traxent/stripe/price_observer'),
      getParam('/traxent/stripe/price_challenger'),
      getParam('/traxent/stripe/price_funded_ready'),
    ]);
    const stripe = new Stripe(secretKey);
    const PRICE_IDS = { observer: priceObserver, challenger: priceChallenger, funded_ready: priceFundedReady };

    const { plan, userEmail } = JSON.parse(event.body || '{}');
    if (!PRICE_IDS[plan]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: 'https://traxent.io/dashboard.html?upgraded=true',
      cancel_url: 'https://traxent.io/dashboard.html',
      customer_email: userEmail,
      metadata: { auth0_user_id: userId, plan },
      subscription_data: { metadata: { auth0_user_id: userId, plan } }
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('Checkout error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create checkout session' }) };
  }
};
