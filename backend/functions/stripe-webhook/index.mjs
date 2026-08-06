import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import Stripe from 'stripe';
import { sendWelcomeEmail } from './email.mjs';
import { upsertSubscriber, BASIS } from './marketing.mjs';
const ssm = new SSMClient({ region: 'eu-west-2' });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-2' }), {
  marshallOptions: { removeUndefinedValues: true },
});
const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE || 'TraxentSubscribers';

// Wording shown at checkout. Soft opt-in under UK PECR reg 22(3) is only valid
// if the customer was given a simple way to refuse AT THE POINT OF SALE, not
// just later — so this string must actually appear on the checkout page, and
// must be updated here in step if the copy changes.
const CHECKOUT_MARKETING_NOTICE =
  'We\'ll email you about Traxent features and offers. You can turn this off any time from your account page.';

const PLAN_LABELS = { observer: 'Observer', challenger: 'Challenger', funded_ready: 'Funded Trader' };

// Add the customer to the marketing list under soft opt-in. Never throws —
// a marketing-list problem must never break plan provisioning.
async function syncCustomerToMarketing(session, plan) {
  try {
    const email = session.customer_details?.email || session.customer_email;
    if (!email) return;
    const result = await upsertSubscriber(ddb, SUBSCRIBERS_TABLE, {
      email,
      consentBasis: BASIS.SOFT_OPT_IN,
      plan: PLAN_LABELS[plan] || plan || 'unknown',
      name: session.customer_details?.name || undefined,
      source: 'stripe-checkout',
      consentText: CHECKOUT_MARKETING_NOTICE,
      consentVersion: '2026-08-06',
    });
    console.log('marketing sync:', email, '→', result);
  } catch (e) {
    console.error('marketing sync (non-fatal):', e.message);
  }
}
async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}
async function getParamSafe(name) { try { return await getParam(name); } catch { return null; } }
async function getAuth0Token(domain, clientId, clientSecret) {
  const res = await fetch(`https://${domain}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, audience: `https://${domain}/api/v2/`, grant_type: 'client_credentials' }) });
  return (await res.json()).access_token;
}
async function getRoleIds(token, domain) {
  const res = await fetch(`https://${domain}/api/v2/roles?per_page=50`, { headers: { Authorization: `Bearer ${token}` } });
  const roles = await res.json();
  return { observer: roles.find(r => r.name === 'observer')?.id, challenger: roles.find(r => r.name === 'challenger')?.id, funded_ready: roles.find(r => r.name === 'funded_ready')?.id };
}
async function removeAllPlanRoles(token, domain, userId, roleIds) {
  const ids = Object.values(roleIds).filter(Boolean);
  if (!ids.length) return;
  await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ roles: ids }) });
}
async function assignRole(token, domain, userId, roleId) {
  await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ roles: [roleId] }) });
}
export const handler = async (event) => {
  try {
    const [secretKey, webhookSecret, auth0Domain, m2mClientId, m2mClientSecret, priceObserver, priceChallenger, priceFundedReady] = await Promise.all([
      getParam(process.env.STRIPE_KEY_PARAM || '/traxent/stripe/secret_key'),
      getParam('/traxent/stripe/webhook_secret'),
      getParam('/traxent/auth0/domain'),
      getParam('/traxent/auth0/m2m_client_id'),
      getParam('/traxent/auth0/m2m_client_secret'),
      getParam('/traxent/stripe/price_observer'),
      getParam('/traxent/stripe/price_challenger'),
      getParam('/traxent/stripe/price_funded_ready'),
    ]);
    const stripe = new Stripe(secretKey);
    const PRICE_TO_PLAN = { [priceObserver]: 'observer', [priceChallenger]: 'challenger', [priceFundedReady]: 'funded_ready' };
    const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    if (!sig) return { statusCode: 400, body: 'No stripe-signature header' };
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    let stripeEvent;
    try { stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret); }
    catch (err) { return { statusCode: 400, body: `Webhook Error: ${err.message}` }; }
    const token = await getAuth0Token(auth0Domain, m2mClientId, m2mClientSecret);
    const roleIds = await getRoleIds(token, auth0Domain);
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const s = stripeEvent.data.object;
        if (!s.metadata?.auth0_user_id || !s.metadata?.plan) break;
        await removeAllPlanRoles(token, auth0Domain, s.metadata.auth0_user_id, roleIds);
        await assignRole(token, auth0Domain, s.metadata.auth0_user_id, roleIds[s.metadata.plan]);
        // Best-effort branded welcome email via Resend. Fully guarded: a missing key
        // or any failure is swallowed so it can NEVER block or break plan provisioning.
        try {
          const resendKey = await getParamSafe('/traxent/resend/api_key');
          const toEmail = s.customer_details?.email || s.customer_email;
          if (resendKey && toEmail) await sendWelcomeEmail(resendKey, toEmail, s.metadata.plan);
        } catch (e) { console.error('welcome email (non-fatal):', e.message); }
        // Soft opt-in: a paying customer goes on the marketing list, recorded
        // under a WEAKER basis than waitlist consent. They can switch it off on
        // /account, which is the refusal route PECR requires.
        await syncCustomerToMarketing(s, s.metadata.plan);
        break;
      }
      case 'customer.subscription.updated': {
        const s = stripeEvent.data.object;
        if (!s.metadata?.auth0_user_id) break;
        const plan = PRICE_TO_PLAN[s.items.data[0]?.price.id];
        if (!plan || s.status !== 'active') break;
        await removeAllPlanRoles(token, auth0Domain, s.metadata.auth0_user_id, roleIds);
        await assignRole(token, auth0Domain, s.metadata.auth0_user_id, roleIds[plan]);
        // Keep the `plan` contact property current so broadcasts can segment on
        // tier. This only updates an existing row — it never adds anyone.
        try {
          const cust = await stripe.customers.retrieve(s.customer);
          if (cust?.email) {
            await upsertSubscriber(ddb, SUBSCRIBERS_TABLE, {
              email: cust.email, plan: PLAN_LABELS[plan] || plan, source: 'stripe-subscription-updated',
            });
          }
        } catch (e) { console.error('plan sync (non-fatal):', e.message); }
        break;
      }
      case 'customer.subscription.deleted': {
        const s = stripeEvent.data.object;
        if (!s.metadata?.auth0_user_id) break;
        await removeAllPlanRoles(token, auth0Domain, s.metadata.auth0_user_id, roleIds);
        // Cancelling a subscription is NOT an unsubscribe — they may still want
        // the emails. Downgrade the plan property and leave status alone.
        try {
          const cust = await stripe.customers.retrieve(s.customer);
          if (cust?.email) {
            await upsertSubscriber(ddb, SUBSCRIBERS_TABLE, {
              email: cust.email, plan: 'free', source: 'stripe-subscription-deleted',
            });
          }
        } catch (e) { console.error('plan sync (non-fatal):', e.message); }
        break;
      }
    }
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: `Processing error: ${err.message}` };
  }
};
