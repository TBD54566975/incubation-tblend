
import {
    DwnPaginationCursor,
    DwnResponseStatus,
    Web5PlatformAgent
} from '@web5/agent';
import {
    Protocol,
    ProtocolsConfigureResponse,
    ProtocolsQueryResponse,
    Record,
    RecordsCreateResponse,
    Web5
} from '@web5/api';
import {
    BearerDid,
    DidDht,
    DidDhtCreateOptions,
    DidRegistrationResult,
    DidResolutionResult,
    PortableDid,
} from '@web5/dids';
import { readFile } from 'fs/promises';
import { credentialIssuerProtocol, manifestSchema } from '../protocol/index.js';
import { CredentialManifest, UseOption } from '../types/dcx.js';
import { DwnUtils } from '../utils/dwn.js';
import { DcxDwnError, DwnError } from '../utils/error.js';
import { Logger } from '../utils/logger.js';
import { Config } from './config.js';

/**
 * DidManager handles interactions between the DCX server and the DID
 */
export class DidManager {
    public did: string;
    public bearerDid: BearerDid;
    public portableDid: PortableDid;

    constructor(did: string, bearerDid: BearerDid, portableDid: PortableDid) {
        this.did = did;
        this.bearerDid = bearerDid;
        this.portableDid = portableDid;
    }

    /**
     *
     * Uses DidDht to create BearerDid; see {@link DidDht.create()}
     * @param options The did dht create options object; see {@link DidDhtCreateOptions}
     * @returns BearerDid; see {@link BearerDid}
     */
    public async createBearerDid(options: DidDhtCreateOptions<any>): Promise<BearerDid> {
        this.bearerDid = await DidDht.create({ options });
        return this.bearerDid;
    }

    /**
     *
     * Uses DidDht and a didUri to resolve the corresponding didDocument; see {@link DidDht.resolve()}
     * @param didUri the uri to resolve
     * @returns DidResolutionResult; see {@link DidResolutionResult}
     */
    public async resolveDidDoc(didUri: string): Promise<DidResolutionResult> {
        return await DidDht.resolve(didUri);
    }

    /**
     *
     * @param gatewayUri the uri of the gateway to publish the did to
     * @returns DidRegistrationResult; see {@link DidRegistrationResult}
     */
    public async publishDidDoc(
        gatewayUri: string = Config.DHT_GATEWAY_ENDPOINT,
    ): Promise<DidRegistrationResult> {
        return await DidDht.publish({ did: this.bearerDid, gatewayUri });
    }

    /**
     *
     * Uses DidDht to handle importing a portable did bearer did; see {@link DidDht.import()}
     * @param didFilepath the path to the file containing the portable did object; see {@link PortableDid}
     * @returns BearerDid; see {@link BearerDid}
     */
    public async importPortableDidFromFile(didFilepath: string): Promise<BearerDid> {
        const didFileString = (await readFile(didFilepath))?.toString();
        this.portableDid = JSON.parse(didFileString);
        return await this.importPortableDid(this.portableDid);
    }

    /**
     * Uses DidDht to handle instantiating bearer did from corresponding portable did; see {@link DidDht.import()}
     * @param portableDid a portable did object; see {@link PortableDid}
     * @returns BearerDid; see {@link BearerDid}
     */
    public async importPortableDid(portableDid: PortableDid): Promise<BearerDid> {
        this.bearerDid = await DidDht.import({ portableDid: this.portableDid ?? portableDid });
        return this.bearerDid;
    }
}


/**
 * DWN manager handles interactions between the DCX server and the DWN
 */
export class DwnManager {

    /**
     * 
     * Query DWN for credential-issuer protocol
     * @returns Protocol[]; see {@link Protocol}
     */
    public static async queryIssuerProtocols(): Promise<ProtocolsQueryResponse> {
        try {
            // Query DWN for credential-issuer protocol
            const { status: query, protocols = [] } = await Web5Manager.web5.dwn.protocols.query({
                message: {
                    filter: {
                        protocol: credentialIssuerProtocol.protocol,
                    },
                },
            });

            if (DwnUtils.isFailure(query.code)) {
                const { code, detail } = query;
                Logger.error(`${this.name}: DWN protocols query failed`, query);
                throw new DwnError(code, detail);
            }

            Logger.debug(`DWN has ${protocols.length} protocols available`);
            return { status: query, protocols };
        } catch (error: any) {
            Logger.error(`${this.name}: Failed to query DWN protocols`, error);
            throw error;
        }
    }

