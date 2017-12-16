jest.setTimeout(600 * 1000);

const scloud = require('sigfox-gcloud');
const mod = require('./index').wrap(scloud);
const req = { unittest: true };

test('send sigfox message to ubidots', () => {
  const device = testDevice2;
  const msg = testMessage(Date.now(), device, 'number');
  const body = msg.body;
  return mod.task(req, device, body, msg)
    .then(res => console.log(JSON.stringify(res, null, 2))
      && expect(res).toBeTruthy());
});

/* eslint-disable quotes, max-len */
//  Test data: Send sensor data to these 2 device IDs from 2 different Ubidots accounts.
//  Assume that 'Sigfox Device 2C30EA' and 'Sigfox Device 2C30EB' have been created
//  in the first and second accounts respectively.
const testDevice1 = '2C30EA';
const testDevice2 = '2C30EB';
const testVariable = 'tmp';
const testValue = 28.2205;
const moduleName = 'sendToUbidots';

const testData = {  //  Structured msgs with numbers and text fields.
  number: '920e06272731741db051e600',
  text: '8013e569a0138c15c013f929',
};
const testBody = (timestamp: number, device: string, data: string) => ({
  deviceLat: 1.303224739957452,
  deviceLng: 103.86088826178306,
  data,
  ctr: 123,
  lig: 456,
  tmp: 36.9,
  longPolling: false,
  device,
  ack: false,
  station: "0000",
  avgSnr: 15.54,
  timestamp: `${timestamp}`,
  seqNumber: 1492,
  lat: 1,
  callbackTimestamp: timestamp,
  lng: 104,
  duplicate: false,
  datetime: "2017-05-07 14:30:51",
  baseStationTime: Math.floor(timestamp / 1000),
  snr: 18.86,
  seqNumberCheck: null,
  rssi: -123,
  uuid: "ab0d40bd-dbc5-4076-b684-3f610d96e621",
});
const testMessage = (timestamp, device, data) => ({
  history: [
    {
      duration: 0,
      end: timestamp,
      timestamp,
      function: "sigfoxCallback",
      latency: null,
    },
  ],
  query: {
    type: moduleName,
  },
  route: [],
  device,
  body: testBody(timestamp, device, data),
  type: moduleName,
});
/* eslint-enable quotes, max-len */

/*
    "transform": {
      "^.+\\.tsx?$": "ts-jest"
    },
"transformIgnorePatterns": [
  "<rootDir>/node_modules/(?!@foo)"
],
*/