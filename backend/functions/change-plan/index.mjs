// ── Traxent change-plan Lambda ──────────────────────────────────────────────
// POST /change-plan  — upgrade or downgrade an EXISTING subscription in place,
// with Stripe's native proration (charges only the difference / credits the rest).
// This is the right tool for plan changes; create-checkout is only for brand-new
// subscribers (a new checkout would start a 2nd subscription and bill full price).
//
// Flow: verify the caller's Auth0 ID token → find their Stripe customer + active
// subscription → swap the subscription item to the target plan's price.
//   • Upgrade   → proration_behavior 'always_invoice'  (charge the difference now)
//   • Downgrade → proration_behavior 'create_prorations' (credit applied next cycle)
// The plan ROLE flip is handled automatically by the existing stripe-webhook on the
// resulting `customer.subscription.updated` event — we don't touch Auth0 here.
//
// SSM params: /traxent/stripe/secret_key, /traxent/stripe/price_{observer,challenger,funded_ready}

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { JwtRsaVerifier } from 'aws-jwt-verify';

const ssm = new SSMClient({ region: 'eu-west-2' });

// The frontend sends the Auth0 *ID token* (aud = SPA / iOS client IDs), same as
// create-checkout / cancel-subscription.
const AUDIENCES = (process.env.AUTH0_AUDIENCE
  || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz,YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK')
  .split(',').map(s => s.trim()).filter(Boolean);

const verifier = JwtRsaVerifier.create({
  issuer: 'https://auth.traxent.io/',
  audience: AUDIENCES,
  jwksUri: 'https://auth.traxent.io/.well-known/jwks.json',
});

const PLAN_ORDER = ['observer', 'challenger', 'funded_ready'];

async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}

// Defence-in-depth: reject identifier values that could break a Stripe search query.
function safeQueryValue(v) {
  return typeof v === 'string' && !/['"\\\n\r]/.test(v) ? v : null;
}

const headers = {
  'Access-Control-Allow-Origin': 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

async function requireAuth(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) { const e = new Error('Missing Authorization header'); e.statusCode = 401; throw e; }
  let payload;
  try { payload = await verifier.verify(token); }
  catch (e) { console.error('JWT verify failed:', e.message); const err = new Error('Invalid token'); err.statusCode = 401; throw err; }
  if (!payload.sub) { const e = new Error('Token missing sub claim'); e.statusCode = 401; throw e; }
  return { sub: payload.sub, email: payload.email };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // The caller's identity comes from the verified token, never the body.
  let userId, email;
  try { const a = await requireAuth(event); userId = a.sub; email = a.email; }
  catch (err) { return { statusCode: err.statusCode || 401, headers, body: JSON.stringify({ error: err.message || 'Unauthorized' }) }; }

  try {
    const { plan } = JSON.parse(event.body || '{}');
    if (!PLAN_ORDER.includes(plan)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
    }

    const [secretKey, priceObserver, priceChallenger, priceFundedReady] = await Promise.all([
      getParam(process.env.STRIPE_KEY_PARAM || '/traxent/stripe/secret_key'),
      getParam('/traxent/stripe/price_observer'),
      getParam('/traxent/stripe/price_challenger'),
      getParam('/traxent/stripe/price_funded_ready'),
    ]);
    const stripe = new Stripe(secretKey);
    const PRICE_BY_PLAN = { observer: priceObserver, challenger: priceChallenger, funded_ready: priceFundedReady };
    const PLAN_BY_PRICE = { [priceObserver]: 'observer', [priceChallenger]: 'challenger', [priceFundedReady]: 'funded_ready' };
    const targetPrice = PRICE_BY_PLAN[plan];

    // Locate the Stripe customer (same fallbacks as cancel-subscription).
    let customers = await stripe.customers.search({ query: `metadata['auth0_user_id']:'${userId}'` });
    if (!customers.data.length) customers = await stripe.customers.search({ query: `metadata['auth0_sub']:'${userId}'` });
    const safeEmail = safeQueryValue(email);
    if (!customers.data.length && safeEmail) customers = await stripe.customers.search({ query: `email:'${safeEmail}'` });
    if (!customers.data.length) {
      // No customer → they've never subscribed. Frontend should send them to checkout.
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'no-subscription', message: 'No subscription found — use checkout to subscribe.' }) };
    }

    const customerId = customers.data[0].id;
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
    if (!subs.data.length) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'no-subscription', message: 'No active subscription — use checkout to subscribe.' }) };
    }

    const sub = subs.data[0];
    const item = sub.items.data[0];
    const currentPlan = PLAN_BY_PRICE[item.price.id] || null;

    if (currentPlan === plan) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, unchanged: true, plan }) };
    }

    // Upgrade charges the prorated difference now; downgrade credits the unused
    // portion toward the next invoice (no immediate refund).
    const isUpgrade = PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(currentPlan ?? 'observer');
    const proration_behavior = isUpgrade ? 'always_invoice' : 'create_prorations';

    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: targetPrice }],
      proration_behavior,
      cancel_at_period_end: false,
      // Keep identity on the subscription so the webhook can map the change.
      metadata: { ...(sub.metadata || {}), auth0_user_id: userId, plan },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        plan,
        previousPlan: currentPlan,
        direction: isUpgrade ? 'upgrade' : 'downgrade',
        proration: proration_behavior,
      }),
    };
  } catch (err) {
    console.error('change-plan error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to change plan' }) };
  }
};
