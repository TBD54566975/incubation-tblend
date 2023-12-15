import { ServerApplicationState, server } from "@hapi/hapi";

import HapiSwagger from "hapi-swagger";
import Inert from "@hapi/inert";
import Vision from "@hapi/vision";

import { writeFile, readFile } from 'fs/promises';

import { DidIonMethod, DidService, PortableDid } from "@web5/dids";

import { routes } from "./api/routes";

import config from "./config";

export type CredentialRequestHandler = (presentation: object, issuerDid: string, subjectDid: string, kid: string, signer: Signer) => Promise<object>

export type CredentialType = {
    manifest: any,
    handler: CredentialRequestHandler
}

export type CustomServerApplicationState = ServerApplicationState & {
    credentials: CredentialType[],
    identity: PortableDid
}

export type ServiceOptions = {
    keyFile?: string,
    services?: DidService[],
    credentials: CredentialType[],
}

export type Signer = (data: Uint8Array) => Promise<Uint8Array>

export const service = server({
    address: "0.0.0.0",
    port: config.port,
    routes: {
        cors: true,
    },
});

// healthcheck route
service.route({
    method: "GET",
    path: "/",
    handler: () => {
        return "Ok";
    },
});

let stopping = false;

export const initDID = async (options: { keyFile: string, services: DidService[] }) => {

    let keyData;
    try {
        const keyFileString = (await readFile(options.keyFile)).toString();
        keyData = JSON.parse(keyFileString);
    } catch (e) {
        // keyData does not exist, proceed
    }

    let identity;

    if (keyData) {
        // recreate DID using existing config
        identity = await DidIonMethod.create({ services: keyData.services, keySet: keyData.keySet })
    } else {
        // create new DID
        identity = await DidIonMethod.create({
            services: options.services,
        });

        await writeFile(options.keyFile, JSON.stringify({
            did: identity.did,
            keySet: identity.keySet,
            services: options.services,
        }, null, 2));
    }

    return identity;
}

export const setup = async (options: ServiceOptions) => {
    const {
        keyFile = "./keys.json",
        services = [],
    } = options || {};

    await service.register([
        { plugin: Inert },
        { plugin: Vision },
        { plugin: HapiSwagger, options: config.swagger },
    ]);

    service.route(routes);

    const app = <CustomServerApplicationState>service.app;
    app.identity = await initDID({ keyFile, services });
    app.credentials = options.credentials;
};

//used for tests instead of start()
export const init = async (options: ServiceOptions) => {
    await setup(options);
    await service.initialize();
};

export const start = async (options: ServiceOptions) => {
    await setup(options);
    await service.start();

    console.log("Server running on %s", service.info.uri);
};

export const stop = async () => {
    if (!stopping) {
        console.log("Stopping server...");
        stopping = true;
        await service.stop();
        console.log("Server stopped.");
    }
}; 