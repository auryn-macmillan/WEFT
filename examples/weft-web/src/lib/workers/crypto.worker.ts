import * as Comlink from 'comlink';

import { createWasmCryptoWorkerApi } from '$lib/crypto/wasm';

Comlink.expose(createWasmCryptoWorkerApi());
