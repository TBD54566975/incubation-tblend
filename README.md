# Web5Service

This package provides a base Web5Service that can be extended to easily expose any existing API as a Web5 protocol. This project is based on [DWN-Proxy](https://github.com/TBD54566975/dwn-proxy-js), [DWN-SDK](https://github.com/TBD54566975/dwn-sdk-js), and [Web5-js](https://github.com/TBD54566975/web5-js) and may reimplement some features from those project.


## Introduction

Creating a service provider for Web5 requires several things. 
* A service needs a DID and keys to sign with. 
* It needs one or more DWNs it can recieve messages on.
* It needs to integrate with existing REST APIs and be able to transform API responses to protocol messages sent to a DWN.
* It needs to be able to create, sign, and verify Verifiable Credentials.
* It needs to provide a protocol and protocol schemas in JSON.

This base service provides functionality for all of these things.

## Config
This service writes a file ./config.json upon first run. This file contains private keys, and should be mounted in a secure way for production.

This service also uses ./DATA for the LevelDB storage for the DWN.

Both of these locations can be customized when initializing the Web5Service.

## Installation

```sh
npm i https://github.com/TBD54566975/incubation-tblend
```

## Usage

```ts
// myWeb5Service.ts
import {Web5Service} from 'web5-service'

// used to detect if an incoming DWN message is a create request
const isCreateRequest = (dwnRequest: any) => dwnRequest.message.descriptor.interface === 'Records' &&
    dwnRequest.message.descriptor.method === 'Write' &&
    dwnRequest.message.descriptor.schema === 'https://myservice.io/protocol/example/create-request.schema.json';

export class MyWeb5Service extends Web5Service {

    constructor() {
        super();
        this.addHandler(isCreateRequest, this.requestRIKI.bind(this));
    }

    // handle incoming DWN create message
    async handleCreateRequest(request: DwnRequest) {
        // do whatever you want here

        return {
                reply: {
                    status: {
                        code: 202,
                        detail: 'Accepted'
                    }

                }
            };
    }
}
```

```ts
// server.ts
import config from './config/index.js';
import { MyWeb5Service } from './myWeb5Service.js';
import { myProtocol } from './protocol/index.js';

const web5Service = new MyWeb5Service();

async function start() {
    await web5Service.start({
        configFile: config.web5Configfile,
        levelDbDir: config.levelDbDir,
        dwnServiceEndpoints: config.dwnServiceEndpoints,
        port: config.port,
    });

    const protocolConfigured = await web5Service.queryProtocol({
        message: {
            filter: {
                protocol: myProtocol.message.definition.protocol
            }
        }
    })

    if (!protocolConfigured.reply.entries?.length) {
        await web5Service.configureProtocol(myProtocol)
    }
}

start().then(() => {
    console.log('Started DWN service on port ' + config.port);
    console.log('External Url configured as ' + config.externalUrl);
    console.log('Using DID for service ' + web5Service.identity?.canonicalId);
    console.log('Long form DID', web5Service.identity?.did);
    console.log('DWN Service Endpoints configured as ' + config.dwnServiceEndpoints);
})
```

## Hosting Protocol Schemas

In your project, create a directory called `json-schemas` and place all of your protocol schemas in it. These are served under `/protocol` when the service is started.


## Testing
```sh
npm test
```

## Project Resources

| Resource                                   | Description                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [CODEOWNERS](./CODEOWNERS)                 | Outlines the project lead(s)                                                   |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Expected behavior for project contributors, promoting a welcoming environment |
| [CONTRIBUTING.md](./CONTRIBUTING.md)       | Developer guide to build, test, run, access CI, chat, discuss, file issues     |
| [GOVERNANCE.md](./GOVERNANCE.md)           | Project governance                                                             |
| [LICENSE](./LICENSE)                       | Apache License, Version 2.0                                                    |
