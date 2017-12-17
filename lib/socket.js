"use strict";
//  UDP and TCP Socket API for Ubidots
//  To use this, environment variable UBIDOTS_API should be set to 'udp',
//  UBIDOTS_TOKEN should set to a comma-separated list of Ubidots Tokens (not Ubidots API Keys).
Object.defineProperty(exports, "__esModule", { value: true });
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Declarations
//  Send UDP and TCP packets to this host and port.
const ubidotsHost = 'translate.ubidots.com';
const ubidotsPort = 9012;
let udpSocket = null; //  The current UDP socket connection.
let ubidotsTokens = null; //  All Ubidots API Tokens.
const dgram_1 = require("dgram");
//  //////////////////////////////////////////////////////////////////////////////////// endregion
//  region Message Processing Code
function wrap(scloud, api) {
    //  Wrap the module into a function so that all we defer loading of dependencies,
    function init(req, allKeys0) {
        //  Init the Ubidots Socket API. Returns a promise.
        if (api === 'tcp')
            throw new Error(api + ' API not implemented yet');
        const tokens = process.env.UBIDOTS_TOKEN;
        if (!tokens)
            throw new Error('UBIDOTS_TOKEN should be defined in environment');
        ubidotsTokens = tokens.split(','); //  TODO: Get from metadata.
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
        if (!device || allValues.length === 0)
            return Promise.resolve(null); //  No such device.
        //  Device label = sigfox-device-2c30eb.  TODO: Confirm
        const deviceLabel = ['sigfox-device-', device.toLowerCase()].join('');
        const context = null; // TODO: e.g. lat=1.31$lng=103.86
        let timestamp = null;
        // Compose fields = [ 'sw1:4$lat=1.31$lng=103.86', 'sw2:5' ];
        const fields = Object.keys(allValues).map((name) => {
            const value = allValues[name]; //  e.g.  {"value": "52.1", "timestamp": 1376056359000,"context": ...
            let field = [
                name,
                ':',
                value.value
            ];
            if (context)
                field = field.concat(['$', context]);
            if (!timestamp)
                timestamp = value.timestamp;
            return field.join('');
        });
        const deviceValues = [
            deviceLabel,
            '=>',
            fields.join(','),
        ].concat(timestamp ? ['@', timestamp] : []).join('');
        //  Send message to each Ubidots account.
        ubidotsTokens.forEach(ubidotsToken => {
            const s = [
                'sigfox-iot-ubidots',
                'POST',
                ubidotsToken,
                deviceValues,
                'end'
            ].join('|');
            const message = Buffer.from(s);
            const len = s.length;
            if (!udpSocket)
                udpSocket = dgram_1.createSocket('udp4');
            //  TODO: Check max size of UDP packet.
            return new Promise((resolve, reject) => udpSocket.send(message, ubidotsPort, ubidotsHost, err => err ? reject(err) : resolve(err)))
                .then(result => scloud.log(req, 'sendUDP', { result, s, allValues, device, len }) && result)
                .catch((error) => { scloud.error(req, 'sendUDP', { error, s, allValues, device, len }); throw error; });
        });
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
exports.wrap = wrap;
//# sourceMappingURL=socket.js.map