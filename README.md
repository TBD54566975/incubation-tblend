# tbLEND-service

This package aims to provide a service to make it easy to participate in the tbLEND protocol. This project is heavily based on [DWN-Proxy](https://github.com/TBD54566975/dwn-proxy-js), with convenience methods for Verifiable Credentials and Verifiable Presentations.


## Introduction

tbLEND is a Web5 lending protocol. There are many participants in the protocol, including users seeking a loan, banking data providers, credit score providers, and lenders.

The data providers and lenders in this protocol will need to have an integration layer between their existing services and web5.

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
    import {Web5Service} from '@TBD54566975/incubation-tblend'

    class MyWeb5Service extends Web5Service {
        ...
    }
```

## Testing
```sh
npm test
```

* [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
* [GOVERNANCE.md](./GOVERNANCE.md)
* [LICENSE](./LICENSE)

## Project Resources

| Resource                                   | Description                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [CODEOWNERS](./CODEOWNERS)                 | Outlines the project lead(s)                                                   |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Expected behavior for project contributors, promoting a welcoming environment |
| [CONTRIBUTING.md](./CONTRIBUTING.md)       | Developer guide to build, test, run, access CI, chat, discuss, file issues     |
| [GOVERNANCE.md](./GOVERNANCE.md)           | Project governance                                                             |
| [LICENSE](./LICENSE)                       | Apache License, Version 2.0                                                    |
