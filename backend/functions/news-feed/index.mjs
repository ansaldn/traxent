import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { JwtRsaVerifier } from 'aws-jwt-verify';

// ── News feed Lambda ────────────────────────────────────────────────────────
// Returns AI-sentiment-tagged market news for the Funded Trader (/news page).
//
// Pluggable provider: the API key is read from SSM Parameter Store at runtime,
// so you can drop a key in later without redeploying. Until a key exists the
// endpoint returns an empty feed with status "no_key" and the page shows a
// friendly "feed is being set up" state.
//
// To go live: create a string (SecureString) SSM param
//   /traxent/news/alphavantage_key   = <your Alpha Vantage API key>
// (Alpha Vantage's NEWS_SENTIMENT endpoint already returns bull/bear sentiment
// scores. Swap fetchProvider() for any other provider with the same shape.)

const ssm = new SSMClient({ region: 'eu-west-2' });

// Same ID-token verifier as the other functions (aud = SPA Client ID).
// Accept ID tokens from BOTH the web SPA and the iOS native app. Override with
// the AUTH0_AUDIENCE env var (comma-separated) if a client ID ever changes.
const AUDIENCES = (process.env.AUTH0_AUDIENCE
  || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz,YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK')
  .split(',').map(s => s.trim()).filter(Boolean);

const verifier = JwtRsaVerifier.create({
  issuer: 'https://auth.traxent.io/',
  audience: AUDIENCES,
  jwksUri: 'https://auth.traxent.io/.well-known/jwks.json',
});

const NS = 'https://traxent.io';
const PLAN_ORDER = ['free', 'observer', 'challenger', 'funded_ready'];

const headers = {
  'Access-Control-Allow-Origin': 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

async function getParam(name) {
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    return res.Parameter?.Value || null;
  } catch {
    return null; // missing param → treated as "not configured yet"
  }
}

// Require a valid Auth0 ID token AND the Funded Trader plan (news is a
// funded_ready feature). Returns the verified plan; throws with statusCode.
async function requireFundedReady(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) { const e = new Error('Missing Authorization header'); e.statusCode = 401; throw e; }
  let payload;
  try { payload = await verifier.verify(token); }
  catch (err) {
    console.error('JWT verify failed:', err.message);
    const e = new Error('Invalid token'); e.statusCode = 401; throw e;
  }
  const plan = payload[`${NS}/plan`] || 'free';
  if (PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf('funded_ready')) {
    const e = new Error('News feed requires the Funded Trader plan'); e.statusCode = 403; throw e;
  }
  return plan;
}

function mapSentiment(label, score) {
  const s = (label || '').toLowerCase();
  if (s.includes('bull')) return 'bullish';
  if (s.includes('bear')) return 'bearish';
  if (typeof score === 'number') {
    if (score >= 0.15) return 'bullish';
    if (score <= -0.15) return 'bearish';
  }
  return 'neutral';
}

// Default provider: Alpha Vantage NEWS_SENTIMENT. Returns our normalised shape.
async function fetchProvider(key) {
  const url = 'https://www.alphavantage.co/query?function=NEWS_SENTIMENT'
    + '&topics=financial_markets,economy_macro,finance'
    + '&sort=LATEST&limit=50&apikey=' + encodeURIComponent(key);
  const r = await fetch(url);
  const data = await r.json();
  // Alpha Vantage returns { feed: [...] } or { Information / Note } on limits.
  if (!Array.isArray(data.feed)) {
    return { articles: [], providerNote: data.Information || data.Note || data['Error Message'] || null };
  }
  const articles = data.feed.map((item) => ({
    title: item.title,
    url: item.url,
    source: item.source,
    published: item.time_published, // "YYYYMMDDTHHMMSS"
    summary: item.summary,
    sentiment: mapSentiment(item.overall_sentiment_label, Number(item.overall_sentiment_score)),
    score: Number(item.overall_sentiment_score),
    tickers: (item.ticker_sentiment || []).slice(0, 4).map((t) => t.ticker),
  }));
  return { articles, providerNote: null };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    await requireFundedReady(event);
  } catch (err) {
    return { statusCode: err.statusCode || 401, headers, body: JSON.stringify({ error: err.message || 'Unauthorized' }) };
  }

  try {
    const key = await getParam('/traxent/news/alphavantage_key');
    if (!key) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'no_key', articles: [], updated: new Date().toISOString() }),
      };
    }
    const { articles, providerNote } = await fetchProvider(key);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: articles.length ? 'ok' : 'empty',
        provider: 'alphavantage',
        providerNote,
        articles,
        updated: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('news-feed error:', err);
    return { statusCode: 502, headers, body: JSON.stringify({ status: 'error', articles: [], error: 'Failed to load news' }) };
  }
};
