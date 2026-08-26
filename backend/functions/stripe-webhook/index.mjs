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
const VALID_PLANS = ['observer', 'challenger', 'funded_ready'];

// Every Management API call is now checked (WB-012). fetch only rejects on a
// network error — a 429/403/5xx resolves normally — so an unchecked call fails
// SILENTLY, leaving a paid user on `free` or holding two plan roles while the
// handler still returns 200 (Stripe never retries). Throwing here bubbles to
// the top-level catch → 500 → Stripe redelivers.
async function getRoleIds(token, domain) {
  const res = await fetch(`https://${domain}/api/v2/roles?per_page=50`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Auth0 roles fetch failed: ${res.status}`);
  const roles = await res.json();
  return { observer: roles.find(r => r.name === 'observer')?.id, challenger: roles.find(r => r.name === 'challenger')?.id, funded_ready: roles.find(r => r.name === 'funded_ready')?.id };
}
async function removeAllPlanRoles(token, domain, userId, roleIds) {
  const ids = Object.values(roleIds).filter(Boolean);
  if (!ids.length) return;
  const res = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ roles: ids }) });
  // 204 = removed; DELETE of a role the user doesn't have is still 204.
  if (!res.ok) throw new Error(`Auth0 role removal failed for ${userId}: ${res.status}`);
}
async function assignRole(token, domain, userId, plan, roleIds) {
  // Validate the plan string BEFORE touching roles — an unknown plan used to
  // post {"roles":[null]} AFTER removal had already run, leaving the user on
  // free (WB-012). Guard first so removal+assign stay atomic in intent.
  if (!VALID_PLANS.includes(plan)) throw new Error(`Unknown plan '${plan}' — refusing to assign roles`);
  const roleId = roleIds[plan];
  if (!roleId) throw new Error(`No Auth0 role id for plan '${plan}'`);
  const res = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ roles: [roleId] }) });
  if (!res.ok) throw new Error(`Auth0 role assign failed for ${userId} (${plan}): ${res.status}`);
}
// Downgrade = remove every plan role, leaving the user on the implicit `free`.
async function downgradeToFree(token, domain, userId, roleIds) {
  await removeAllPlanRoles(token, domain, userId, roleIds);
}

// Mirror the plan into the user-data table's PROFILE row. The weekly
// readiness digest builds its send list from PROFILE rows, and GET /user
// surfaces it as `profile` — keep it current the moment billing changes,
// without waiting for the user's next login. Never throws.
const USER_DATA_TABLE = process.env.USER_DATA_TABLE || 'TraxentUserData';
async function upsertProfile(auth0UserId, plan, email) {
  try {
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
    await ddb.send(new PutCommand({
      TableName: USER_DATA_TABLE,
      Item: {
        userId: auth0UserId, sk: 'PROFILE',
        plan, email: email || null, updatedAt: new Date().toISOString(),
      },
    }));
  } catch (e) { console.error('profile mirror (non-fatal):', e.message); }
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

    // ── Idempotency guard ───────────────────────────────────────────────────
    // Stripe retries deliveries and can send the same event more than once.
    // Conditional-put the event id; if it already exists we've processed this
    // exact event before → acknowledge 200 and do nothing (role changes, emails
    // and marketing syncs must not run twice). Fail-open: a dedup-table problem
    // must never block real event processing. TTL clears rows after 3 days
    // (Stripe's maximum retry window).
    const DEDUP_TABLE = process.env.WEBHOOK_DEDUP_TABLE;
    if (DEDUP_TABLE) {
      try {
        const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
        await ddb.send(new PutCommand({
          TableName: DEDUP_TABLE,
          Item: {
            eventId: stripeEvent.id,
            type: stripeEvent.type,
            receivedAt: new Date().toISOString(),
            expiresAt: Math.floor(Date.now() / 1000) + 3 * 24 * 3600,
          },
          ConditionExpression: 'attribute_not_exists(eventId)',
        }));
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException') {
          console.log('duplicate webhook delivery ignored:', stripeEvent.id, stripeEvent.type);
          return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
        }
        console.error('dedup guard (non-fatal, continuing):', e.message);
      }
    }
    const token = await getAuth0Token(auth0Domain, m2mClientId, m2mClientSecret);
    const roleIds = await getRoleIds(token, auth0Domain);
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const s = stripeEvent.data.object;
        if (!s.metadata?.auth0_user_id || !s.metadata?.plan) break;
        await removeAllPlanRoles(token, auth0Domain, s.metadata.auth0_user_id, roleIds);
        await assignRole(token, auth0Domain, s.metadata.auth0_user_id, s.metadata.plan, roleIds);
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
        await upsertProfile(s.metadata.auth0_user_id, s.metadata.plan, s.customer_details?.email || s.customer_email);
        break;
      }
      case 'customer.subscription.updated': {
        const s = stripeEvent.data.object;
        if (!s.metadata?.auth0_user_id) break;
        const userId = s.metadata.auth0_user_id;
        const plan = PRICE_TO_PLAN[s.items.data[0]?.price.id];
        // Entitlement is driven by STATUS, not just the active case (WB-001).
        // Previously any non-active status was ignored, so a past_due / unpaid /
        // canceled subscriber silently kept their paid role forever.
        const ENTITLED = ['active', 'trialing'];    // has access
        const REVOKED = ['canceled', 'unpaid', 'incomplete_expired', 'paused']; // lose access
        let email = null;
        try { email = (await stripe.customers.retrieve(s.customer))?.email || null; } catch {}

        if (ENTITLED.includes(s.status) && plan) {
          await removeAllPlanRoles(token, auth0Domain, userId, roleIds);
          await assignRole(token, auth0Domain, userId, plan, roleIds);
          try {
            if (email) await upsertSubscriber(ddb, SUBSCRIBERS_TABLE, { email, plan: PLAN_LABELS[plan] || plan, source: 'stripe-subscription-updated' });
          } catch (e) { console.error('plan sync (non-fatal):', e.message); }
          await upsertProfile(userId, plan, email);
        } else if (REVOKED.includes(s.status)) {
          await downgradeToFree(token, auth0Domain, userId, roleIds);
          try {
            if (email) await upsertSubscriber(ddb, SUBSCRIBERS_TABLE, { email, plan: 'free', source: 'stripe-subscription-' + s.status });
          } catch (e) { console.error('plan sync (non-fatal):', e.message); }
          await upsertProfile(userId, 'free', email);
        }
        // 'past_due' is deliberately left in a GRACE state: keep access while
        // Stripe's dunning retries. The terminal transition (canceled/unpaid)
        // or a final invoice.payment_failed will revoke.
        break;
      }
      case 'invoice.payment_failed': {
        // A charge failed (expired card, insufficient funds, 3DS abandoned).
        // While Stripe still plans a retry (next_payment_attempt set) we stay in
        // grace. On the FINAL failure Stripe stops retrying → revoke access so a
        // non-paying subscriber can't keep paid features indefinitely (WB-001).
        const inv = stripeEvent.data.object;
        let subId = inv.subscription;
        if (!subId) break;
        let sub = null;
        try { sub = await stripe.subscriptions.retrieve(subId); } catch (e) { console.error('sub retrieve (payment_failed):', e.message); }
        const userId = sub?.metadata?.auth0_user_id;
        if (!userId) break;
        const finalAttempt = !inv.next_payment_attempt;
        if (finalAttempt) {
          await downgradeToFree(token, auth0Domain, userId, roleIds);
          let email = inv.customer_email || null;
          if (!email) { try { email = (await stripe.customers.retrieve(inv.customer))?.email || null; } catch {} }
          await upsertProfile(userId, 'free', email);
          console.log('final payment failure — downgraded to free:', userId);
        } else {
          console.log('payment failed, retry scheduled — grace period:', userId, 'next:', inv.next_payment_attempt);
        }
        break;
      }
      case 'customer.subscription.trial_will_end': {
        // Heads-up point before the first real charge (WB-001). The event is now
        // handled (no longer silently dropped) and logged for visibility; wiring
        // a branded "your trial ends in 3 days" email via Resend is the next
        // step once a template exists. Never throws, never affects entitlement.
        const s = stripeEvent.data.object;
        try {
          const email = (await stripe.customers.retrieve(s.customer))?.email || null;
          console.log('trial_will_end:', s.metadata?.auth0_user_id, email, 'trial_end:', s.trial_end);
          // TODO: sendTrialEndingEmail(resendKey, email) when the template ships.
        } catch (e) { console.error('trial_will_end (non-fatal):', e.message); }
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
        {
          let email = null;
          try { email = (await stripe.customers.retrieve(s.customer))?.email || null; } catch {}
          await upsertProfile(s.metadata.auth0_user_id, 'free', email);
        }
        break;
      }
    }
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: `Processing error: ${err.message}` };
  }
};
