# @ohnix/sync-core

Motor de sincronización offline de Ohnix (outbox + idempotencia + espejo + orquestación), extraído de la implementación web original (`Frontend/src/offline/{outbox,entityQueue,syncEngine}.js`) para que Desktop (Tauri) y Mobile (React Native+Expo) puedan reutilizar la misma lógica detrás de un adaptador de almacenamiento distinto (SQLite en vez de Dexie/IndexedDB).

Ver `docs/architecture/ohnix-multiplatform-strategy.md` §16 para el porqué de este diseño (por qué no se adoptó RxDB/PowerSync/ElectricSQL).

Este paquete no importa Dexie, axios, ni ninguna API de navegador — es JS puro, sin dependencias.

## Contrato del storage adapter

Quien instancia `createSyncCore` debe pasar un `storage` con esta forma:

```js
storage = {
  outbox: {
    add(entry) -> Promise<localId>,
    get(localId) -> Promise<entry | undefined>,
    update(localId, patch) -> Promise<void>,
    remove(localId) -> Promise<void>,
    listByStatus(statuses: string[]) -> Promise<entry[]>,   // ordenado por createdAt asc
    countByStatus(statuses: string[]) -> Promise<number>,
  },
  mirror: {
    replaceAll(entity, records) -> Promise<void>,   // transacción: clear + bulkPut
    upsert(entity, record) -> Promise<void>,
    upsertMany(entity, records) -> Promise<void>,
    remove(entity, id) -> Promise<void>,
    get(entity, id) -> Promise<record | undefined>,
    readAll(entity) -> Promise<record[]>,
  },
  cursor: {
    get(entity) -> Promise<{ entity, cursor, updatedAt } | undefined>,
    put(entity, cursor, updatedAt) -> Promise<void>,
  },
}
```

Este es exactamente el conjunto de operaciones que la implementación web ya hacía contra Dexie — nada especulativo. El adaptador web (`Frontend/src/offline/dexieAdapter.js`) implementa este contrato contra la base Dexie existente. Un futuro adaptador de Tauri (`tauri-plugin-sql`) o Expo (`expo-sqlite`) implementa la misma forma contra tablas SQL.

## Uso

```js
import { createSyncCore } from "@ohnix/sync-core";

const syncCore = createSyncCore({
  storage,           // el adapter de arriba
  httpClient,         // cualquier objeto con .request(config) -> Promise<{data}> (axios sirve tal cual)
  connectivity,       // { getConnectivityState(), subscribeConnectivity(listener) }
  mirrorEntities,     // array de nombres de entidad que tienen tabla espejo
});

// syncCore.outbox       -> enqueueOperation, listPending, markSynced, ...
// syncCore.mirror       -> mirrorReplaceAll, mirrorUpsert, readMirrorAll, ...
// syncCore.entityQueue  -> queueCreate, queueUpdate, queueDelete
// syncCore.syncEngine   -> registerEntitySync, drainOutbox, runSync, startSyncEngine, subscribeSyncCompleted
```

## Qué NO cubre este paquete

- Reactividad de UI (p.ej. `useLiveQuery` de Dexie) — es una preocupación específica de cada plataforma, no de la lógica de sincronización. `StockReport.jsx` y `SyncStatusIndicator.jsx` siguen leyendo la instancia real de Dexie directamente para eso.
- El propio adaptador de almacenamiento (Dexie/SQLite) — vive en cada app consumidora, no aquí.
- Detección de conectividad — se inyecta desde afuera (`connectivity`), cada plataforma decide cómo detectarla (en web, un probe HTTP real en vez de confiar en `navigator.onLine`; ver `Frontend/src/offline/connectivity.js`).

## Tests

```
npm run test   # node --test test/
```
