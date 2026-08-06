// ── SCIM 2.0 primitives ─────────────────────────────────────────────────────
// The bits of RFC 7643 (schema) and RFC 7644 (protocol) that identity
// providers actually exercise. Kept separate from the handler so the parsing
// and shaping can be tested without DynamoDB.
//
// Scope note: Users only. Groups are declared unsupported in
// ServiceProviderConfig rather than half-implemented — an IdP that sees
// "supported: false" skips group sync cleanly, whereas one that sees a broken
// /Groups endpoint retries forever and fills the customer's error log.

export const SCHEMA = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  LIST: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  PATCH: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  SP_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
  ENTERPRISE_USER: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
};

/** RFC 7644 §3.12 — every error is this shape, not a bare string. */
export function scimError(status, detail, scimType) {
  return {
    schemas: [SCHEMA.ERROR],
    status: String(status),
    ...(scimType ? { scimType } : {}),
    detail,
  };
}

/** Internal record → SCIM User resource. */
export function toScimUser(item, baseUrl) {
  const id = item.scimId;
  return {
    schemas: [SCHEMA.USER],
    id,
    externalId: item.externalId || undefined,
    userName: item.userName,
    name: {
      givenName: item.givenName || undefined,
      familyName: item.familyName || undefined,
      formatted: [item.givenName, item.familyName].filter(Boolean).join(' ') || undefined,
    },
    displayName: item.displayName || undefined,
    emails: item.email ? [{ value: item.email, primary: true, type: 'work' }] : [],
    active: item.active !== false,
    meta: {
      resourceType: 'User',
      created: item.createdAt,
      lastModified: item.updatedAt || item.createdAt,
      location: `${baseUrl}/Users/${id}`,
      version: `W/"${item.version ?? 1}"`,
    },
  };
}

/** RFC 7644 §3.4.2 — ListResponse envelope. 1-based startIndex. */
export function listResponse(resources, { totalResults, startIndex, itemsPerPage }) {
  return {
    schemas: [SCHEMA.LIST],
    totalResults,
    startIndex,
    itemsPerPage: itemsPerPage ?? resources.length,
    Resources: resources,
  };
}

/**
 * Parse the tiny slice of SCIM filter syntax that IdPs actually send.
 *
 * Okta, Entra ID and JumpCloud all send exactly one form when reconciling:
 *   userName eq "someone@example.com"
 * occasionally with externalId or emails.value instead. Anything more complex
 * (and/or, co, sw, pr) is rejected with the correct `invalidFilter` scimType
 * rather than silently ignored — an ignored filter returns the whole directory,
 * which the IdP then treats as "everyone matches" and can act on destructively.
 *
 * @returns {{attr: string, value: string} | null | {error: string}}
 */
export function parseFilter(filter) {
  if (!filter) return null;
  const m = /^\s*(userName|externalId|emails\.value|emails\[type eq "work"\]\.value)\s+eq\s+"([^"]*)"\s*$/i.exec(filter);
  if (!m) return { error: 'Only simple `eq` filters on userName, externalId or emails.value are supported.' };
  let attr = m[1].toLowerCase();
  if (attr.startsWith('emails')) attr = 'email';
  else if (attr === 'username') attr = 'userName';
  else if (attr === 'externalid') attr = 'externalId';
  return { attr, value: m[2] };
}

/** Pull the fields we store out of an inbound SCIM User payload. */
export function fromScimUser(body) {
  const emails = Array.isArray(body?.emails) ? body.emails : [];
  const primary = emails.find((e) => e && e.primary) || emails[0];
  const email = String(primary?.value ?? body?.userName ?? '').trim().toLowerCase();
  return {
    userName: String(body?.userName ?? '').trim(),
    email,
    externalId: body?.externalId ? String(body.externalId) : undefined,
    givenName: body?.name?.givenName ? String(body.name.givenName).slice(0, 100) : undefined,
    familyName: body?.name?.familyName ? String(body.name.familyName).slice(0, 100) : undefined,
    displayName: body?.displayName ? String(body.displayName).slice(0, 200) : undefined,
    // Absent `active` means active. Entra ID omits it on create.
    active: body?.active === undefined ? true : body.active !== false,
  };
}

