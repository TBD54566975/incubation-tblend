import { VcDataModel, VerifiableCredential } from '@web5/credentials';
import { Config } from '../core/config.js';

export type AdditionalProperties = Record<string, any>;

export type VerifiablePresentation = {
  id?: string;
  spec_version?: string;
  applicant?: string;
  manifest_id?: string;
  application_id?: string;
  response?: {
    id: string;
    path: string;
    format: string;
  };
  denial?: {
    reason: string;
  };
} & AdditionalProperties;

export type VcDataRequest = { vcs: VerifiableCredential[] } | null;

export type DcxConfigType = InstanceType<typeof Config>;

export type ManifestOutputDescriptor = {
  id: string;
  name: string;
  schema: string;
};


export type Issuer = {
  id: string;
  name: string;
};

export type Filter = {
  type: string;
  pattern: string;
};

export type Field = {
  path: string[];
  filter?: Filter;
};

export type Constraint = {
  fields: Field[];
};

export type InputDescriptor = {
  id: string;
  purpose: string;
  constraints: Constraint;
};

export type ManifestFormat = {
  jwt_vc: { alg: string[] }
};
export type PresentationDefinition = {
  id: string;
  input_descriptors: InputDescriptor[];
};

export interface CredentialManifest extends AdditionalProperties {
  id: string;
  name: string;
  description: string;
  spec_version: string;
  issuer: Issuer;
  output_descriptors: ManifestOutputDescriptor[];
  format: ManifestFormat;
  presentation_definition: PresentationDefinition;
};

export type VcVerification = {
  issuer: string;
  subject: string;
  vc: VcDataModel;
};

// Issuer
export interface TrustedIssuer extends AdditionalProperties {
  [key: string | number | symbol]: any;
  name: string;
  id: string;
}

// Handler
export type Handler = (...args: any[]) => any | Promise<any>;
export class HandlerType {
  constructor(public handler: Handler) { }
  call(...args: any[]): any | Promise<any> {
    return this.handler(...args);
  }
}

// Provider
export interface DataProvider extends AdditionalProperties {
  [key: string | number | symbol]: any;
  name: string;
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
};
export class Provider implements DataProvider {
  constructor(public name: string,
    public endpoint: string,
    public method?: string,
    public headers?: Record<string, string>) { }
}

// Manifest
export class Manifest implements CredentialManifest {
  constructor(public id: string,
    public name: string,
    public description: string,
    public spec_version: string,
    public issuer: Issuer,
    public output_descriptors: ManifestOutputDescriptor[],
    public format: ManifestFormat,
    public presentation_definition: PresentationDefinition) { }
}
export interface GatewayType extends AdditionalProperties {
  name: string;
  uri: string;
}
export class Gateway implements GatewayType {
  constructor(public name: string, public uri: string) { }
}

export type UseOption = Map<string | number | symbol, any>;

export type UseOptions = {
  [key: string]: any;
  issuers?: UseOption;
  handlers?: UseOption;
  providers?: UseOption;
  manifests?: UseOption;
  gateways?: UseOption;
}