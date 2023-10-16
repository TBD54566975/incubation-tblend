import { RecordsWriteMessage } from '@tbd54566975/dwn-sdk-js'
import { DidIonMethod, DwnServiceEndpoint } from '@web5/dids'
import { createRequest, parseResponse } from './dwn-json-rpc.js'
import { DwnResponse } from './dwn-types.js'

export class DwnHttpClient {
    // TODO did resolver cache member variable

    resolveEndpoint = async (did: string): Promise<string> => {
        // TODO use resolver cache
        const doc = (await DidIonMethod.resolve({ didUrl: did })).didDocument
        if (!doc) throw new Error('Could not resolve did document for did ' + did);
        const service = doc.service?.find(x => x.type === 'DecentralizedWebNode');
        if (!service) throw new Error('Did document did not contain a DWN for did ' + did);
        return (service.serviceEndpoint as DwnServiceEndpoint).nodes[0];
    }

    send = async (target: string, message: RecordsWriteMessage, payload?: string): Promise<DwnResponse> => {
        const endpoint = await this.resolveEndpoint(target)

        const fetchOpts: {
            method: string;
            headers: { [key: string]: string };
            body?: string | ArrayBuffer | ArrayBufferView | Blob | FormData | URLSearchParams | ReadableStream<Uint8Array> | null | undefined;
        } = {
            method: 'POST',
            headers: {
                'dwn-request': JSON.stringify(createRequest(target, message)),
            },
        };

        if (payload) {
            fetchOpts.headers['content-type'] = 'application/octet-stream';
            fetchOpts.body = payload;
        }

        const res = await fetch(endpoint, fetchOpts)

        let dwnResponse: DwnResponse
        if (res.headers.has('dwn-response'))
            dwnResponse = parseResponse(JSON.parse(res.headers.get('dwn-response') as string))
        else
            dwnResponse = parseResponse(JSON.parse(await res.text()))

        return dwnResponse
    }
}