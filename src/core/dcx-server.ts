import { Web5PlatformAgent } from '@web5/agent';
import { Record, Web5 } from '@web5/api';
import { generateMnemonic } from 'bip39';
import { exit } from 'process';
import terminalLink from 'terminal-link';
import { Config, Objects } from '../index.js';
import { ProtocolHandlers } from '../protocol/handlers.js';
import { credentialIssuerProtocol } from '../protocol/index.js';
import {
  CredentialManifest,
  Gateway,
  Handler,
  Issuer,
  Manifest,
  Provider,
  UseOptions,
  UseOption
} from '../types/dcx.js';
import { DcxServerError } from '../utils/error.js';
import { FileSystem } from '../utils/file-system.js';
import { stringifier } from '../utils/json.js';
import { Logger } from '../utils/logger.js';
import { Time } from '../utils/time.js';
import { DidManager, Web5Manager } from './web5-manager.js';

const defaultConnectOptions = {
  sync: '30s',
  techPreview: {
    dwnEndpoints: Config.DWN_ENDPOINTS
  },
}

type UsePath = 'manifest' | 'handler' | 'provider' | 'issuer' | 'gateway';

export class DcxServer extends Config {
  [key: string]: any;

  isPolling: boolean;
  isInitialized?: boolean;

  issuers: UseOption;
  manifests: UseOption;
  providers: UseOption;
  handlers: UseOption;
  gateways: UseOption;

  constructor(options: UseOptions = {}) {
    super();

    this.isPolling = false;
    this.isInitialized = !!this.WEB5_CONNECT_RECOVERY_PHRASE;

    /**
     * Setup the Web5Manager and the DcxServer with the provided options
     */
    Web5Manager.issuers = this.issuers = options.issuers ?? new Map<string | number | symbol, Issuer>();
    Web5Manager.manifests = this.manifests = options.manifests ?? new Map<string | number | symbol, Manifest>();
    Web5Manager.providers = this.providers = options.providers ?? new Map<string | number | symbol, Provider>();
    Web5Manager.gateways = this.handlers = options.handlers ?? new Map<string | number | symbol, Handler>();
    ProtocolHandlers.handlers = this.gateways = options.gateways ?? new Map<string | number | symbol, Gateway>();
  }

  /**
   * 
   * @param path The type of server option; must be one of 'handler', 'providers', 'manifest', or 'issuer'
   * @param id Some unique, accessible identifier to map the obj to
   * @param obj The object to use; see {@link UseOption}
   * @example
   * import server from '@formfree/dcx';
   * server.use('issuer', 'mx', { name: 'MX Technologies', id: 'did:dht:sa713dw7jyg44ejwcdf8iqcseh7jcz51wj6fjxbooj41ipeg76eo' });
   * {
   *  "issuers": Map(1){ "mx" => { "name": "MX Technologies", "id": "did:dht:sa713dw7jyg44ejwcdf8iqcseh7jcz51wj6fjxbooj41ipeg76eo" } },
   *  "handlers": Map(1){ "hello" => () => console.log("Hello Web5!") },
   *  "providers": Map(1){ "local" => { "name": "localhost", "endpoint": "http://localhost:3000" } },
   *  "manifests": Map(1){ "EXAMPLE-MANIFEST" => { "id": "EXAMPLE-MANIFEST", "name": "DCX Credential Manifest Example" ... } }
   * }
   * 
   */
  public use(path: UsePath, id: string | number | symbol, obj: any): void {
    const validPaths = ['issuer', 'manifest', 'provider', 'handler', 'gateway'];
    if (!validPaths.includes(path)) {
      throw new DcxServerError(`Invalid server.use() name: ${path}. Must be one of: ${validPaths.join(', ')}`);
    }
    this[`${path}s`].set(id, obj);
  }

  /**
   * 
   * @param id Some unique, accessible identifier for the manifest
   * @param manifest The credential manifest to use
   */
  public useManifest(id: string | number | symbol, manifest: CredentialManifest): void {
    Web5Manager.manifests.set(id, manifest);
  }

  /**
   * 
   * @param id Some unique, accessible identifier for the handler
   * @param handler The handler to use
   */
  public useHandler(id: string | number | symbol, handler: Handler): void {
    ProtocolHandlers.handlers.set(id, handler)
  }

