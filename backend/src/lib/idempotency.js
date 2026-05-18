const crypto = require('crypto');

const IDEMPOTENCY_FIELDS = ['clientMutationId', 'deviceId', 'createdOfflineAt'];

const pickSyncMeta = (body = {}) => {
  const clientMutationId = typeof body.clientMutationId === 'string'
    ? body.clientMutationId.trim()
    : '';
  const deviceId = typeof body.deviceId === 'string'
    ? body.deviceId.trim()
    : '';

  if (!clientMutationId && !deviceId) return null;
  if (!clientMutationId || !deviceId) {
    return { invalid: true, clientMutationId, deviceId };
  }

  const createdOfflineAt = body.createdOfflineAt
    ? new Date(body.createdOfflineAt)
    : null;

  return {
    clientMutationId,
    deviceId,
    createdOfflineAt: createdOfflineAt && !Number.isNaN(createdOfflineAt.getTime())
      ? createdOfflineAt
      : null
  };
};

const stripSyncMeta = (body = {}) => {
  const clean = { ...body };
  for (const f of IDEMPOTENCY_FIELDS) delete clean[f];
  return clean;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) =>
      `${JSON.stringify(k)}:${stableStringify(value[k])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
};

const payloadHash = (payload) =>
  crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const findOperation = (client, meta) =>
  client.syncOperation.findUnique({
    where: {
      clientMutationId_deviceId: {
        clientMutationId: meta.clientMutationId,
        deviceId: meta.deviceId
      }
    }
  });

const createOperation = (client, meta, data) => {
  console.log('[sync-idempotency]', {
    clientMutationId: meta.clientMutationId,
    deviceId: meta.deviceId,
    entityType: data.entityType,
    action: data.action
  });
  console.log('[sync-operation-created]', {
    entityType: data.entityType,
    entityId: data.entityId,
    action: data.action,
    clientMutationId: meta.clientMutationId,
    deviceId: meta.deviceId
  });

  return client.syncOperation.create({
    data: {
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      clientMutationId: meta.clientMutationId,
      deviceId: meta.deviceId,
      payloadHash: data.payloadHash ?? null,
      status: data.status ?? 'COMPLETED',
      createdOfflineAt: meta.createdOfflineAt
    }
  });
};

const logDuplicate = (op) => {
  console.log('[sync-duplicate-detected]', {
    entityType: op.entityType,
    entityId: op.entityId,
    action: op.action,
    clientMutationId: op.clientMutationId,
    deviceId: op.deviceId
  });
  console.log('[sync-retry]', {
    clientMutationId: op.clientMutationId,
    deviceId: op.deviceId,
    returningEntityId: op.entityId
  });
};

module.exports = {
  pickSyncMeta,
  stripSyncMeta,
  payloadHash,
  findOperation,
  createOperation,
  logDuplicate
};
