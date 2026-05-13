import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
const ssm = new SSMClient({ region: 'eu-west-2' });
async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}
export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://traxent.io',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const { userId } = JSON.parse(event.body);
    if (!userId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing userId' }) };
    const secretKey = await getParam('/traxent/stripe/secret_key');
    const stripe = new Stripe(secretKey);
    const customers = await stripe.customers.search({ query: `metadata['auth0_user_id']:'${userId}'` });
    if (!customers.data.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No customer found' }) };
    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
    if (!subscriptions.data.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No active subscription' }) };
    const subscription = subscriptions.data[0];
    await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, cancelAt: subscription.current_period_end }) };
  } catch (err) {
    console.error('Cancel error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to cancel subscription' }) };
  }
};
