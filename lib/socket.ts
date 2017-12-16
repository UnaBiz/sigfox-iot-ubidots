//  UDP and TCP Socket API for Ubidots

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Declarations

//  Send UDP and TCP packets to this host and port.
const ubidotsHost = 'translate.ubidots.com';
const ubidotsPort = 9012;
let udpSocket = null;  //  The current UDP socket connection.

import { createSocket } from 'dgram';

//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Message Processing Code

export function wrap(scloud, api) {  //  scloud will be either sigfox-gcloud or sigfox-aws, depending on platform.
  //  Wrap the module into a function so that all we defer loading of dependencies,
  //  and ensure that cloud resources are properly disposed. For AWS, wrap() is called after
  //  all dependencies have been loaded.
  //  api is the Ubidots API - 'udp' or 'tcp'

  function init(req, allKeys0) {
    //  Init the Ubidots Socket API. Returns a promise.
    if (api === 'tcp') throw new Error(api + ' API not implemented yet');
    return Promise.resolve({ result: 'OK' });
  }

  function loadAllDevices(req) {
    //  Not used. Returns a promise.
    return Promise.resolve([]);
  }

  function getVariablesByDevice(req, allDevices0, device) {
    //  Not used. Returns a promise.
    return Promise.resolve([]);
  }

  function setVariables(req, device, allValues) {
    //  Set the Ubidots variables for the specified Ubidots device,
    //  for a single Ubidots client only.  allValues looks like:
    //  varname => {"value": "52.1", "timestamp": 1376056359000,
    //    "context": {"lat": 6.1, "lng": -35.1, "status": "driving"}}'
    //  The UDP or TCP message looks like
    //  sigfox-iot-ubidots|POST|A1E-ZvX3...e6Idw|2c30eb=>sw1:10$lat=1.31$lng=103.86,sw2:1@{timestamp}|end
    //  Returns a promise.
    if (!device || allValues.length === 0) return Promise.resolve(null);  //  No such device.
    //  Device label = sigfox-device-2c30eb.  TODO: Confirm
    const deviceLabel = ['sigfox-device-', device.toLowerCase()].join('');
    const context = null; // TODO: e.g. lat=1.31$lng=103.86
    let timestamp = null;
    // Compose fields = [ 'sw1:4$lat=1.31$lng=103.86', 'sw2:5' ];
    const fields = Object.keys(allValues).map((name) => {
      const value = allValues[name]; //  e.g.  {"value": "52.1", "timestamp": 1376056359000,"context": ...
      let field = [ //  e.g. sw1:4$lat=1.31$lng=103.86
        name,
        ':',
        value.value
      ];
      if (context) field = field.concat(['$', context]);
      if (!timestamp) timestamp = value.timestamp;
      return field.join('');
    });
    const deviceValues = [
      deviceLabel, // e.g. sigfox-device-2c30eb
      '=>',
      fields.join(','), // e.g. sw1:4$lat=1.31$lng=103.86,sw2:5
    ].concat(timestamp ? ['@', timestamp] : []).join('');
    const s = [
      'sigfox-iot-ubidots',
      'POST',
      process.env.UBIDOTS_TOKEN,  //  TODO: Get from metadata.
      deviceValues,
      'end'].join('|');
    const message = Buffer.from(s);
    const len = s.length;
    if (!udpSocket) udpSocket = createSocket('udp4');
    //  TODO: Check max size of UDP packet.
    return new Promise((resolve, reject) =>
      udpSocket.send(message, ubidotsPort, ubidotsHost,
        err => err ? reject(err) : resolve(err)))
      .then(result => scloud.log(req, 'sendUDP', { result, allValues, device, len }) && result)
      .catch((error) => { scloud.error(req, 'sendUDP', { error, allValues, device, len }); throw error; });

    /* client.send(message, ubidotsPort, ubidotsHost, (err) => {
      if (err) console.log('send udp', err.message, err.stack);
      client.close();
    }); */
  }

  //  Expose these functions outside of the wrapper.  task() is called to execute
  //  the wrapped function when the dependencies and the wrapper have been loaded.
  return {
    init,
    loadAllDevices,
    getVariablesByDevice,
    setVariables,
  };
}
