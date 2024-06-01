import { schema as responseSchema } from '../schemas/response.js';
import { schema as invoiceSchema } from '../schemas/invoice.js';
import { schema as manifestSchema } from '../schemas/manifest.js';
import { schema as presentationSchema } from '../schemas/presentation.js';

export const protocol = {
  // issuer protocol is a subset of issuance protocol
  "protocol": "https://tblend.io/protocol/credential-issuance",
  "published": false,
  "types": {
    "application": {
      "schema": presentationSchema.$id,
      "dataFormats": ["application/json"]
    },
    "invoice": {
      "schema": invoiceSchema.$id,
      "dataFormats": ["application/json"]
    },
    "manifest": {
      "schema": manifestSchema.$id,
      "dataFormats": ["application/json"]
    },
    "response": {
      "schema": responseSchema.$id,
      "dataFormats": ["application/json"]
    },
  },
  "structure": {
    // issuers publish manifests to describe the data they can provide
    "manifest": {
      "$actions": [
        {
          "who": "anyone",
          "can": ["read"]
        }
        // TODO: discussion adding new action here: {"who": "author","can": ["create", "update"]}
      ]
    },
    // applicants can apply for a credential
    "application": {
      "$actions": [
        {
          "who": "anyone",
          "can": ["create", "update"]
        }
      ],
      // a credential response might be sent in response to an application
      "response": {
        "$actions": [
          {
            "who": "recipient",
            "of": "application",
            "can": ["create", "update"]
          },
          {
            "who": "author",
            "of": "application",
            "can": ["read"]
          }
        ]
      },
      // an invoice might be sent in response to an application
      "invoice": {
        "$actions": [
          {
            "who": "recipient",
            "of": "application",
            "can": ["create", "update"]
          },
          {
            "who": "author",
            "of": "application",
            "can": ["read"]
          }
        ]
      },
    }
  }
}