    /**
     * 
     * Configure DWN for credential-issuer protocol
     * @returns DwnResponseStatus; see {@link DwnResponseStatus}
     */
    public static async configureIssuerProtocols(): Promise<ProtocolsConfigureResponse> {
        try {
            const { status: configure, protocol } = await Web5Manager.web5.dwn.protocols.configure({
                message: { definition: credentialIssuerProtocol },
            });

            if (DwnUtils.isFailure(configure.code) || !protocol) {
                const { code, detail } = configure;
                Logger.error('DWN protocol configure fail', configure, protocol);
                throw new DwnError(code, detail);
            }

            const { status: send } = await protocol.send(Web5Manager.connected.did);

            if (DwnUtils.isFailure(send.code)) {
                const { code, detail } = send;
                Logger.error('DWN protocols send failed', send);
                throw new DwnError(code, detail);
            }

            Logger.debug('Sent protocol to remote DWN', send);
            return { status: send, protocol };
        } catch (error: any) {
            Logger.error(`${this.name}: Failed to configure DWN protocols`, error);
            throw error;
        }
    }

    /**
     *
     * Query DWN for manifest records
     * @returns Record[]; see {@link Record}
     */
    public static async queryManifestRecords(): Promise<DwnResponseStatus & { records: Record[], cursor?: DwnPaginationCursor }> {
        try {
            const { status, records: manifestRecords = [], cursor } = await Web5Manager.web5.dwn.records.query({
                message: {
                    filter: {
                        schema: manifestSchema.$id,
                        dataFormat: 'application/json',
                        protocol: credentialIssuerProtocol.protocol,
                        protocolPath: 'manifest',
                    },
                },
            });

            if (DwnUtils.isFailure(status.code)) {
                const { code, detail } = status;
                Logger.error('DWN manifest records query failed', status);
                throw new DwnError(code, detail);
            }

            return { status, records: manifestRecords, cursor };
        } catch (error: any) {
            Logger.warn(error)
            throw error;
        }
    }

    /**
   *
   * Filter manifest records
   * @param manifestRecords Record[]; see {@link Record}
   * @returns CredentialManifest[]; see {@link CredentialManifest}
   */
    public static async readManifestRecordsData(manifestRecords: Record[]): Promise<{ manifests: CredentialManifest[] }> {
        try {
            const manifests = await Promise.all(
                manifestRecords.map(async (manifestRecord) => {
                    const { record } = await Web5Manager.web5.dwn.records.read({
                        message: {
                            filter: {
                                recordId: manifestRecord.id,
                            },
                        },
                    });
                    return record.data.json();
                }),
            );
            return { manifests }
        } catch (error: any) {
            Logger.error(`${this.name}: Failed to filter dwn manifest records`, error);
            throw error;
        }
    }

    /**
    *
    * Filter manifest records
    * @param manifestReads CredentialManifest[]; see {@link CredentialManifest}
    * @returns CredentialManifest[]; see {@link CredentialManifest}
    */
    public static async filterManifestRecords(manifestReads: CredentialManifest[]): Promise<CredentialManifest[]> {
        try {
            return manifestReads.filter(manifestRead => Object.values(Web5Manager.manifests).find(
                (manifest: CredentialManifest) => manifest.id === manifestRead.id)
            );
        } catch (error: any) {
            Logger.error(`${this.name}: Failed to filter dwn manifest records`, error);
            throw error;
        }
    }

