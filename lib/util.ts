import { Ed25519, PrivateKeyJwk, PublicKeyJwk } from "@web5/crypto";

export function getKeyId(did: string): string {
    const secondColonIndex = did.indexOf(':', 4); // start search for : from the method portion
    const methodSpecificId = did.substring(secondColonIndex + 1);
    const keyId = `${did}#${methodSpecificId}`;
    return keyId;
}

export function getSigner(privateKey: PrivateKeyJwk) {
    return async function (data: Uint8Array): Promise<Uint8Array> {
        const signature = await Ed25519.sign({ data, key: privateKey });
        return signature;
    }
}

export async function verifySignature(publicKey: PublicKeyJwk, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
    return await Ed25519.verify({ data, key: publicKey, signature });
}