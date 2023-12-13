import * as Lab from '@hapi/lab';
import { expect } from '@hapi/code';

import { service, init, stop, Signer } from '../service'

const lab = Lab.script();
const { describe, it, after, afterEach, before, beforeEach } = lab;
export { lab };

import manifest from "./assets/manifest.json";
import { PresentationExchange, VerifiableCredential } from '@web5/credentials';
import { DidIonMethod, PortableDid } from '@web5/dids';

import { getKeyId, getSigner } from '../lib/util';
import { PrivateKeyJwk } from '@web5/crypto';
import { createHash } from 'crypto';

let testIdentity: PortableDid;

describe('API', () => {
    before(async () => {
        await init({
            credentials: [{
                name: "example",
                manifest,
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
        });

        testIdentity = await DidIonMethod.create();
    });

    it('should provide a list of credential types', async () => {
        const res = await service.inject({
            method: 'get',
            url: '/api/credential-types',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.payload).to.contain('example');

    })

    it('should provide a manifest', async () => {
        const res = await service.inject({
            method: 'get',
            url: '/api/example/manifest',
        });

        expect(res.statusCode).to.equal(200);
    })

    it('should accept a credential application', async () => {

        // Create self signed credential for test
        const vc = VerifiableCredential.create({
            type: 'ExampleCred',
            issuer: testIdentity.did,
            subject: testIdentity.did,
            data: { value: 10 },
        });

        const keyId = getKeyId(testIdentity.did);
        const [signingKeyPair] = testIdentity.keySet.verificationMethodKeys!;

        const signOptions = {
            issuerDid: testIdentity.did,
            subjectDid: testIdentity.did,
            kid: keyId,
            signer: getSigner(signingKeyPair.privateKeyJwk as PrivateKeyJwk)
        };

        const exampleCredentialJwt = await vc.sign(signOptions);

        const selectedCreds = PresentationExchange.selectCredentials([exampleCredentialJwt], manifest.presentation_definition);
        const presentationResult = PresentationExchange.createPresentationFromCredentials(selectedCreds, manifest.presentation_definition);

        const hash = createHash('sha256').update(JSON.stringify(presentationResult.presentation)).digest();
        const signer = getSigner(signingKeyPair.privateKeyJwk as PrivateKeyJwk)
        const signedHash = await signer(hash);

        const res = await service.inject({
            method: 'post',
            url: '/api/example/application',
            payload: presentationResult.presentation,
            headers: {
                'X-Request-Applicant': testIdentity.did,
                'X-Request-Signature': Buffer.from(signedHash).toString('base64'),
            }
        });

        expect(res.statusCode).to.equal(200);
    })
}) 