/**
 * Apply a PATCH (RFC 7644 §3.5.2) to a stored record.
 *
 * Deactivation is the operation that matters most: it's how an IdP says
 * "this person has left the company". Okta sends
 *   { op: "replace", value: { active: false } }
 * while Entra ID sends
 *   { op: "Replace", path: "active", value: "False" }
 * — different casing, path present or absent, and the value as a STRING. All
 * three variations are handled, because getting this wrong means a leaver
 * keeps their access.
 *
 * @returns {{patch: object} | {error: string}}
 */
export function applyPatch(operations) {
  if (!Array.isArray(operations) || !operations.length) {
    return { error: 'PatchOp requires a non-empty Operations array.' };
  }
  const patch = {};

  const truthy = (v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    return Boolean(v);
  };

  const setPath = (rawPath, value) => {
    const path = String(rawPath ?? '').toLowerCase().replace(/\s/g, '');
    if (path === 'active') patch.active = truthy(value);
    else if (path === 'username') patch.userName = String(value);
    else if (path === 'displayname') patch.displayName = String(value);
    else if (path === 'name.givenname') patch.givenName = String(value);
    else if (path === 'name.familyname') patch.familyName = String(value);
    else if (path === 'externalid') patch.externalId = String(value);
    else if (path.startsWith('emails')) {
      const v = typeof value === 'object' && value !== null ? value.value : value;
      if (v) patch.email = String(v).trim().toLowerCase();
    }
    // Unknown paths are ignored rather than fatal: IdPs send attributes we
    // don't model (title, department) and rejecting the whole request over one
    // would break provisioning for everything else.
  };

  for (const op of operations) {
    const verb = String(op?.op ?? '').toLowerCase();
    if (verb !== 'replace' && verb !== 'add') continue;   // `remove` handled below
    if (op.path) {
      setPath(op.path, op.value);
    } else if (op.value && typeof op.value === 'object') {
      // Pathless form: the value object holds the attributes directly.
      for (const [k, v] of Object.entries(op.value)) setPath(k, v);
    }
  }

  for (const op of operations) {
    if (String(op?.op ?? '').toLowerCase() !== 'remove') continue;
    const path = String(op.path ?? '').toLowerCase();
    // Removing `active` means deactivate, not delete the attribute.
    if (path === 'active') patch.active = false;
  }

  if (!Object.keys(patch).length) {
    return { error: 'No supported attributes in the PatchOp.' };
  }
  return { patch };
}

/** RFC 7643 §5 — what this server does and doesn't do. IdPs read this first. */
export function serviceProviderConfig(baseUrl) {
  return {
    schemas: [SCHEMA.SP_CONFIG],
    documentationUri: 'https://traxent.io/enterprise',
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{
      type: 'oauthbearertoken',
      name: 'OAuth Bearer Token',
      description: 'Per-organisation bearer token, issued by Traxent when the integration is set up.',
      specUri: 'https://www.rfc-editor.org/rfc/rfc6750',
      primary: true,
    }],
    meta: { resourceType: 'ServiceProviderConfig', location: `${baseUrl}/ServiceProviderConfig` },
  };
}

export function resourceTypes(baseUrl) {
  return listResponse([{
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
    id: 'User',
    name: 'User',
    endpoint: '/Users',
    description: 'Traxent user account',
    schema: SCHEMA.USER,
    meta: { resourceType: 'ResourceType', location: `${baseUrl}/ResourceTypes/User` },
  }], { totalResults: 1, startIndex: 1, itemsPerPage: 1 });
}

export function schemas() {
  return listResponse([{
    id: SCHEMA.USER,
    name: 'User',
    description: 'SCIM core User',
    attributes: [
      { name: 'userName', type: 'string', multiValued: false, required: true, uniqueness: 'server' },
      { name: 'name', type: 'complex', multiValued: false, required: false },
      { name: 'displayName', type: 'string', multiValued: false, required: false },
      { name: 'emails', type: 'complex', multiValued: true, required: false },
      { name: 'active', type: 'boolean', multiValued: false, required: false },
    ],
    meta: { resourceType: 'Schema' },
  }], { totalResults: 1, startIndex: 1, itemsPerPage: 1 });
}
