import { TenantGate } from '@tbd54566975/dwn-sdk-js'


export class PrivateTenantGate implements TenantGate {
    private tenantDid: string;

    private constructor(did: string) {
        this.tenantDid = did;
    }

    public static create(did: string) {
        return new PrivateTenantGate(did);
    }

    public async isTenant(did: string): Promise<boolean> {
        // Custom implementation
        if (did !== this.tenantDid) {
            console.log('Recieved a message for non-tenant did ' + did);
        }
        return did === this.tenantDid;
    }
}