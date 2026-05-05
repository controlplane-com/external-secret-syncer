/**
 * Mock 1Password Connect Server for local testing.
 *
 * Simulates the three API calls our OnePasswordConnectProvider makes:
 *   GET /v1/vaults/?filter=title eq "..."
 *   GET /v1/vaults/{id}/items?filter=title eq "..."
 *   GET /v1/vaults/{id}/items/{itemId}
 *
 * Usage:
 *   node test/mock-connect-server.js
 *
 * Then configure your ESS sync.yaml with:
 *   serverURL: http://localhost:8080
 *   token: mock-token
 *   opaque: ESS Test/My App/password
 */

const http = require('http');
const url = require('url');

// ── Test data ──────────────────────────────────────────────────────────────────
const VAULT = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'ESS Test',
};

const ITEM_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const FULL_ITEM = {
  id: ITEM_ID,
  title: 'My App',
  vault: { id: VAULT.id },
  category: 'LOGIN',
  fields: [
    {
      id: 'password',
      label: 'password',
      type: 'CONCEALED',
      value: 'mock-secret-value-123',
    },
    {
      id: 'username',
      label: 'username',
      type: 'STRING',
      value: 'mock-user',
    },
  ],
};
// ──────────────────────────────────────────────────────────────────────────────

function extractFilterTitle(query) {
  const filter = query.filter;
  if (!filter) return null;
  const match = filter.match(/title eq "(.+)"/);
  return match ? match[1] : null;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname.replace(/\/$/, ''); // strip trailing slash
  const query = parsed.query;

  console.log(`${req.method} ${req.url}`);

  // Health check
  if (path === '/heartbeat') {
    return send(res, 200, { version: '1.0.0-mock' });
  }

  // GET /v1/vaults  — list/filter vaults by title
  if (path === '/v1/vaults') {
    const title = extractFilterTitle(query);
    const vaults = !title || title === VAULT.name ? [VAULT] : [];
    return send(res, 200, vaults);
  }

  // GET /v1/vaults/{id}  — get vault by ID
  const vaultById = path.match(/^\/v1\/vaults\/([^/]+)$/);
  if (vaultById) {
    if (vaultById[1] === VAULT.id) return send(res, 200, VAULT);
    return send(res, 404, { message: 'vault not found' });
  }

  // GET /v1/vaults/{id}/items  — list/filter items by title
  const itemsList = path.match(/^\/v1\/vaults\/([^/]+)\/items$/);
  if (itemsList) {
    const title = extractFilterTitle(query);
    const items =
      !title || title === FULL_ITEM.title
        ? [{ id: ITEM_ID, title: FULL_ITEM.title, vault: { id: VAULT.id } }]
        : [];
    return send(res, 200, items);
  }

  // GET /v1/vaults/{id}/items/{itemId}  — get full item by ID
  const itemById = path.match(/^\/v1\/vaults\/([^/]+)\/items\/([^/]+)$/);
  if (itemById) {
    if (itemById[2] === ITEM_ID) return send(res, 200, FULL_ITEM);
    return send(res, 404, { message: 'item not found' });
  }

  send(res, 404, { message: 'not found' });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`\n1Password Connect mock server listening on http://localhost:${PORT}`);
  console.log('\nTest data:');
  console.log(`  Vault : "${VAULT.name}"`);
  console.log(`  Item  : "${FULL_ITEM.title}"`);
  console.log(`  Fields: password="${FULL_ITEM.fields[0].value}", username="${FULL_ITEM.fields[1].value}"`);
  console.log('\nESS config to use:');
  console.log('  onePasswordConnect:');
  console.log(`    serverURL: http://localhost:${PORT}`);
  console.log('    token: mock-token');
  console.log(`  opaque: ${VAULT.name}/${FULL_ITEM.title}/password`);
  console.log('');
});
