import { Request, ResponseToolkit } from "@hapi/hapi";
import Joi from "joi";
import { CustomServerApplicationState, service } from "../service";

import { PresentationExchange } from "@web5/credentials";
import { getKeyId, getSigner, verifySignature } from "../lib/util";
import { DidIonMethod } from "@web5/dids";
import { JwkParamsOkpPublic, PrivateKeyJwk } from "@web5/crypto";
import { createHash } from "crypto";

export function generateRoutes(credentials: CustomServerApplicationState["credentials"]) {
    return [
        {
            method: "GET",
            path: "/api/credential-types",
            config: {
                handler: (req: Request, h: ResponseToolkit) => {
                    const app = <CustomServerApplicationState>req.server.app
                    return h.response(app.credentials.map(o => o.manifest.id)).type("application/json");
                },
                description: "Get the Credential types this service provides",
                tags: ["api", "credentials"],
            }
        },
        {
            method: "GET",
            path: "/api/{credentialType}/manifest",
            config: {
                handler: (req: Request, h: ResponseToolkit) => {
                    const app = <CustomServerApplicationState>req.server.app
                    const credentialType = req.params.credentialType;

                    const credentialTypeFound = app.credentials.find(o => o.manifest.id === credentialType)

                    if (!credentialTypeFound) {
                        return h.response("Not Found").code(404);
                    }

                    credentialTypeFound.manifest.issuer.id = app.identity.did;

                    return h.response(credentialTypeFound.manifest).type("application/json");
                },
                description: "Get the Credential Manifest",
                tags: ["api", "credentials"],
                validate: {
                    params: Joi.object({
                        credentialType: Joi.string().valid(credentials.map(o => o.manifest.id)).required(),
                    }),
                }
            }
        },
        {
            method: "POST",
            path: "/api/{credentialType}/application",
            config: {
                handler: async (req: Request, h: ResponseToolkit) => {
                    const app = <CustomServerApplicationState>req.server.app
                    const credentialType = req.params.credentialType;
                    const payload = req.payload as any;

                    const applicant = req.headers['x-request-applicant'];
                    const signature = req.headers['x-request-signature'];

                    const credentialTypeFound = app.credentials.find(o => o.manifest.id === credentialType)
                    if (!credentialTypeFound) {
                        return h.response("Not Found").code(404);
                    }

                    const resolved = await DidIonMethod.resolve({
                        didUrl: applicant
                    });

                    const didDocument = resolved?.didDocument;
                    if (!didDocument) {
                        return h.response("Could not resolve applicant DID").code(400);
                    }

                    if (!didDocument.verificationMethod || didDocument.verificationMethod.length === 0) {
                        return h.response("Applicant DID has no verification methods").code(400);
                    }

                    const publicKeyJwk = didDocument.verificationMethod[0].publicKeyJwk as JwkParamsOkpPublic;
                    if (!publicKeyJwk) {
                        return h.response("Applicant DID has no public key").code(400);
                    }

                    const sig = Buffer.from(signature, 'base64');
                    const hash = createHash('sha256').update(JSON.stringify(req.payload)).digest();

                    const verified = await verifySignature(publicKeyJwk, sig, hash);
                    if (!verified) {
                        console.error('Could not verify signature')
                        return h.response("Invalid signature").code(400);
                    }

                    // throws if credentials do not satisfy presentation definition
                    PresentationExchange.satisfiesPresentationDefinition(
                        payload.verifiableCredential as string[],
                        credentialTypeFound.manifest.presentation_definition
                    )

                    const response = await credentialTypeFound.handler(req.payload as object, applicant, app.identity.did, getKeyId(applicant), getSigner(app.identity.keySet.verificationMethodKeys![0].privateKeyJwk as PrivateKeyJwk));

                    return h.response(response);
                },
                description: "Request a credential using a Presentation Submission",
                tags: ["api", "credentials"],
                validate: {
                    headers: Joi.object({
                        "x-request-applicant": Joi.string().required(),
                        "x-request-signature": Joi.string().required(),
                    }).options({ allowUnknown: true }),
                    params: Joi.object({
                        credentialType: Joi.string().valid(credentials.map(o => o.manifest.id)).required(),
                    }),
                    payload: Joi.object({
                        "@context": Joi.array().items(Joi.string()).required(),
                        type: Joi.array().items(Joi.string()).required(),
                        presentation_submission: Joi.object({
                            id: Joi.string().required(),
                            definition_id: Joi.string().required(),
                            descriptor_map: Joi.array().items(Joi.object({
                                id: Joi.string().required(),
                                format: Joi.string().required(),
                                path: Joi.string().required(),
                            })).required(),
                        }).required(),
                        verifiableCredential: Joi.array().items(Joi.string()).required()
                    }),
                    failAction: async (req: Request, h: ResponseToolkit, err: Error) => {
                        console.error(err);
                        throw err;
                    }
                }
            }
        },
    ]
}