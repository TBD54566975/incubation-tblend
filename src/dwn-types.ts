import type { Readable } from 'node:stream'
import type { UnionMessageReply, RecordsQueryMessage, RecordsWriteMessage, ProtocolsConfigureOptions, ProtocolsQueryOptions, ProtocolsConfigureDescriptor, ProtocolsConfigureMessage } from '@tbd54566975/dwn-sdk-js'


type Status = {
  code: number
  detail: string
};

export type GenericMessageReply = {
  status: Status;
};

export type DwnMessage = RecordsQueryMessage | RecordsWriteMessage

export type DwnRequest = {
  target?: string,
  message: DwnMessage,
  payload?: Readable | any
}

export type DwnResponse = {
  reply: UnionMessageReply
  payload?: Readable
}

export interface IMatch {
  (req: DwnRequest): boolean
}
export interface IHandler {
  (dwnRequest: DwnRequest): Promise<void | DwnResponse>
}
export interface IMatchHandler {
  match: IMatch
  handler: IHandler
}

export type ProcessDwnResponse = {
  message?: unknown;
  messageCid?: string;
  reply: UnionMessageReply;
};

export type ProcessDwnRequest = {
  author: string;
  target: string;
  messageType: string;
  dataStream?: Blob | ReadableStream | Readable;
  messageOptions: unknown;
  store?: boolean;
};

export type ProtocolsConfigureRequest = {
  message: Omit<ProtocolsConfigureOptions, 'authorizationSigner'>;
}

export type ProtocolsConfigureResponse = {
  status: UnionMessageReply['status'];
  protocol?: Protocol;
}

export type ProtocolsQueryRequest = {
  from?: string;
  message: Omit<ProtocolsQueryOptions, 'authorizationSigner'>
}

export type ProtocolsQueryResponse = {
  protocols: Protocol[];
  status: UnionMessageReply['status'];
}

export type ProtocolsQueryReplyEntry = {
  descriptor: ProtocolsConfigureDescriptor;
};

export type Signer = (data: Uint8Array) => Promise<Uint8Array>;

export interface Signer2 {
  /**
   * The ID of the key used by this signer.
   * This needs to be a fully-qualified ID (ie. prefixed with DID) so that author can be parsed out for processing such as `recordId` computation.
   * Example: did:example:alice#key1
   * This value will be used as the "kid" parameter in JWS produced.
   * While this property is not a required property per JWS specification, it is required for DWN authentication.
   */
  keyId: string

  /**
   * The name of the signature algorithm used by this signer.
   * This value will be used as the "alg" parameter in JWS produced.
   * This parameter is not used by the DWN but is unfortunately a required header property for a JWS as per:
   * https://datatracker.ietf.org/doc/html/rfc7515#section-4.1.1
   * Valid signature algorithm values can be found at https://www.iana.org/assignments/jose/jose.xhtml
   */
  algorithm: string;

  /**
   * Signs the given content and returns the signature as bytes.
   */
  sign(content: Uint8Array): Promise<Uint8Array>;
}

export type ProtocolMetadata = {
  author: string;
  messageCid?: string;
};

export type DwnResponse2 = {
  message?: unknown;
  messageCid?: string;
  reply: UnionMessageReply;
};

export class Protocol {
  private _metadata: ProtocolMetadata;
  private _protocolsConfigureMessage: ProtocolsConfigureMessage;

  get definition() {
    return this._protocolsConfigureMessage.descriptor.definition;
  }

  constructor(protocolsConfigureMessage: ProtocolsConfigureMessage, metadata: ProtocolMetadata) {
    this._metadata = metadata;
    this._protocolsConfigureMessage = protocolsConfigureMessage;
  }

  toJSON() {
    return this._protocolsConfigureMessage;
  }
}

/**
 * An entry of the `signatures` array in a general JWS.
 */
export type SignatureEntry = {
  /**
   * The "protected" member MUST be present and contain the value
   * BASE64URL(UTF8(JWS Protected Header)) when the JWS Protected
   * Header value is non-empty; otherwise, it MUST be absent.  These
   * Header Parameter values are integrity protected.
   */
  protected: string

  /**
   * The "signature" member MUST be present and contain the value
   * BASE64URL(JWS Signature).
   */
  signature: string
};