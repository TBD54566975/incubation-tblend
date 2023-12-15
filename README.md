# Verifiable Credential Issuer

The long term vision for this service is to implement the spec outlined at https://identity.foundation/credential-manifest/#credential-manifest using DWN protocols.

This service currently implements a REST API that roughly follows the spec.

## Installation

```sh
npm i https://github.com/TBD54566975/incubation-tblend
```

## Configuration

See the file `.env.example`

Create a new file `.env` to set the environment variables as needed or provide them at runtime.


## API Docs

This service provides a Swagger UI and swagger.json. After starting the service, open a browser to http://localhost:3000/api/documentation

## Usage

```ts
// your custom server.ts
import {start as startServer, Signer} from 'verifiable-credential-issuere';
import manifest from "./assets/manifest.json";
import { PresentationExchange, VerifiableCredential } from '@web5/credentials';

async function start() {
    await startServer({
            credentials: [{
                manifest, // provide a credential manifest https://identity.foundation/credential-manifest/spec/v1.0.0/
                // provide a handler function with custom logic to issue the credential(s)
                handler: async (presentation: any, issuerDid: string, subjectDid: string, kid: string, signer: Signer) => {
                    const selectedCreds = PresentationExchange.selectCredentials(presentation.verifiableCredential, manifest.presentation_definition);

                    // do something with selectedCreds to issue a VC in response

                    // Create self signed credential for test
                    const vc = VerifiableCredential.create({
                        type: 'ExampleCred',
                        issuer: issuerDid,
                        subject: subjectDid,
                        data: { value: 10 },
                    });

                    const signOptions = {
                        issuerDid,
                        subjectDid,
                        kid,
                        signer
                    };

                    const exampleCredentialJwt = await vc.sign(signOptions);

                    return {
                        fulfillment: {
                            descriptor_map: [
                                {
                                    "id": "example_output",
                                    "format": "jwt_vc",
                                    "path": "$.verifiableCredential[0]"
                                },
                            ]
                        },
                        verifiableCredential: [exampleCredentialJwt]
                    }
                }
            }]
}
```

## Running Tests
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