  /**
   * 
   * @param id Some unique, accessible identifier for the provider
   * @param provider The provider to use
   */
  public useProvider(id: string | number | symbol, provider: Provider): void {
    Web5Manager.providers.set(id, provider)
  }

  /**
   * 
   * @param id Some unique, accessible identifier for the issuer
   * @param issuer The issuer to use
   */
  public useIssuer(id: string | number | symbol, issuer: Issuer): void {
    Web5Manager.issuers.set(id, issuer);
  }

  /**
   * 
   * Creates a new password for the DCX server
   * @returns string
   */
  public async createPassword(): Promise<string> {
    try {
      const mnemonic = generateMnemonic(128).split(' ');
      const words: string[] = [];
      for (let i = 0; i < 6; i++) {
        const rand = Math.floor(Math.random() * mnemonic.length);
        words.push(mnemonic[rand]);
      }
      return words.join(' ');
    } catch (error: any) {
      Logger.error(DcxServer.name, error);
      throw error;
    }
  }

  /**
  * 
  * Configures the DCX server by creating a new password, initializing Web5,
  * connecting to the remote DWN and configuring the DWN with the DCX credential-issuer protocol
  * @returns Promise<void>
  */
  public async setup(): Promise<void> {
    try {
      if (!this.WEB5_CONNECT_PASSWORD) {
        Logger.security('No WEB5_CONNECT_PASSWORD detected!');
        Logger.security('New Web5 password saved to password.key')
        Logger.security('Be sure to set WEB5_CONNECT_PASSWORD in .env going forward')
        const password = await this.createPassword();
        this.WEB5_CONNECT_PASSWORD = password;
        Logger.debug('New password created', password);
        const overwritten = await FileSystem.overwrite('password.key', password);
        Logger.debug(`password.key overwritten ${overwritten}`, password);
      }

      Logger.debug('Initializing Web5 connection ... ');
      const web5ConnectOptions = !this.WEB5_CONNECT_RECOVERY_PHRASE
        ? {
          ...defaultConnectOptions,
          password: this.WEB5_CONNECT_PASSWORD
        } : {
          ...defaultConnectOptions,
          password: this.WEB5_CONNECT_PASSWORD,
          recoveryPhrase: this.WEB5_CONNECT_RECOVERY_PHRASE,
        };

      const {
        web5,
        did: connectedDid,
        recoveryPhrase: newPhrase
      } = await Web5.connect(web5ConnectOptions);

      const agent = web5.agent as Web5PlatformAgent

      const { did: connectedBearerDid } = await agent.identity.get({ didUri: connectedDid }) ?? {};
      if (!connectedBearerDid) {
        throw new DcxServerError('Failed to get bearer DID');
      }
      const connectedPortableDid = await connectedBearerDid.export()
      Web5Manager.connected = new DidManager(connectedDid, connectedBearerDid, connectedPortableDid);

      Web5Manager.web5 = web5;
      Web5Manager.agent = agent;

      if (!this.WEB5_CONNECT_RECOVERY_PHRASE && newPhrase) {
        Logger.info('First launch detected!')

        Logger.security('No WEB5_CONNECT_RECOVERY_PHRASE detected!')
        Logger.security('New Web5 recovery phrase saved to recovery.key');
        Logger.security(`Set WEB5_CONNECT_RECOVERY_PHRASE = ${newPhrase} to reuse Web5 data`);

        const recoveryKey = await FileSystem.overwrite('recovery.key', newPhrase);
        Logger.security(`recovery.key overwritten ${recoveryKey}`);

        Logger.info(
          'New Web5 connection created!',
          `\n    1. Agent DID ${terminalLink('Web5 User Agent', 'https://www.npmjs.com/package/@web5/user-agent')}; see agent.json` +
          `\n    2. Connected DID; see connected.json` +
          '\n    3. Recovery Phrase; see recovery.key'
        );

        const agentJson = await FileSystem.overwrite('agent.json', stringifier(await Web5Manager.agent.agentDid.export()));
        Logger.info(`agent.json overwritten ${agentJson} to ${agent.agentDid.uri}`);

        const conectionJson = await FileSystem.overwrite('connected.json', stringifier(Web5Manager.connected.portableDid));
        Logger.info(`connected.json overwritten ${conectionJson} to ${connectedPortableDid.uri}`);
      }

      this.isInitialized = true;
    } catch (error: any) {
      Logger.error(DcxServer.name, error);
      throw error;
    }
  }

