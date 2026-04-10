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
export const getSchemas    = (branch='main')           => request(`/models/schemas?branch=${encodeURIComponent(branch)}`);
export const createSchema  = (data, branch='main')     => request(`/models/schemas?branch=${encodeURIComponent(branch)}`, { method: 'POST', body: JSON.stringify(data) });
export const dropSchema    = (name, branch='main')     => request(`/models/schemas/${name}?branch=${encodeURIComponent(branch)}`, { method: 'DELETE' });

// ── Data Models — Tables ────────
export const getTables     = (schema, branch='main')     => request(`/models/tables/${schema}?branch=${encodeURIComponent(branch)}`);
export const createTable   = (data, branch='main')       => request(`/models/tables?branch=${encodeURIComponent(branch)}`, { method: 'POST', body: JSON.stringify(data) });
export const dropTable     = (schema, table, branch='main') => request(`/models/tables/${schema}/${table}?branch=${encodeURIComponent(branch)}`, { method: 'DELETE' });
export const renameTable   = (schema, table, data, branch='main') => request(`/models/tables/${schema}/${table}/rename?branch=${encodeURIComponent(branch)}`, { method: 'POST', body: JSON.stringify(data) });

// ── Data Models — Table Detail ──
export const describeTable    = (schema, table, branch='main')           => request(`/models/tables/${schema}/${table}/columns?branch=${encodeURIComponent(branch)}`);
export const getTableProps    = (schema, table, branch='main')           => request(`/models/tables/${schema}/${table}/properties?branch=${encodeURIComponent(branch)}`);
export const getTableStats    = (schema, table, branch='main')           => request(`/models/tables/${schema}/${table}/stats?branch=${encodeURIComponent(branch)}`);
export const previewTable     = (schema, table, limit=50, snapshotId=null, branch='main') => {
  let url = `/models/tables/${schema}/${table}/preview?limit=${limit}&branch=${encodeURIComponent(branch)}`;
  if (snapshotId) url += `&snapshot_id=${snapshotId}`;
  return request(url);
};
export const getSnapshots     = (schema, table, branch='main')           => request(`/models/tables/${schema}/${table}/snapshots?branch=${encodeURIComponent(branch)}`);
export const alterTable       = (schema, table, data, branch='main')     => request(`/models/tables/${schema}/${table}/alter?branch=${encodeURIComponent(branch)}`, { method: 'POST', body: JSON.stringify(data) });
export const rollbackToSnapshot = (schema, table, snapshot_id, branch='main') =>
    request(`/models/tables/${schema}/${table}/rollback?branch=${encodeURIComponent(branch)}`, { method: 'POST', body: JSON.stringify({ snapshot_id }) });

export const optimizeTable = (schema, table, branch='main') =>
    request(`/models/tables/${schema}/${table}/optimize`, { method: 'POST', body: JSON.stringify({ branch }) });

export const vacuumTable = (schema, table, retention_threshold='7d', retain_last=1, branch='main') =>
    request(`/models/tables/${schema}/${table}/vacuum`, { method: 'POST', body: JSON.stringify({ branch, retention_threshold, retain_last }) });

export const insertTableData  = (schema, table, data, branch='main')     => request(`/models/tables/${schema}/${table}/insert?branch=${encodeURIComponent(branch)}`, { method: 'POST', body: JSON.stringify(data) });

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
