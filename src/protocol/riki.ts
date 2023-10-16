export const rikiProtocol = {
    message: {
        definition: {
            protocol: 'https://tblend.io/protocol/riki',
            published: false,
            types: {
                rikiCreateRequest: {
                    schema: 'https://tblend.io/protocol/riki/create-request.schema.json',
                    dataFormats: ['application/json'],
                },
                rikiCreateResponse: {
                    schema: 'https://tblend.io/protocol/riki/create-response.schema.json',
                    dataFormats: ['application/json'],
                },
                rikiDecryptRequest: {
                    schema: 'https://tblend.io/protocol/riki/decrypt-request.schema.json',
                    dataFormats: ['application/json'],
                },
                rikiDecryptResponse: {
                    schema: 'https://tblend.io/protocol/riki/decrypt-response.schema.json',
                    dataFormats: ['application/json'],
                },
                rikiReportRequest: {
                    schema: 'https://tblend.io/protocol/riki/report-request.schema.json',
                    dataFormats: ['application/json'],
                },
                rikiReportResponse: {
                    schema: 'https://tblend.io/protocol/riki/report-response.schema.json',
                    dataFormats: ['application/json'],
                },
            },
            structure: {
                rikiCreateRequest: {
                    $actions: [
                        {
                            who: 'recipient',
                            of: 'rikiCreateRequest',
                            can: 'read'
                        }
                    ]
                },
                rikiCreateResponse: {
                    $actions: [
                        {
                            who: 'recipient',
                            of: 'rikiCreateResponse',
                            can: 'read'
                        }
                    ]
                },
                rikiDecryptRequest: {
                    $actions: [
                        {
                            who: 'recipient',
                            of: 'rikiDecryptRequest',
                            can: 'read'
                        }
                    ]
                },
                rikiDecryptResponse: {
                    $actions: [
                        {
                            who: 'recipient',
                            of: 'rikiDecryptResponse',
                            can: 'read'
                        }
                    ]
                },
                rikiReportRequest: {
                    $actions: [
                        {
                            who: 'recipient',
                            of: 'rikiReportRequest',
                            can: 'read'
                        }
                    ]
                },
                rikiReportResponse: {
                    $actions: [
                        {
                            who: 'recipient',
                            of: 'rikiReportResponse',
                            can: 'read'
                        }
                    ]
                },
            },
        },
    },
}