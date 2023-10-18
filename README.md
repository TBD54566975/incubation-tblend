# Web5Service

This package provides a base Web5Service that can be extended to easily expose any existing API as a Web5 protocol. This project is based on [DWN-Proxy](https://github.com/TBD54566975/dwn-proxy-js), [DWN-SDK](), and [Web5-js](https://github.com/TBD54566975/web5-js) and may reimplement some features from those project.


## Introduction

Creating a service provider for Web5 requires several things. 
* A service needs a DID and keys to sign with. 
* It needs a DWN it can recieve messages on. 
* It needs to integrate with existing REST APIs and be able to transform API responses to protocol messages sent to a DWN.
* It needs to be able to create and sign Verifiable Credentials
* It needs to provide a protocol and protocol schemas in JSON

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
    import {Web5Service} from 'web5-service'

    // used to detect if an incoming DWN message is a create request
    const isCreateRequest = (dwnRequest: any) => dwnRequest.message.descriptor.interface === 'Records' &&
        dwnRequest.message.descriptor.method === 'Write' &&
        dwnRequest.message.descriptor.schema === 'https://myservice.io/protocol/example/create-request.schema.json';

    export class Web5RikiService extends Web5Service {

        constructor() {
            super();
            this.addHandler(isCreateRequest, this.requestRIKI);
        }

        // handle incoming DWN create message
        async handleCreateRequest(request: DwnRequest) {

        }
    }
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
