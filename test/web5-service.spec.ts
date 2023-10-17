import { assert } from 'chai'

import { Web5Service } from '../src/web5-service.js'
import { PresentationDefinition } from '@web5/credentials';

describe('Web5Service', () => {

  let web5service = new Web5Service();

  before(async () => {
    try {
      await web5service.start();
    } catch (e) {
      console.error(e);
    }
  })

  after(async () => {
    await web5service.stop();
  })

  it('should have an identity', () => {
    assert(web5service.identity !== null);
  })

  it('should create, verify, and decode credentials', async () => {
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
    'id': 'test-pd-id',
    'name': 'simple PD',
    'purpose': 'pd for testing',
    'input_descriptors': [
      {
        'id': 'whatever',
        'purpose': 'id for testing',
        'constraints': {
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