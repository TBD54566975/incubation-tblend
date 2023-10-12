import { CreateVpOptions, CredentialSubject, VerifiableCredential, VerifiableCredentialTypeV1, VerifiablePresentation, utils } from '@web5/credentials';
import { Ed25519, Jose } from '@web5/crypto';
import { DidIonMethod, PortableDid, DidService } from '@web5/dids';

import { v4 as uuidv4 } from 'uuid';

import { writeFile, readFile } from 'fs/promises';

const VC_MIME_TYPE = "application/vc+jwt";

type Signer = (data: Uint8Array) => Promise<Uint8Array>;

export default class Web5Service {
    public identity: null | PortableDid;
    public signingKeyPair: any;
    private signingPrivateKey: any;

    constructor() {
        this.identity = null;
    }

    async init({anchor, services}:{anchor?: boolean, services?: DidService[]}) {
        let keySetString;
        try {
            const keySetBuffer = await readFile("./keySet.json");
            keySetString = keySetBuffer.toString();
        } catch (e) {
            // key does not exist
        }

        if (keySetString) {
            // recreate DID using existing key material
            this.identity = await DidIonMethod.create({anchor, services, keySet: JSON.parse(keySetString)})
        } else {
            // create new DID
            this.identity = await DidIonMethod.create({anchor, services});
            await writeFile("./keySet.json", JSON.stringify(this.identity.keySet, null, 2));
        }

        [this.signingKeyPair] = this.identity.keySet.verificationMethodKeys!;
        this.signingPrivateKey = (await Jose.jwkToKey({ key: this.signingKeyPair.privateKeyJwk! })).keyMaterial;
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