    /**
     *
     * Create missing manifest record
     * @param unwrittenManifest CredentialManifest; see {@link CredentialManifest}
     * @returns Record | undefined; see {@link Record}
     */
    public static async createMissingManifest(unwrittenManifest: CredentialManifest): Promise<RecordsCreateResponse> {
        try {
            unwrittenManifest.issuer.id = Web5Manager.connected.did;
            const { record, status: create } = await Web5Manager.web5.dwn.records.create({
                store: false,
                data: unwrittenManifest,
                message: {
                    schema: manifestSchema.$id,
                    dataFormat: 'application/json',
                    protocol: credentialIssuerProtocol.protocol,
                    protocolPath: 'manifest',
                    published: true,
                },
            });

            if (DwnUtils.isFailure(create.code)) {
                const { code, detail } = create;
                Logger.error('Failed to create missing manifest record', create);
                throw new DwnError(code, detail);
            }

            if (!record) {
                throw new DcxDwnError(`Failed to create missing dwn manifest record: ${unwrittenManifest.id}`);
            }

            const { status: send } = await record.send(Web5Manager.connected.did);

            if (DwnUtils.isFailure(send.code)) {
                const { code, detail } = send;
                Logger.error(`${this.name}: Failed to send dwn manifest record`, send);
                throw new DwnError(code, detail);
            }

            Logger.debug(`Sent protocol to remote dwn`, send);
            return { status: send, record };
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * 
     * Create missing manifests
     * @param missingManifests CredentialManifest[]; see {@link CredentialManifest}
     * @returns Record[]; see {@link Record}
     */
    public static async createManifestRecords(missingManifests: CredentialManifest[]): Promise<Record[]> {
        try {
            const createdManifestRecords = await Promise.all(
                missingManifests.map(
                    async (unwrittenManifest: CredentialManifest) =>
                        (await Web5Manager.createMissingManifest(unwrittenManifest))?.record,
                ),
            );
            return createdManifestRecords.filter((record?: Record) => record !== undefined) as Record[];
        } catch (error: any) {
            Logger.error(`${this.name}: Failed to create manifest records`, error);
            throw error;
        }
    }



    /**
     * 
     * Setup DWN with DCX protocol
     * @returns boolean
     */
    public static async setup(): Promise<boolean> {
        const useManifests = Web5Manager.manifests.keys();
        try {
            Logger.log('Setting up dwn ...')
            const { protocols } = await Web5Manager.queryIssuerProtocols();
            Logger.log(`Found ${protocols.length} dcx issuer protocol(s) in dwn`, protocols);

            if (!protocols.length) {
                Logger.log('Configuring dwn with dcx issuer protocol ...');
                const { status, protocol } = await Web5Manager.configureIssuerProtocols();
                Logger.debug(`Configured credential issuer protocol in dwn: ${status.code} - ${status.detail}`, protocol);
            }

            const { records } = await Web5Manager.queryManifestRecords();
            Logger.log(`Found ${records.length} dwn manifest records`);

            const { manifests } = await Web5Manager.readManifestRecordsData(records);
            Logger.debug(`Read ${manifests.length} manifest records`, manifests);

            if (!manifests.length) {
                const manifestRecords = await Web5Manager.createManifestRecords(manifests);
            } else {
                // Logger.log(`${unwrittenManifests.length} unwritten manifests exist`, unwrittenManifests);

                // const manifestsToCreate = !unwrittenManifests.length ? manifests : [unwrittenManifests];
                // const manifestRecords = await Web5Manager.createManifestRecords(unwrittenManifests);
                // Logger.log(`Created ${manifestRecords.length} records`, manifestRecords);
            }


            // Logger.debug(`Found ${missingManifests.length} unwritten manifests`);
            Logger.log("DWN setup complete!")
            return true;
        } catch (error: any) {
            Logger.error(`${this.name} failed!`, error);
            throw error;
        }
    }
}

/**
 * Web5Manager handles interactions between the DCX server and the Web5 platform
 */
export class Web5Manager extends DwnManager {
    static [key: string]: any;

    public static web5: Web5;
    public static connected: DidManager;
    public static agent: Web5PlatformAgent;

    public static manifests: UseOption;
    public static providers: UseOption;
    public static issuers: UseOption;
    public static gateways: UseOption;

    constructor() {
        super();
    }

    public static get(type: string): any {
        return this[type];
    }

    public static set(type: string, obj: any): any {
        return this[type].set(obj);
    }
}