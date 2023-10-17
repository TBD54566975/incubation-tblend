import { CreateVpOptions, CredentialSubject, VerifiableCredential, VerifiableCredentialTypeV1, VerifiablePresentation, utils } from '@web5/credentials';
import { Ed25519, Jose } from '@web5/crypto';
import { DidIonMethod, PortableDid, DidService, utils as didUtils } from '@web5/dids';
import { DataStoreLevel, Dwn, EventLogLevel, MessageStoreLevel } from '@tbd54566975/dwn-sdk-js'
import { v4 as uuidv4 } from 'uuid';
import { writeFile, readFile } from 'fs/promises';

import { PrivateTenantGate } from './private-tenant-gate.js';
import { DwnHttpServer } from './dwn-http-server.js';
import { DwnHttpClient } from './dwn-http-client.js';
import type { DwnRequest, DwnResponse } from './dwn-types.js';

import { Server } from "http"

interface IMatch {
    (req: DwnRequest): boolean
}
interface IHandler {
    (dwnRequest: DwnRequest): Promise<void | DwnResponse>
}
interface IMatchHandler {
    match: IMatch
    handler: IHandler
}

type Signer = (data: Uint8Array) => Promise<Uint8Array>;

export class Web5Service {
    public identity: null | PortableDid;
    public signingKeyPair: any;

    private signingPrivateKey: any;
    public dwn: null | Dwn;

    private service: null | DwnHttpServer;
    private client: DwnHttpClient;

    private server: null | Server;

    public handlers: Array<IMatchHandler>;

    constructor() {
        this.identity = null;
        this.dwn = null;
        this.service = null;
        this.client = new DwnHttpClient();
        this.handlers = [];
        this.server = null;
    }

    public async start(options?: { configFile?: string, levelDbDir?: string, services?: DidService[], dwnServiceEndpoints: string[], port: number, operationsEndpoint?: string, challengeEndpoint?: string, challengeEnabled?: boolean }) {
        const {
            configFile = "./config.json",
            levelDbDir = "./DATA",
            services = [],
            dwnServiceEndpoints = ['http://localhost:8080'],
            port = 8080,
            challengeEnabled = false,
            challengeEndpoint = 'https://ion.tbddev.org/proof-of-work',
            operationsEndpoint = 'https://ion.tbddev.org/operations'
        } = options || {};

        let configString;
        try {
            const configBuffer = await readFile(configFile);
            configString = configBuffer.toString();
        } catch (e) {
            // config does not exist
        }

        if (configString) {
            const config = JSON.parse(configString);
            // recreate DID using existing config
            this.identity = await DidIonMethod.create({ services: config.services, keySet: config.keySet })
        } else {
            // create new DID w/ DWN keys
            const dwnOptions = await DidIonMethod.generateDwnOptions({ serviceEndpointNodes: dwnServiceEndpoints });
            dwnOptions.services = dwnOptions.services || [];

            this.identity = await DidIonMethod.create({
                services: [
                    ...services,
                    ...dwnOptions.services
                ],
                keySet: dwnOptions.keySet
            });

            const resolved = await DidIonMethod.resolve({
                didUrl: `${this.identity.canonicalId}`
            });

            if (!resolved.didDocument) {
                await DidIonMethod.anchor({
                    services: [
                        ...services,
                        ...dwnOptions.services
                    ],
                    keySet: this.identity.keySet,
                    challengeEnabled,
                    challengeEndpoint,
                    operationsEndpoint,
                })
            }

            await writeFile(configFile, JSON.stringify({
                keySet: this.identity.keySet,
                services: [
                    ...services,
                    ...dwnOptions.services
                ]
            }, null, 2));
        }

        [this.signingKeyPair] = this.identity.keySet.verificationMethodKeys!;
        this.signingPrivateKey = (await Jose.jwkToKey({ key: this.signingKeyPair.privateKeyJwk! })).keyMaterial;

        const messageStore = new MessageStoreLevel({ blockstoreLocation: levelDbDir + '/MESSAGESSTORE', indexLocation: levelDbDir + '/INDEX' });
        const dataStore = new DataStoreLevel({ blockstoreLocation: levelDbDir + '/DATASTORE' });
        const eventLog = new EventLogLevel({ location: levelDbDir + '/EVENTLOG' });

        const dwn = await Dwn.create({ messageStore, dataStore, eventLog, tenantGate: PrivateTenantGate.create(this.identity.did) });
        this.dwn = dwn;

        try {
            this.service = new DwnHttpServer({
                dwn,
                handler: async (request: DwnRequest): Promise<DwnResponse | void> => {
                    // [kw] could use a has map of sorts instead of iterating every time
                    for (const { match, handler } of this.handlers) {
                        if (match(request))
                            return await handler(request)
                    }

                    throw new Error('Unable to find middleware')
                }
            });

            this.server = this.service.listen(port);
        } catch (e) {
            console.error(e);
        }
    }

    addHandler(match: IMatch, handler: IHandler) {
        this.handlers.push({ match, handler })
    }

    stop() {
        return new Promise<void>((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }

        })
    }

    getKeyId(did: string): string {
        const secondColonIndex = did.indexOf(':', 4); // start search for : from the method portion
        const methodSpecificId = did.substring(secondColonIndex + 1);
        const keyId = `${did}#${methodSpecificId}`;
        return keyId;
    }

    getSigner(): Signer {
        const privateKey = this.signingPrivateKey;
        return async function (data: Uint8Array): Promise<Uint8Array> {
            const signature = await Ed25519.sign({ data, key: privateKey });
            return signature;
        }
    }

    async createVC({ credentialSubject, subjectDid, type }: { credentialSubject: CredentialSubject, subjectDid: string, type: string }) {
        if (!this.identity) {
            throw new Error('Not initialized')
        }

        const vc1: VerifiableCredentialTypeV1 = {
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            id: uuidv4(),
            type: ['VerifiableCredential', type],
            issuer: this.identity.did,
            issuanceDate: utils.getCurrentXmlSchema112Timestamp(),
            credentialSubject
        };

        const keyId = this.getKeyId(this.identity.did);

        const verifiableCredentialJWT = await VerifiableCredential.create({
            kid: keyId,
            issuerDid: this.identity.did,
            subjectDid,
            signer: this.getSigner()
        }, undefined, vc1)

        return verifiableCredentialJWT;
    }

    decodeVC(verifiableCredentialJWT: string) {
        return VerifiableCredential.decode(verifiableCredentialJWT);
    }

    async verifyVC(verifiableCredentialJWT: string) {
        try {
            await VerifiableCredential.verify(verifiableCredentialJWT);
            return true;
        } catch (e) {
            return false;
        }
    }

    async createVP(createVpOptions: CreateVpOptions, subjectDid: string) {
        if (!this.identity) {
            throw new Error('Not initialized')
        }

        const keyId = this.getKeyId(this.identity.did);

        const verifiablePresentationJWT = await VerifiablePresentation.create({
            kid: keyId,
            issuerDid: this.identity.did,
            subjectDid,
            signer: this.getSigner()
        }, createVpOptions);

        return verifiablePresentationJWT;
    }

    decodeVP(verifiablePresentationJWT: string) {
        return VerifiablePresentation.decode(verifiablePresentationJWT);
    }

    async verifyVP(verifiablePresentationJWT: string) {
        try {
            await VerifiablePresentation.verify(verifiablePresentationJWT);
            return true;
        } catch (e) {
            return false;
        }
    }
}