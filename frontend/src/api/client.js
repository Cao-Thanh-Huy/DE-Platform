/**
 * API Client — DE Studio
 * Giao tiếp với FastAPI Backend.
 */
const BASE_URL = '/api';

async function request(url, options = {}) {
  const resp = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// ── Health ───────────────────────
export const checkHealth = () => request('/health');

// ── Data Models — Schemas ───────
export const getSchemas    = ()           => request('/models/schemas');
export const createSchema  = (data)       => request('/models/schemas', { method: 'POST', body: JSON.stringify(data) });
export const dropSchema    = (name)       => request(`/models/schemas/${name}`, { method: 'DELETE' });

// ── Data Models — Tables ────────
export const getTables     = (schema)     => request(`/models/tables/${schema}`);
export const createTable   = (data)       => request('/models/tables', { method: 'POST', body: JSON.stringify(data) });
export const dropTable     = (schema, table) => request(`/models/tables/${schema}/${table}`, { method: 'DELETE' });
export const renameTable   = (schema, table, data) => request(`/models/tables/${schema}/${table}/rename`, { method: 'POST', body: JSON.stringify(data) });

// ── Data Models — Table Detail ──
export const describeTable    = (schema, table)           => request(`/models/tables/${schema}/${table}/columns`);
export const getTableProps    = (schema, table)           => request(`/models/tables/${schema}/${table}/properties`);
export const getTableStats    = (schema, table)           => request(`/models/tables/${schema}/${table}/stats`);
export const previewTable     = (schema, table, limit=50, snapshotId=null) => {
  let url = `/models/tables/${schema}/${table}/preview?limit=${limit}`;
  if (snapshotId) url += `&snapshot_id=${snapshotId}`;
  return request(url);
};
export const getSnapshots     = (schema, table)           => request(`/models/tables/${schema}/${table}/snapshots`);
export const alterTable       = (schema, table, data)     => request(`/models/tables/${schema}/${table}/alter`, { method: 'POST', body: JSON.stringify(data) });

// ── Pipelines ───────────────────
export const listPipelines    = ()        => request('/pipelines/');
export const getPipeline      = (name)    => request(`/pipelines/${name}`);
export const createPipeline   = (data)    => request('/pipelines/', { method: 'POST', body: JSON.stringify(data) });
export const updatePipeline   = (name, data) => request(`/pipelines/${name}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePipeline   = (name)    => request(`/pipelines/${name}`, { method: 'DELETE' });
export const triggerPipeline  = (name)    => request(`/pipelines/${name}/run`, { method: 'POST' });
export const getPipelineRuns  = (name)    => request(`/pipelines/${name}/runs`);

// ── Nessie Git ──────────────────
export const listBranches     = ()        => request('/nessie/branches');
export const createBranch     = (data)    => request('/nessie/branches', { method: 'POST', body: JSON.stringify(data) });
export const deleteBranch     = (name)    => request(`/nessie/branches/${name}`, { method: 'DELETE' });
export const getBranchLog     = (name)    => request(`/nessie/branches/${name}/log`);
export const getBranchContents= (name)    => request(`/nessie/branches/${name}/contents`);
export const mergeBranches    = (data)    => request('/nessie/merge', { method: 'POST', body: JSON.stringify(data) });
export const diffBranches     = (from,to) => request(`/nessie/diff/${from}/${to}`);
export const listTags         = ()        => request('/nessie/tags');
export const createTag        = (data)    => request('/nessie/tags', { method: 'POST', body: JSON.stringify(data) });

// ── Query Engine ────────────────
export const executeQuery     = (data)    => request('/query/execute', { method: 'POST', body: JSON.stringify(data) });
export const listCatalogs     = ()        => request('/query/catalogs');

// ── Storage (MinIO) ─────────────
export const listBuckets      = ()        => request('/storage/buckets');
export const listObjects      = (bucket, prefix = '') => request(`/storage/objects/${bucket}?prefix=${encodeURIComponent(prefix)}`);
export const deleteObject     = (bucket, objectName)  => request(`/storage/objects/${bucket}/${objectName}`, { method: 'DELETE' });
