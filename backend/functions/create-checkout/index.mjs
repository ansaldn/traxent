import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
const ssm = new SSMClient({ region: 'eu-west-2' });
async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}
const headers = { 'Access-Control-Allow-Origin': 'https://traxent.io', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const [secretKey, priceObserver, priceChallenger, priceFundedReady] = await Promise.all([
      getParam('/traxent/stripe/secret_key'),
      getParam('/traxent/stripe/price_observer'),
      getParam('/traxent/stripe/price_challenger'),
      getParam('/traxent/stripe/price_funded_ready'),
    ]);
    const stripe = new Stripe(secretKey);
    const PRICE_IDS = { observer: priceObserver, challenger: priceChallenger, funded_ready: priceFundedReady };
    const { plan, userId, userEmail } = JSON.parse(event.body);
    if (!PRICE_IDS[plan]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', payment_method_types: ['card'], line_items: [{ price: PRICE_IDS[plan], quantity: 1 }], success_url: 'https://traxent.io/dashboard.html?upgraded=true', cancel_url: 'https://traxent.io/dashboard.html', customer_email: userEmail, metadata: { auth0_user_id: userId, plan }, subscription_data: { metadata: { auth0_user_id: userId, plan } } });
    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('Checkout error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create checkout session' }) };
  }
};
