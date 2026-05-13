import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
const ssm = new SSMClient({ region: 'eu-west-2' });
async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}
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
      getParam('/traxent/stripe/secret_key'),
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
        break;
      }
      case 'customer.subscription.updated': {
        const s = stripeEvent.data.object;
        if (!s.metadata?.auth0_user_id) break;
        const plan = PRICE_TO_PLAN[s.items.data[0]?.price.id];
        if (!plan || s.status !== 'active') break;
        await removeAllPlanRoles(token, auth0Domain, s.metadata.auth0_user_id, roleIds);
        await assignRole(token, auth0Domain, s.metadata.auth0_user_id, roleIds[plan]);
        break;
      }
      case 'customer.subscription.deleted': {
        const s = stripeEvent.data.object;
        if (!s.metadata?.auth0_user_id) break;
        await removeAllPlanRoles(token, auth0Domain, s.metadata.auth0_user_id, roleIds);
        break;
      }
    }
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: `Processing error: ${err.message}` };
  }
};
