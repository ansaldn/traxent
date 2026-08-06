// ── Read the TraxentSubscribers table ───────────────────────────────────────
// Uses the AWS CLI rather than the AWS SDK, deliberately: the CLI is already
// installed and authenticated for the deploy steps, so none of the tooling in
// this folder needs an `npm install`. Everything here is read-only except
// markSynced().

import { execFileSync } from 'node:child_process';

export const TABLE = process.env.SUBSCRIBERS_TABLE || 'TraxentSubscribers';
const REGION = process.env.AWS_REGION || 'eu-west-2';

// There is more than one AWS account configured on this machine, so the profile
// is passed explicitly rather than relying on whichever one happens to be the
// default. Set it either way:
//
//   AWS_PROFILE=traxent node export-subscribers.mjs
//   node export-subscribers.mjs --profile traxent
//
// Unset means "use the default profile / environment credentials", which is
// what CI does.
const argProfile = (() => {
  const i = process.argv.indexOf('--profile');
  return i !== -1 ? process.argv[i + 1] : null;
})();
export const PROFILE = argProfile || process.env.AWS_PROFILE || null;
const profileArgs = PROFILE ? ['--profile', PROFILE] : [];

function aws(args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  try {
    const out = execFileSync('aws', [...args, ...profileArgs, '--region', REGION, '--output', 'json'], {
      encoding: 'utf8', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim() ? JSON.parse(out) : {};
  } catch (e) {
    const stderr = String(e.stderr ?? '').trim();
    const where = PROFILE ? `profile "${PROFILE}"` : 'the default profile';
    if (e.code === 'ENOENT') {
      throw new Error('The AWS CLI is not installed, or not on PATH.');
    }
    if (/could not be found|does not exist/i.test(stderr) && /profile/i.test(stderr)) {
      throw new Error(`AWS profile "${PROFILE}" is not configured. Run: aws configure list-profiles`);
    }
    if (/Unable to locate credentials|ExpiredToken|InvalidClientTokenId/i.test(stderr)) {
      throw new Error(`AWS CLI is not authenticated for ${where} in ${REGION}.\n  ${stderr.split('\n')[0]}`);
    }
    if (/AccessDenied|not authorized/i.test(stderr)) {
      throw new Error(`${where} lacks permission for this call.\n  ${stderr.split('\n')[0]}`);
    }
    if (/ResourceNotFoundException/i.test(stderr)) {
      throw new Error(
        `Table "${TABLE}" does not exist in ${REGION} under ${where}.\n` +
        '  Either the user-data stack has not been deployed yet, or this profile points at a different account.\n' +
        `  Check with: aws sts get-caller-identity${PROFILE ? ` --profile ${PROFILE}` : ''} --region ${REGION}`
      );
    }
    throw new Error(stderr.split('\n')[0] || String(e.message));
  }
}

/** Which AWS account these commands will actually hit. Worth printing. */
export function whoami() {
  const r = aws(['sts', 'get-caller-identity']);
  return { account: r.Account, arn: r.Arn, profile: PROFILE ?? '(default)', region: REGION };
}

/** DynamoDB JSON → plain JS. Only the types this table actually uses. */
function unmarshal(item) {
  const out = {};
  for (const [k, v] of Object.entries(item ?? {})) {
    if ('S' in v) out[k] = v.S;
    else if ('N' in v) out[k] = Number(v.N);
    else if ('BOOL' in v) out[k] = v.BOOL;
    else if ('NULL' in v) out[k] = null;
    else if ('L' in v) out[k] = v.L.map((x) => unmarshal({ x }).x);
    else if ('M' in v) out[k] = unmarshal(v.M);
  }
  return out;
}

/**
 * Every subscriber with the given status, via the StatusIndex GSI.
 * Rate-limit counter rows carry no `status`, so they are never returned.
 */
export function listByStatus(status) {
  const rows = [];
  let startKey = null;
  do {
    const args = [
      'dynamodb', 'query',
      '--table-name', TABLE,
      '--index-name', 'StatusIndex',
      '--key-condition-expression', '#s = :s',
      '--expression-attribute-names', JSON.stringify({ '#s': 'status' }),
      '--expression-attribute-values', JSON.stringify({ ':s': { S: status } }),
    ];
    if (startKey) args.push('--exclusive-start-key', JSON.stringify(startKey));
    const page = aws(args);
    rows.push(...(page.Items ?? []).map(unmarshal));
    startKey = page.LastEvaluatedKey ?? null;
  } while (startKey);
  return rows;
}

/** Every subscriber row, all statuses. Scans, then drops the counter rows. */
export function listAll() {
  const rows = [];
  let startKey = null;
  do {
    const args = ['dynamodb', 'scan', '--table-name', TABLE];
    if (startKey) args.push('--exclusive-start-key', JSON.stringify(startKey));
    const page = aws(args);
    rows.push(...(page.Items ?? []).map(unmarshal));
    startKey = page.LastEvaluatedKey ?? null;
  } while (startKey);
  return rows.filter((r) => r.email && !r.email.startsWith('RATE#') && r.status);
}

/** Record a successful (or failed) Resend sync against a row. */
export function markSynced(email, { synced, contactId = null, error = null }) {
  aws([
    'dynamodb', 'update-item',
    '--table-name', TABLE,
    '--key', JSON.stringify({ email: { S: email } }),
    '--update-expression', 'SET resendSynced = :s, resendSyncedAt = :n, resendContactId = :c, resendSyncError = :e',
    '--expression-attribute-values', JSON.stringify({
      ':s': { BOOL: !!synced },
      ':n': { S: new Date().toISOString() },
      ':c': contactId ? { S: contactId } : { NULL: true },
      ':e': error ? { S: String(error).slice(0, 300) } : { NULL: true },
    }),
  ]);
}

/**
 * Insert a subscriber, but never overwrite one that already exists.
 * Used to seed the table from the historical Formspree export.
 * @returns {'created'|'exists'}
 */
export function putSubscriberIfNew(record) {
  const item = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === undefined || v === null || v === '') continue;
    item[k] = typeof v === 'boolean' ? { BOOL: v } : typeof v === 'number' ? { N: String(v) } : { S: String(v) };
  }
  try {
    aws([
      'dynamodb', 'put-item',
      '--table-name', TABLE,
      '--item', JSON.stringify(item),
      '--condition-expression', 'attribute_not_exists(email)',
    ]);
    return 'created';
  } catch (e) {
    if (/ConditionalCheckFailed/i.test(e.message)) return 'exists';
    throw e;
  }
}

/** Quote a value for CSV — escapes quotes and guards against formula injection. */
export function csvCell(value) {
  let s = value == null ? '' : String(value);
  // A leading =, +, - or @ makes Excel/Sheets treat the cell as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