  /**
   * 
   * Polls the DWN for incoming records
   * @returns void
   */
  public async poll(): Promise<void> {
    try {
      Logger.debug('DCX Server polling!');

      const DWN_CURSOR = Config.DWN_CURSOR;
      const DWN_LAST_RECORD_ID = Config.DWN_LAST_RECORD_ID;

      let cursor = await FileSystem.readToJson(DWN_CURSOR);
      const pagination = Objects.isEmptyObject(cursor) ? { limit: 10 } : { limit: 10, cursor };
      let lastRecordId = await FileSystem.readToString(DWN_LAST_RECORD_ID);

      while (this.isPolling) {
        const { records = [], cursor: nextCursor } = await Web5Manager.web5.dwn.records.query({
          message: {
            filter: {
              protocol: credentialIssuerProtocol.protocol,
            },
            pagination,
          },
        });

        Logger.debug(`Found ${records.length} records`);
        Logger.debug(`Next cursor ${stringifier(nextCursor)}`)

        if (cursor && !records.length) {
          cursor = undefined;
        }

        const recordIds = records.map((record: { id: any }) => record.id);

        const recordReads: Record[] = await Promise.all(
          recordIds.map(async (recordId: string) => {
            const { record }: { record: Record } = await Web5Manager.web5.dwn.records.read({
              message: {
                filter: {
                  recordId,
                },
              },
            });
            return record;
          }),
        );

        Logger.debug(`Read ${recordReads.length} records`);

        for (const record of recordReads) {

          if (record.id != lastRecordId) {

            if (record.protocolPath === 'application') {

              const applicationManifest = Object.values(this.manifests).find(
                (manifest: CredentialManifest) => manifest.presentation_definition.id === record.schema
              );

              if (!!applicationManifest) {
                await ProtocolHandlers.processApplicationRecord(record, applicationManifest);
              } else {
                Logger.debug(`Skipped message with protocol path ${record.protocolPath}`);
              }

              lastRecordId = record.id;
              const overwritten = await FileSystem.overwrite(DWN_LAST_RECORD_ID, lastRecordId);
              Logger.debug(`Overwritten last record id ${overwritten}`, lastRecordId);
            }
          } else {
            await Time.sleep();
          }
        }

        if (nextCursor) {
          Logger.debug('Updated cursor for next query', nextCursor);
          cursor = nextCursor;
          const overwritten = await FileSystem.overwrite(DWN_CURSOR, cursor);
          Logger.debug(`${DWN_CURSOR} overwritten ${overwritten}`, cursor);
        }

        if (!recordReads.length) {
          Logger.debug('No records found!', recordReads.length);
          await Time.sleep();
        }
      }
    } catch (error: any) {
      Logger.error(DcxServer.name, error);
      return error;
    }
  }

  /**
   * 
   * Stops the DCX server
   * @returns void
   */
  public stop(): void {
    Logger.debug('Server stopping...');
    this.isPolling = false;
    exit(0);
  }

  /**
   *  
   * Starts the DCX server
   * @returns void
   */
  public async start(): Promise<void> {
    try {
      await this.setup();
      Logger.debug('Web5 connection initialized', this.isInitialized);
    } catch (error: any) {
      Logger.error(DcxServer.name, 'Failed to setup DCX Server', error?.message);
      Logger.error(DcxServer.name, error);
      this.stop();
    }

    try {
      const success = await Web5Manager.setup();
      if (!success) {
        Logger.warn('Failed to setup DCX DWN');
      }
    } catch (error: any) {
      Logger.error(DcxServer.name, 'Failed to setup DCX DWN', error?.message);
      Logger.error(DcxServer.name, error);
      this.stop();
    }

    try {

      // Start polling for incoming records
      this.isPolling = true;
      await this.poll();
    } catch (error: any) {
      Logger.error(DcxServer.name, 'Polling error!', error?.message);
      Logger.error(DcxServer.name, error);
    }
  }
}



export default DcxServer;

const server = new DcxServer({});
export { server };