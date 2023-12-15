let scheme = "https";
const externalHostname = process.env.EXTERNAL_HOSTNAME || "localhost";
const externalPort = parseInt(`${process.env.EXTERNAL_PORT}`) || 3000;
const serviceName = process.env.SERVICE_NAME || "verifiable-credential-issuer";

let swaggerHost = externalHostname;
if (externalPort !== 443) {
    swaggerHost = `${swaggerHost}:${externalPort}`;
}

const config = {
    externalHostname,
    port: Number(process.env.PORT) || 3000,
    swagger: {
        grouping: "tags",
        host: swaggerHost,
        info: {
            title: `${serviceName} Documentation`,
        },
        schemes: [scheme],
        jsonPath: "/api/swagger.json",
        documentationPath: "/api/documentation",
        swaggerUIPath: "/api/swaggerui",
    }
}

export default config; 