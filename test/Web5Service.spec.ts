import { assert } from 'chai'

import Web5Service from '../src/Web5Service.js'
import { PresentationDefinition } from '@web5/credentials';

describe('Web5Service', () => {

    it('should create, verify, and decode credentials', async () => {
        const web5service = new Web5Service();
        await web5service.init({});

        const vcJwt = await web5service.createVC({
            credentialSubject: { test: true },
            subjectDid: "",
            type: 'TestCredential'
        })

        const verified = await web5service.verifyVC(vcJwt);

        assert(verified == true, 'JWT VC not verified')

        const decoded = web5service.decodeVC(vcJwt);

        assert(decoded.payload.iss == web5service.identity?.did)
    })

    it('should create, verify, and decode presentations', async () => {
        const web5service = new Web5Service();
        await web5service.init({});

        const vcJwt = await web5service.createVC({
            credentialSubject: { test: true },
            subjectDid: "",
            type: 'TestCredential'
        })

        const vpJWT = await web5service.createVP({
            verifiableCredentialJwts: [vcJwt],
            presentationDefinition: createPresentationDefinition()
        }, "")

        const verified = await web5service.verifyVP(vpJWT);

        assert(verified == true, 'JWT VP not verified')

        const decoded = web5service.decodeVP(vpJWT);

        assert(decoded.payload.iss == web5service.identity?.did)
    })
})

function createPresentationDefinition(): PresentationDefinition {
    return {
      'id'                : 'test-pd-id',
      'name'              : 'simple PD',
      'purpose'           : 'pd for testing',
      'input_descriptors' : [
        {
          'id'          : 'whatever',
          'purpose'     : 'id for testing',
          'constraints' : {
            'fields': [
              {
                'path': [
                  '$.credentialSubject.test',
                ]
              }
            ]
          }
        }
      ]
    };
  }