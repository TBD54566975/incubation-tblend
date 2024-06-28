import { Record } from '@web5/api';
import {
  PresentationExchange,
  VerifiableCredential,
  VerifiablePresentation
} from '@web5/credentials';
import { Config } from '../core/config.js';
import { Web5Manager } from '../core/index.js';
import {
  AdditionalProperties,
  CredentialManifest,
  Issuer,
  UseOption,
  VcVerification
} from '../types/dcx.js';
import { DwnUtils } from '../utils/dwn.js';
import { DcxProtocolHandlerError, DwnError } from '../utils/error.js';
import { stringifier } from '../utils/index.js';
import { Logger } from '../utils/logger.js';
import { credentialIssuerProtocol, responseSchema } from './index.js';


export class ProtocolHandlerUtils {
  public static handlers: UseOption;
  /**
   *
   * Verify DCX application VCs
   * @param vp Dcx application VCs for review and verification; see {@link VerifiablePresentation}
   * @param recordAuthor Dwn Record author; see {@link Record.author}
   */
  public static async verifyCredentials(vp: VerifiablePresentation, recordAuthor: string): Promise<VcVerification[]> {
    try {
      const valid = [];
      const credentials = vp.verifiableCredential;
      for (const credential of credentials) {
        // Parse VC
        const vc = VerifiableCredential.parseJwt({ vcJwt: credential });
        Logger.debug('Parsed verifiable credential', stringifier(credential));

        // Check if credential subject matches record author; i.e. verify that the credential holder is the one submitting the application 
        if (vc.subject !== recordAuthor) {
          throw new DcxProtocolHandlerError(
            `Credential subject ${vc.subject} does not match record author ${recordAuthor}`,
          );
        }

        if (!Config.VC_TRUSTED_ISSUER_DIDS.includes(vc.issuer)) {
          throw new DcxProtocolHandlerError(`Credential issuer ${vc.issuer} not trusted`,);
        }

        const verify = await VerifiableCredential.verify({ vcJwt: credential });
        valid.push(verify);
      }
      return valid;
    } catch (error) {
      Logger.error(this.name, error);
      throw error;
    }
  }

}
export class ProtocolHandlers extends ProtocolHandlerUtils {
  constructor() {
    super();
  }
  /**
   * 
   * Processes an application record
   * @param record 
   * @param manifest 
   */
  public static async processApplicationRecord(applicationRecord: Record, manifest: CredentialManifest) {
    try {
      Logger.debug('Processing application record', stringifier(applicationRecord));
      // applications are JSON VP
      const vp: VerifiablePresentation = await applicationRecord.data.json();
      Logger.debug('Application record verifiable presentation', stringifier(vp));

      const recordAuthor = applicationRecord.author;

      const valid = await ProtocolHandlers.verifyCredentials(vp, recordAuthor);
      if (!valid) {
        throw new DcxProtocolHandlerError('Credential invalid');
      }

      const data = await ProtocolHandlers.issueVerifiableCredential(vp, recordAuthor, manifest);

      const { record, status: create } = await Web5Manager.web5.dwn.records.create({
        data,
        store: false,
        message: {
          schema: responseSchema.$id,
          protocol: credentialIssuerProtocol.protocol,
          dataFormat: 'application/json',
          protocolPath: 'application/response',
        },
      });

      if (DwnUtils.isFailure(create.code)) {
        const { code, detail } = create;
        Logger.error(`${this.name}: DWN records create failed`, create);
        throw new DwnError(code, detail);
      }

      if (!record) {
        throw new DcxProtocolHandlerError('Failed to create application response record.');
      }

      const { status: send } = await record?.send(recordAuthor);
      Logger.debug(`${this.name}: Sent application response to applicant DWN`, send, create);
    } catch (error: any) {
      Logger.error(this.name, error);
      throw error;
    }
  }

  /**
   * 
   * Issue a Verifiable Credential
   * @param subjectDid 
   * @param vp 
   * @param credentialManifest 
   * @returns 
   */
  public static async issueVerifiableCredential(
    vp: VerifiablePresentation,
    subjectDid: string,
    credentialManifest?: CredentialManifest,
    manifestId?: string,
  ) {

    if (!manifestId && !credentialManifest) {
      throw new DcxProtocolHandlerError('Must provide either manifest or manifest name');
    }

    const manifest = !!manifestId ? Web5Manager.manifests.get(manifestId) : credentialManifest as CredentialManifest;

    if (!manifest) {
      throw new DcxProtocolHandlerError('Manifest not found');
    }

    // filter valid creds
    Logger.debug('Parsing verfiable credentials against verifiable presentation', stringifier(vp));
    const selectedCredentials: string[] = PresentationExchange.selectCredentials({
      vcJwts: vp.verifiableCredential,
      presentationDefinition: manifest.presentation_definition,
    });
    Logger.debug(`Found ${selectedCredentials.length} Verifiable Credentials`);

    try {
      PresentationExchange.satisfiesPresentationDefinition({
        vcJwts: selectedCredentials,
        presentationDefinition: manifest.presentation_definition
      });
    } catch (error: any) {
      Logger.debug(`VCs do not satisfy Presentation Definition`, error.message);
    }

    const useIssuers = Object.values(Web5Manager.issuers).map((issuer: Issuer) => issuer.id);
    const issuerDidSet = new Set<string>([...useIssuers, ...Config.VC_TRUSTED_ISSUER_DIDS]);

    const verifiedCredentials: VerifiableCredential[] = [];

    for (const vcJwt of selectedCredentials) {

      Logger.debug('Parsing VC', vcJwt);
      const vc = VerifiableCredential.parseJwt({ vcJwt });

      Logger.debug('Parsed VC', stringifier(vc));
      if (vc.subject !== subjectDid) {
        continue;
      }

      Logger.debug('vcJson', vc.vcDataModel.credentialSubject);
      if (issuerDidSet.has(vc.vcDataModel.issuer as string)) {
        verifiedCredentials.push(vc);
      }

    }

    Logger.debug(`Found ${verifiedCredentials.length} valid VCs`);

    // request vc data
    const vcData = await ProtocolHandlers.requestVerifiableCredentialData({ vcs: verifiedCredentials });
    Logger.debug('VC data from provider', stringifier(vcData));

    // generate vc
    const outputVc = await VerifiableCredential.create({
      type: Config.VC_NAME,
      issuer: Web5Manager.connected.did,
      subject: subjectDid,
      data: vcData,
    });

    // sign vc
    const signedOutputVc = await outputVc.sign({ did: Web5Manager.connected.bearerDid });

    return {
      fulfillment: {
        descriptor_map: [
          {
            id: manifest.output_descriptors[0].id,
            format: 'jwt_vc',
            path: '$.verifiableCredential[0]',
          },
        ],
      },
      verifiableCredential: [signedOutputVc],
    };
  }

  /**
   *
   * @param body
   * @param method
   * @param headers
   * @returns
   */
  public static async requestVerifiableCredentialData(
    body: { vcs: VerifiableCredential[] },
    method: string = 'POST',
    headers: AdditionalProperties = { 'Content-Type': 'application/json' },
  ) {
    Logger.debug(`Requesting VC data from ${Config.VC_DATA_PROVIDER} at ${Config.VC_DATA_PROVIDER_ENDPOINT}`);

    const response = await fetch(Config.VC_DATA_PROVIDER_ENDPOINT, {
      method,
      headers,
      body: stringifier(body),
    });
    Logger.debug('VC request response', stringifier(response));

    const data = await response.json();
    Logger.debug('VC request data', stringifier(data));

    return data;
  }
}