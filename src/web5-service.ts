import { CreateVpOptions, CredentialSubject, VerifiableCredential, VerifiableCredentialTypeV1, VerifiablePresentation, utils } from '@web5/credentials';
import { Ed25519, Jose } from '@web5/crypto';
import { DidIonMethod, PortableDid, DidService, DidKeySetVerificationMethodKey } from '@web5/dids';
import { DataStoreLevel, Dwn, DwnInterfaceName, DwnMethodName, EventLogLevel, EventsGet, Jws, Message, MessageStoreLevel, MessagesGet, ProtocolsConfigure, ProtocolsConfigureMessage, ProtocolsQuery, RecordsDelete, RecordsQuery, RecordsRead, RecordsWrite, RecordsWriteOptions, UnionMessageReply } from '@tbd54566975/dwn-sdk-js'
import { v4 as uuidv4 } from 'uuid';
import { writeFile, readFile } from 'fs/promises';

import { ReadableWebToNodeStream } from 'readable-web-to-node-stream';

import { PrivateTenantGate } from './private-tenant-gate.js';
import { DwnHttpServer } from './dwn-http-server.js';
import { DwnHttpClient } from './dwn-http-client.js';

import { Protocol, type DwnRequest, type DwnResponse, type IHandler, type IMatch, type IMatchHandler, type ProtocolsConfigureRequest, type ProtocolsConfigureResponse, ProtocolsQueryRequest, ProcessDwnRequest, ProcessDwnResponse, Signer, Signer2, GenericMessageReply, SignatureEntry } from './dwn-types.js';
import type { Readable } from 'readable-stream';

import { Server } from "http"
export class Web5Service {
    public identity: null | PortableDid;
    public signingKeyPair: DidKeySetVerificationMethodKey | undefined;

    public signingPrivateKey: any;
    public dwn: null | Dwn;

    public service: null | DwnHttpServer;
    public client: DwnHttpClient;

    public server: null | Server;

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

    getJwsSignerDid(signatureEntry: SignatureEntry) {
        return Jws.getSignerDid(signatureEntry);
    }

    addHandler(match: IMatch, handler: IHandler) {
        this.handlers.push({ match, handler })
    }

    async configureProtocol(request: ProtocolsConfigureRequest): Promise<ProtocolsConfigureResponse> {
        const dwnResponse = await this.processDwnRequest({
            target: `${this.identity?.did}`,
            author: `${this.identity?.did}`,
            messageOptions: request.message,
            messageType: DwnInterfaceName.Protocols + DwnMethodName.Configure
        });

        const { message, messageCid, reply: { status } } = dwnResponse;
        const response: ProtocolsConfigureResponse = { status };

        if (status.code < 300) {
            const metadata = { author: `${this.identity?.did}`, messageCid };
            response.protocol = new Protocol(message as ProtocolsConfigureMessage, metadata);
        }

        return response;
    }

    async queryProtocol(request: ProtocolsQueryRequest) {
        const agentRequest = {
            author: `${this.identity?.did}`,
            messageOptions: request.message,
            messageType: DwnInterfaceName.Protocols + DwnMethodName.Query,
            target: request.from || `${this.identity?.did}`
        };

        return this.processDwnRequest(agentRequest);
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

    messageReplyFromError(e: unknown, code: number): GenericMessageReply {
        const detail = e instanceof Error ? e.message : 'Error';
        return { status: { code, detail } };
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
        await VerifiableCredential.verify(verifiableCredentialJWT);
        return true;
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
        await VerifiablePresentation.verify(verifiablePresentationJWT);
        return true;
    }

    async processDwnRequest(request: ProcessDwnRequest): Promise<ProcessDwnResponse> {
        const { message, dataStream } = await this.constructDwnMessage({ request });

        let reply: UnionMessageReply;
        if (request.store !== false && this.dwn) {
            reply = await this.dwn.processMessage(`${request.target}`, message, dataStream);
        } else {
            reply = { status: { code: 202, detail: 'Accepted' } };
        }

        return {
            reply,
            message: message,
            messageCid: await Message.getCid(message)
        };
    }

    private async constructDwnMessage(options: {
        request: ProcessDwnRequest
    }) {
        const { request } = options;

        let readableStream: Readable | undefined;

        // TODO: Consider refactoring to move data transformations imposed by fetch() limitations to the HTTP transport-related methods.
        if (request.messageType === 'RecordsWrite') {
            const messageOptions = request.messageOptions as RecordsWriteOptions;

            if (request.dataStream && !messageOptions.data) {
                const { dataStream } = request;
                let isomorphicNodeReadable: Readable;

                if (dataStream instanceof Blob) {
                    isomorphicNodeReadable = blobToIsomorphicNodeReadable(dataStream);
                    readableStream = blobToIsomorphicNodeReadable(dataStream);

                } else if (dataStream instanceof ReadableStream) {
                    const [forCid, forProcessMessage] = dataStream.tee();
                    isomorphicNodeReadable = webReadableToIsomorphicNodeReadable(forCid);
                    readableStream = webReadableToIsomorphicNodeReadable(forProcessMessage);
                }

                // @ts-ignore
                messageOptions.dataCid = await Cid.computeDagPbCidFromStream(isomorphicNodeReadable);
                // @ts-ignore
                messageOptions.dataSize ??= isomorphicNodeReadable['bytesRead'];
            }
        }

        const dwnAuthorizationSigner = await this.constructDwnAuthorizationSigner(request.author);

        const messageCreator = dwnMessageCreators[request.messageType];
        const dwnMessage = await messageCreator.create({
            ...<any>request.messageOptions,
            authorizationSigner: dwnAuthorizationSigner
        });

        return { message: dwnMessage.toJSON(), dataStream: readableStream };
    }

    private async constructDwnAuthorizationSigner(author: string): Promise<Signer2> {
        if (!this.identity) {
            throw new Error('Not initialized')
        }

        const alg = this.signingKeyPair?.privateKeyJwk?.alg
        if (alg === undefined) {
            throw Error(`No algorithm provided to sign with key`);
        }

        return {
            keyId: this.getKeyId(this.identity?.did) + '#dwn-sig',
            algorithm: alg,
            sign: this.getSigner()
        };
    }
}

const dwnMessageCreators = {
    [DwnInterfaceName.Events + DwnMethodName.Get]: EventsGet,
    [DwnInterfaceName.Messages + DwnMethodName.Get]: MessagesGet,
    [DwnInterfaceName.Records + DwnMethodName.Read]: RecordsRead,
    [DwnInterfaceName.Records + DwnMethodName.Query]: RecordsQuery,
    [DwnInterfaceName.Records + DwnMethodName.Write]: RecordsWrite,
    [DwnInterfaceName.Records + DwnMethodName.Delete]: RecordsDelete,
    [DwnInterfaceName.Protocols + DwnMethodName.Query]: ProtocolsQuery,
    [DwnInterfaceName.Protocols + DwnMethodName.Configure]: ProtocolsConfigure,
};

export function webReadableToIsomorphicNodeReadable(webReadable: ReadableStream<any>) {
    return new ReadableWebToNodeStream(webReadable);
}

export function blobToIsomorphicNodeReadable(blob: Blob): Readable {
    return webReadableToIsomorphicNodeReadable(blob.stream() as ReadableStream<any>);
}